// GritOS Claude API Proxy
// Runs as a Supabase Edge Function — API key stays server-side
// Client sends user token + message, proxy validates auth + forwards to Anthropic

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Rate limits by tier (messages per week)
const RATE_LIMITS: Record<string, number> = {
  free: 10,
  pro: 100,
  elite: 999999, // unlimited
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

    // 2. Check rate limit
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('subscription_tier')
      .eq('user_id', user.id)
      .single()

    const tier = profile?.subscription_tier || 'free'
    const limit = RATE_LIMITS[tier] || RATE_LIMITS.free

    // Count messages this week
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const { count } = await supabase
      .from('coach_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', weekAgo.toISOString())

    if ((count || 0) >= limit) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        message: `You've used ${count}/${limit} messages this week. Upgrade to Pro for more.`,
        tier,
      }), { status: 429 })
    }

    // 3. Parse request body
    const body = await req.json()
    const { model, system, messages, max_tokens } = body

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request: messages required' }), { status: 400 })
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

    // 5. Log usage for rate limiting
    await supabase.from('coach_messages').insert({
      user_id: user.id,
      role: 'user',
      content: messages[messages.length - 1]?.content?.substring(0, 500) || '',
      tokens_in: result.usage?.input_tokens || 0,
      tokens_out: result.usage?.output_tokens || 0,
    })

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
