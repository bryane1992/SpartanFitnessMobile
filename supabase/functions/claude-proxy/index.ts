// GritOS Claude API Proxy
// Runs as a Supabase Edge Function — API key stays server-side
// Client sends user token + message, proxy validates auth + forwards to Anthropic

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Coach message limits per week by tier
const RATE_LIMITS: Record<string, number> = {
  free: 0,       // no coach access — gated in UI, enforced here as safety net
  pro: 20,
  elite: 999999,
}

Deno.serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    // 1. Authenticate user via Supabase JWT
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization token' }), { status: 401 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })
    }

    // 2. Parse request body
    const body = await req.json()
    const { model, system, messages, max_tokens, skip_rate_limit } = body

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request: messages required' }), { status: 400 })
    }

    // 3. Rate limiting (skipped for plan generation and plan review)
    if (!skip_rate_limit) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('subscription_tier')
        .eq('id', user.id)
        .single()

      const tier = profile?.subscription_tier || 'free'
      const limit = RATE_LIMITS[tier] ?? RATE_LIMITS.free

      if (limit === 0) {
        return new Response(JSON.stringify({ error: 'AI Coach requires a Pro subscription' }), { status: 403 })
      }

      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('coach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('role', 'user')
        .gte('created_at', oneWeekAgo)

      if ((count ?? 0) >= limit) {
        return new Response(JSON.stringify({ error: `Weekly message limit reached (${limit}/week). Upgrade to Elite for unlimited access.` }), { status: 429 })
      }
    }

    // 4. Forward to Anthropic API
    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5-20251001',
        system: system || '',
        messages,
        max_tokens: Math.min(max_tokens || 800, 4000), // cap to prevent abuse
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      console.error('[claude-proxy] Anthropic error:', anthropicRes.status, errText)
      return new Response(JSON.stringify({ error: `Claude API error: ${anthropicRes.status}` }), {
        status: anthropicRes.status,
      })
    }

    const result = await anthropicRes.json()

    // 5. Log usage for rate limiting (only for coach messages, not plan gen/review)
    if (!skip_rate_limit) {
      try {
        await supabase.from('coach_messages').insert({
          user_id: user.id,
          role: 'user',
          content: messages[messages.length - 1]?.content?.substring(0, 500) || '',
          tokens_in: result.usage?.input_tokens || 0,
          tokens_out: result.usage?.output_tokens || 0,
        })
      } catch { /* logging failure shouldn't break the response */ }
    }

    // 6. Return response
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (e) {
    console.error('[claude-proxy] Error:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})
