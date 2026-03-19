import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type AlertQueueRow = {
  id: string
  alert_type: string
  channel: 'email' | 'whatsapp' | 'in_app'
  recipient_name: string | null
  recipient_email: string | null
  recipient_phone: string | null
  title: string
  message: string
  payload: Record<string, unknown>
  attempts: number
}

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return { url, serviceKey }
}

function isAuthorizedCron(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false

  const authHeader = req.headers.get('authorization') || ''
  return authHeader === `Bearer ${cronSecret}`
}

async function dispatchAlert(alert: AlertQueueRow) {
  if (alert.channel === 'in_app') {
    return { ok: true as const }
  }

  const webhookUrl =
    alert.channel === 'email'
      ? process.env.EMAIL_ALERT_WEBHOOK_URL
      : process.env.WHATSAPP_ALERT_WEBHOOK_URL

  if (!webhookUrl) {
    return { ok: false as const, error: `Webhook not configured for channel ${alert.channel}` }
  }

  const recipient = alert.channel === 'email' ? alert.recipient_email : alert.recipient_phone
  if (!recipient) {
    return { ok: false as const, error: `Missing recipient for channel ${alert.channel}` }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: alert.channel,
      recipient,
      recipient_name: alert.recipient_name,
      title: alert.title,
      message: alert.message,
      alert_type: alert.alert_type,
      payload: alert.payload,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return {
      ok: false as const,
      error: `Webhook ${alert.channel} failed with status ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`,
    }
  }

  return { ok: true as const }
}

async function processAlerts(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url, serviceKey } = getEnv()
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const nowIso = new Date().toISOString()

  const { data: generated, error: generateError } = await supabase.rpc('admin_generate_alert_queue', {
    p_reference: nowIso,
  })

  if (generateError) {
    return NextResponse.json({ error: generateError.message || 'Failed to generate queue' }, { status: 500 })
  }

  const { data: pendingRows, error: pendingError } = await supabase
    .from('admin_alert_queue')
    .select('id,alert_type,channel,recipient_name,recipient_email,recipient_phone,title,message,payload,attempts')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(100)

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message || 'Failed to fetch pending alerts' }, { status: 500 })
  }

  const pending = (pendingRows || []) as AlertQueueRow[]
  let sentCount = 0
  let failedCount = 0

  for (const alert of pending) {
    const { error: lockError } = await supabase
      .from('admin_alert_queue')
      .update({
        status: 'processing',
        attempts: (alert.attempts || 0) + 1,
        last_attempt_at: nowIso,
      })
      .eq('id', alert.id)
      .eq('status', 'pending')

    if (lockError) {
      failedCount += 1
      continue
    }

    try {
      const result = await dispatchAlert(alert)
      if (result.ok) {
        sentCount += 1
        await supabase
          .from('admin_alert_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            error_message: null,
          })
          .eq('id', alert.id)
      } else {
        failedCount += 1
        await supabase
          .from('admin_alert_queue')
          .update({
            status: 'failed',
            error_message: result.error,
          })
          .eq('id', alert.id)
      }
    } catch (error: any) {
      failedCount += 1
      await supabase
        .from('admin_alert_queue')
        .update({
          status: 'failed',
          error_message: error?.message || 'Unknown dispatch error',
        })
        .eq('id', alert.id)
    }
  }

  return NextResponse.json({
    ok: true,
    generated,
    pending_count: pending.length,
    sent_count: sentCount,
    failed_count: failedCount,
  })
}

export async function GET(req: Request) {
  try {
    return await processAlerts(req)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    return await processAlerts(req)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 })
  }
}
