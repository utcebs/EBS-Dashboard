// EBS-Dashboard AI Edge Function (Deno) — runs on Supabase, holds the API keys
// as secrets so nothing is exposed in the browser. Accepts { system, prompt,
// tier } and returns { text, provider }. Tries Gemini (multi-key + model
// fallback), then falls back to Groq if all Gemini keys are exhausted/failing.
//
// Deploy:  supabase functions deploy ai
// Secrets: supabase secrets set GEMINI_API_KEY=... [GEMINI_API_KEY_2=... GEMINI_API_KEY_3=...] [GROQ_API_KEY=...]

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Tiered Gemini model fallback chains (cheap → strong).
const CHAINS: Record<string, string[]> = {
  light: ["gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"],
  heavy: ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"],
}

function geminiKeys(): string[] {
  const keys = [
    Deno.env.get("GEMINI_API_KEY"),
    Deno.env.get("GEMINI_API_KEY_2"),
    Deno.env.get("GEMINI_API_KEY_3"),
  ].filter(Boolean) as string[]
  // Also accept a comma-separated GEMINI_API_KEYS bundle.
  const bundle = Deno.env.get("GEMINI_API_KEYS")
  if (bundle) keys.push(...bundle.split(",").map((k) => k.trim()).filter(Boolean))
  return [...new Set(keys)]
}

async function callGemini(model: string, key: string, system: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
  const body = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 1400 },
  }
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`gemini ${res.status}: ${txt.slice(0, 200)}`)
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? ""
  if (!text) throw new Error("gemini empty response")
  return text
}

async function callGroq(system: string, prompt: string): Promise<string> {
  const key = Deno.env.get("GROQ_API_KEY")
  if (!key) throw new Error("no GROQ_API_KEY configured")
  const model = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile"
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 1400,
    }),
  })
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ""
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS })

  try {
    const { system = "", prompt = "", tier = "light" } = await req.json()
    if (!prompt) return new Response(JSON.stringify({ error: "prompt required" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } })

    const keys = geminiKeys()
    const chain = CHAINS[tier] || CHAINS.light
    let lastErr = ""

    // Try every (key × model) combination before giving up on Gemini.
    for (const key of keys) {
      for (const model of chain) {
        try {
          const text = await callGemini(model, key, system, prompt)
          return new Response(JSON.stringify({ text, provider: "gemini" }), { headers: { ...CORS, "content-type": "application/json" } })
        } catch (e) {
          lastErr = String(e)
        }
      }
    }

    // All Gemini failed/exhausted → Groq backup.
    try {
      const text = await callGroq(system, prompt)
      return new Response(JSON.stringify({ text, provider: "groq" }), { headers: { ...CORS, "content-type": "application/json" } })
    } catch (e) {
      lastErr = `${lastErr} | groq: ${e}`
    }

    return new Response(JSON.stringify({ error: "all providers failed", detail: lastErr.slice(0, 400) }), { status: 502, headers: { ...CORS, "content-type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, "content-type": "application/json" } })
  }
})
