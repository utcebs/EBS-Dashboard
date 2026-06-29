#!/usr/bin/env node
// ============================================================
// CLONE SCRIPT — Source Supabase → Target Supabase
// ------------------------------------------------------------
// Reads ALL rows from each table in the source project using
// the source service_role key, then UPSERTs them into the
// target project using the target service_role key.
// Also clones the team-photos storage bucket.
//
// Source key: READ-ONLY usage (only .select() and storage downloads)
// Target key: write usage (upsert + storage upload)
//
// Usage:
//   Set env vars and run: node scripts/clone.mjs
//   Required: SOURCE_URL, SOURCE_KEY, TARGET_URL, TARGET_KEY
// ============================================================

import { createClient } from '@supabase/supabase-js'

const { SOURCE_URL, SOURCE_KEY, TARGET_URL, TARGET_KEY } = process.env

if (!SOURCE_URL || !SOURCE_KEY || !TARGET_URL || !TARGET_KEY) {
  console.error('Missing required env vars: SOURCE_URL, SOURCE_KEY, TARGET_URL, TARGET_KEY')
  process.exit(1)
}

// Per-table config. Order = dependency order (parents first).
// - conflict:     column(s) for upsert ON CONFLICT
// - deleteSeed:   target has seeded rows from setup_target.sql; wipe before insert
const TABLE_CONFIG = [
  // Independent / parent tables
  { name: 'projects',              conflict: 'id' },
  { name: 'landing_page_content',  conflict: 'id' },
  { name: 'app_settings',          conflict: 'key',                deleteSeed: true },
  { name: 'support_subcategories', conflict: 'name',               deleteSeed: true },
  { name: 'testing_subcategories', conflict: 'name',               deleteSeed: true },
  { name: 'project_subcategories', conflict: 'name',               deleteSeed: true },
  { name: 'employee_leaves',       conflict: 'id' },
  { name: 'war_day_ranges',        conflict: 'id' },
  // Categories tree — wipe child before parent so the parent delete cascades cleanly,
  // then re-insert in dep order (categories → subcategories).
  { name: 'subcategories',         conflict: 'category_id,name',   deleteSeed: true, skipInsert: true },
  { name: 'categories',            conflict: 'name',               deleteSeed: true },
  { name: 'subcategories',         conflict: 'category_id,name',   skipFetch: true, useStash: true },
  // Badges tree — same pattern: wipe user_badges first, then badges, then re-insert both.
  { name: 'user_badges',           conflict: 'user_id,badge_id',   deleteSeed: true, skipInsert: true },
  { name: 'badges',                conflict: 'id',                 deleteSeed: true },
  { name: 'user_badges',           conflict: 'user_id,badge_id',   skipFetch: true, useStash: true },
  // Children of projects
  { name: 'milestones',            conflict: 'id',                 filterCols: true },
  { name: 'risks',                 conflict: 'id' },
  { name: 'delay_reasons',         conflict: 'id',                 retryFetchOnMissing: true },
  // priority_tasks BEFORE task_logs because task_logs.priority_task_id → priority_tasks.id
  { name: 'priority_tasks',        conflict: 'id',                 filterCols: true },
  { name: 'task_logs',             conflict: 'id',                 filterCols: true },
]

const STORAGE_BUCKETS = [
  { name: 'team-photos', public: true },
]

