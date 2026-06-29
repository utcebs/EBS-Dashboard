import React, { useState, useRef, useEffect } from 'react'
import { Pencil, Check, X, Upload } from 'lucide-react'

// Reusable inline-edit primitives used on the landing page.
// When `isAdmin` is true, hovering over an editable block reveals a pencil.
// Clicking the pencil switches to an edit view (input / textarea / file picker)
// with Save / Cancel. On Save, parent's `onSave(newValue)` is invoked —
// parent is responsible for persisting via the authenticated `supabase` client.

export function EditableText({
  value,
  multiline = false,
  isAdmin,
  onSave,
  className = '',
  placeholder = 'Click to edit',
  as: Tag = 'p',
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setDraft(value || '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  if (!isAdmin) {
    return <Tag className={className}>{value || placeholder}</Tag>
  }

  if (editing) {
    const commit = async () => {
      setSaving(true)
      try { await onSave(draft); setEditing(false) }
      catch (e) { console.error('Save failed:', e); alert('Save failed: ' + e.message) }
      finally { setSaving(false) }
    }
    const cancel = () => { setDraft(value || ''); setEditing(false) }

    return (
      <div className="relative">
        {multiline ? (
          <textarea
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={4}
            className={`w-full px-3 py-2 rounded-lg border-2 border-brand-400 bg-white text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-200 ${className}`}
          />
        ) : (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border-2 border-brand-400 bg-white text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-200 ${className}`}
          />
        )}
        <div className="flex gap-2 mt-2">
          <button onClick={commit} disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 disabled:opacity-50">
            <Check size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={cancel} disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 border border-surface-300 rounded-lg text-xs font-medium text-surface-600 hover:bg-surface-50">
            <X size={14} /> Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative inline-block w-full">
      <Tag className={className}>{value || <span className="text-surface-400">{placeholder}</span>}</Tag>
      <button
        onClick={() => setEditing(true)}
        className="absolute -top-2 -right-2 p-1.5 bg-brand-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
        title="Edit"
      >
        <Pencil size={12} />
      </button>
    </div>
  )
}

// Upload an image to Supabase Storage and report the public URL.
// Parent provides `supabase` (authenticated client) + `bucket` + onSave(url).
export function EditableImage({
  src,
  alt,
  isAdmin,
  supabase,
  bucket = 'team-photos',
  pathPrefix = '',
  onSave,
  fallback = null,
  className = '',
  imgClassName = '',
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${pathPrefix}${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
      await onSave(publicUrl)
    } catch (err) {
      console.error('Upload failed:', err)
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className={`relative group ${className}`}>
      {src ? (
        <img src={src} alt={alt} className={imgClassName} />
      ) : (
        fallback
      )}
      {isAdmin && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
            title="Upload photo"
          >
            {uploading ? (
              <span className="text-xs font-medium">Uploading…</span>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload size={20} />
                <span className="text-[10px] font-medium">Change photo</span>
              </div>
            )}
          </button>
        </>
      )}
    </div>
  )
}