const source = createClient(SOURCE_URL, SOURCE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const target = createClient(TARGET_URL, TARGET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// In-memory cache of fetched source rows, keyed by table name.
// Used so subcategories (handled twice — once to know what to wipe,
// once to re-insert) doesn't re-fetch.
const stash = {}

function logStep(msg) { console.log(`\n▶ ${msg}`) }
function logResult(msg) { console.log(`  ✓ ${msg}`) }
function logSkip(msg) { console.log(`  ⊘ ${msg}`) }
function logWarn(msg) { console.log(`  ⚠ ${msg}`) }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchAll(client, table, pageSize = 1000) {
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await client.from(table).select('*').range(from, from + pageSize - 1)
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function deleteAllRows(client, table) {
  // Two strategies depending on PK type. Use a tautology that matches everything.
  // .neq on a column-it-can't-equal works as a "delete all".
  const { error } = await client.from(table).delete().not('ctid', 'is', null)
  if (error) {
    // Fallback: try with a generic always-true filter using a likely-existing column
    const { error: e2 } = await client.from(table).delete().gte('created_at', '1970-01-01')
    if (e2) {
      // Final fallback: select then delete by key (slow but works)
      logWarn(`deleteAllRows(${table}): primary methods failed (${error.message}); trying row-by-row`)
      const rows = await fetchAll(client, table)
      for (const row of rows) {
        if (row.id !== undefined) {
          await client.from(table).delete().eq('id', row.id)
        } else if (row.key !== undefined) {
          await client.from(table).delete().eq('key', row.key)
        }
      }
    }
  }
}

// Insert rows, retrying on "column X does not exist" by stripping the offender.
// Also retries on "schema cache" errors with backoff.
async function smartUpsert(table, rows, conflict, opts = {}) {
  let attempt = 0
  let workingRows = rows
  while (true) {
    attempt += 1
    const { error } = await target.from(table).upsert(workingRows, { onConflict: conflict })
    if (!error) return { ok: true, attempts: attempt }
    const msg = error.message || ''

    // Schema cache miss — retry up to 5x with backoff
    if (/schema cache|could not find the table/i.test(msg) && opts.retryOnMissing && attempt < 6) {
      logWarn(`schema cache miss for ${table}, waiting 5s and retrying (attempt ${attempt})`)
      await sleep(5000)
      continue
    }

    // Column doesn't exist — strip it and retry
    const colMatch = msg.match(/Could not find the '([^']+)' column/i) || msg.match(/column "([^"]+)" of relation/i)
    if (colMatch && opts.filterCols) {
      const badCol = colMatch[1]
      logWarn(`stripping unknown column '${badCol}' from ${table} rows`)
      workingRows = workingRows.map(r => {
        const { [badCol]: _, ...rest } = r
        return rest
      })
      continue
    }

    return { ok: false, error: msg }
  }
}

async function copyProfilesWithAuthUsers() {
  logStep('Copying profiles (with auth.users placeholders)')
  const profiles = await fetchAll(source, 'profiles')
  logResult(`fetched ${profiles.length} profile rows from source`)

  let authCreated = 0, authSkipped = 0
  for (const p of profiles) {
    const placeholderEmail = `clone-${p.id.slice(0, 8)}@ebs-upgrade.local`
    const { error } = await target.rpc('clone_auth_user', { p_id: p.id, p_email: placeholderEmail })
    if (error) { logWarn(`auth.users for ${p.id}: ${error.message}`); authSkipped += 1 }
    else authCreated += 1
  }
  logResult(`auth.users: ${authCreated} created, ${authSkipped} failed`)

  const { error } = await target.from('profiles').upsert(profiles, { onConflict: 'id' })
  if (error) logWarn(`profiles upsert: ${error.message}`)
  else logResult(`upserted ${profiles.length} profile rows`)
}

async function fetchAllWithRetry(client, table, retry) {
  let attempt = 0
  while (true) {
    attempt += 1
    try {
      return await fetchAll(client, table)
    } catch (e) {
      const msg = e.message || ''
      if (retry && /schema cache|could not find the table/i.test(msg) && attempt < 6) {
        logWarn(`source schema cache miss for ${table}, waiting 5s and retrying (attempt ${attempt})`)
        await sleep(5000)
        continue
      }
      throw e
    }
  }
}

async function copyTable(config) {
  const { name, conflict, deleteSeed, skipFetch, useStash, skipInsert, filterCols, retryFetchOnMissing } = config
  logStep(`Copying table: ${name}${skipInsert ? ' (wipe-only pass)' : ''}`)

  // Step 1: fetch source rows (or pull from stash)
  let rows
  if (skipFetch && useStash && stash[name]) {
    rows = stash[name]
    logResult(`using ${rows.length} stashed rows`)
  } else {
    try {
      rows = await fetchAllWithRetry(source, name, retryFetchOnMissing)
      stash[name] = rows
      logResult(`fetched ${rows.length} rows from source`)
    } catch (e) {
      logSkip(`source has no '${name}' or fetch failed: ${e.message}`)
      return
    }
  }

  // Step 2: wipe target's seed data if needed
  if (deleteSeed) {
    await deleteAllRows(target, name)
    logResult(`wiped existing rows from target.${name}`)
  }

  // Step 3: skip insert if this is a wipe-only pass (re-insert happens later)
  if (skipInsert) {
    logResult(`wipe-only pass; ${rows.length} rows stashed for later re-insert`)
    return
  }

  // Step 4: no rows? Nothing to do.
  if (rows.length === 0) {
    logResult('nothing to copy')
    return
  }

  // Step 5: upsert with smart retry
  const result = await smartUpsert(name, rows, conflict, { filterCols })
  if (result.ok) {
    logResult(`copied ${rows.length} rows`)
  } else {
    logWarn(`failed to copy ${name}: ${result.error}`)
  }
}

async function ensureBucket(bucket) {
  const { data } = await target.storage.getBucket(bucket.name)
  if (data) return
  const { error } = await target.storage.createBucket(bucket.name, { public: bucket.public })
  if (error) logWarn(`createBucket(${bucket.name}): ${error.message}`)
  else logResult(`created bucket '${bucket.name}' (public=${bucket.public})`)
}

async function listAllFiles(client, bucket, prefix = '') {
  const results = []
  const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error) { logWarn(`list ${bucket}/${prefix}: ${error.message}`); return results }
  for (const entry of data || []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.id === null) {
      const nested = await listAllFiles(client, bucket, path)
      results.push(...nested)
    } else {
      results.push(path)
    }
  }
  return results
}

async function copyBucket(bucket) {
  logStep(`Copying storage bucket: ${bucket.name}`)
  await ensureBucket(bucket)
  const files = await listAllFiles(source, bucket.name)
  logResult(`source has ${files.length} files`)

  let copied = 0, failed = 0
  for (const path of files) {
    const { data: blob, error: dlErr } = await source.storage.from(bucket.name).download(path)
    if (dlErr) { logWarn(`download ${path}: ${dlErr.message}`); failed += 1; continue }
    const buffer = Buffer.from(await blob.arrayBuffer())
    const { error: ulErr } = await target.storage.from(bucket.name).upload(path, buffer, {
      upsert: true,
      contentType: blob.type || 'application/octet-stream',
    })
    if (ulErr) { logWarn(`upload ${path}: ${ulErr.message}`); failed += 1 }
    else copied += 1
  }
  logResult(`copied ${copied} files (${failed} failed)`)
}

async function rewriteAvatarUrls() {
  logStep('Rewriting avatar_url: source host → target host')
  const sourceHost = new URL(SOURCE_URL).host
  const targetHost = new URL(TARGET_URL).host
  const { data } = await target.from('profiles').select('id, avatar_url').like('avatar_url', `%${sourceHost}%`)
  let updated = 0
  for (const row of data || []) {
    const newUrl = row.avatar_url.replace(sourceHost, targetHost)
    const { error } = await target.from('profiles').update({ avatar_url: newUrl }).eq('id', row.id)
    if (!error) updated += 1
  }
  logResult(`rewrote ${updated} avatar_url values`)
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  Supabase Clone: source → target                        ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log(`Source: ${SOURCE_URL}`)
  console.log(`Target: ${TARGET_URL}`)

  await copyProfilesWithAuthUsers()
  for (const config of TABLE_CONFIG) {
    await copyTable(config)
  }
  for (const bucket of STORAGE_BUCKETS) {
    await copyBucket(bucket)
  }
  await rewriteAvatarUrls()

  console.log('\n══════════════════════════════════════════════════════════')
  console.log('  ✓ Clone complete')
  console.log('══════════════════════════════════════════════════════════')
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
