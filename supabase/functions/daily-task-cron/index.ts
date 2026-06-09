import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
// Simple short secret used for cron auth — immune to JWT encoding corruption
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

const supabase = createClient(supabaseUrl, supabaseKey)


async function broadcastMessage(chatId: number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    })
  })
  if (!response.ok) {
    console.error(`Failed to notify ${chatId}: ${response.statusText}`)
  }
}

/**
 * Scans for pending cron tasks, batches them into ONE webhook to Google Sheets,
 * then SOFT-EXPIRES them by setting status to 'failed'.
 * Rows stay in the database permanently for historical reporting and /recap analytics.
 * Only targets cron-generated tasks (assigned_by IS NULL) — PIC manual tasks stay pending.
 */
async function syncAndExpireTasks(
  supabase: any,
  userIds: number[],
  staffMap: Map<number, string>,
  sheetsWebhookUrl: string
): Promise<void> {
  const { data: pendingTasks, error: fetchError } = await supabase
    .from('Tasks')
    .select('id, task_name, telegram_chat_id, created_at, outlet')
    .in('telegram_chat_id', userIds)
    .eq('status', 'pending')
    .is('assigned_by', null)

  if (fetchError) {
    console.error('[Audit] Failed to fetch pending tasks:', fetchError.message)
    return
  }

  if (!pendingTasks || pendingTasks.length === 0) {
    console.log('[Audit] Zero pending tasks to expire. Skipping batch webhook.')
    return
  }

  // Build one batched array payload — The Delivery Truck
  const batchedPayload = pendingTasks.map((task: any) => ({
    task_id: task.id,
    outlet: task.outlet || 'N/A',
    staff_name: staffMap.get(task.telegram_chat_id) || 'Unknown',
    task_name: task.task_name,
    assigned_at_wita: new Date(task.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Makassar' }),
    completed_at_wita: '❌ Tidak Diselesaikan',
    photo_url: null
  }))

  try {
    // Single HTTP call regardless of how many tasks expired
    const sheetResponse = await fetch(sheetsWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchedPayload)
    })
    console.log(`[Audit] Sheets batch response: ${sheetResponse.status} — ${pendingTasks.length} rows sent`)
  } catch (err: any) {
    console.error('[Audit] Sheets webhook error:', err.message)
  }

  // SOFT-DELETE: mark as 'failed' — rows stay in DB for historical analytics
  const taskIds = pendingTasks.map((task: any) => task.id)
  const { error: updateError } = await supabase
    .from('Tasks')
    .update({ status: 'failed' })
    .in('id', taskIds)

  if (updateError) {
    console.error('[Audit] Soft-expire error:', updateError.message)
  } else {
    console.log(`[Audit] Soft-expired ${taskIds.length} tasks to 'failed'.`)
  }
}

Deno.serve(async (req: Request) => {
  console.log(`[START] Cron execution triggered via ${req.method}`)

  if (req.method !== 'POST') {
    console.error(`[REJECTED] Invalid Method: ${req.method}`)
    return new Response('Method Not Allowed', { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    console.error(`[REJECTED] Auth mismatch. Header received: ${authHeader?.substring(0, 25)}...`)
    return new Response('Unauthorized Access', { status: 401 })
  }

  try {
    console.log('[RUNNING] Auth accepted. Fetching roster...')

    const { data: users, error: userError } = await supabase
      .from('Users')
      .select('telegram_chat_id, name, outlet')
      .eq('role', 'staff')

    if (userError || !users) {
      throw new Error(`Roster fetch failed: ${userError?.message}`)
    }

    if (users.length === 0) {
      console.log('[HALTED] Roster is empty.')
      return new Response('Roster empty.', { status: 200 })
    }
    const userIds = users.map(u => u.telegram_chat_id)

    // ── STEP 1 + 2: Audit expired tasks to Sheets (batch) then soft-expire to 'failed' ──
    const sheetsWebhookUrl = Deno.env.get('GOOGLE_SHEETS_WEBHOOK_URL')
    const staffMap = new Map(users.map(u => [u.telegram_chat_id, u.name]))
    if (sheetsWebhookUrl) {
      await syncAndExpireTasks(supabase, userIds, staffMap, sheetsWebhookUrl)
    } else {
      // No Sheets URL configured — still soft-expire cron tasks
      await supabase.from('Tasks').update({ status: 'failed' }).in('telegram_chat_id', userIds).eq('status', 'pending').is('assigned_by', null)
    }

    console.log(`[RUNNING] Old pending tasks cleared. Generating new round...`)

    // Fetch all ACTIVE templates from the Master_Tasks table
    const { data: masterTasks, error: masterError } = await supabase
      .from('Master_Tasks')
      .select('task_name, target_outlet')
      .eq('is_active', true)

    if (masterError) {
      throw new Error(`Failed to fetch master tasks: ${masterError.message}`)
    }

    const tasksToInsert: Array<{ telegram_chat_id: number; task_name: string; status: string; outlet: string | null }> = []

    for (const user of users) {
      for (const task of (masterTasks || [])) {
        // Core Routing Logic: Assign if the task is GLOBAL, OR if it strictly matches the user's branch
        if (task.target_outlet === 'GLOBAL' || task.target_outlet === user.outlet) {
          tasksToInsert.push({
            telegram_chat_id: user.telegram_chat_id,
            task_name: task.task_name,
            status: 'pending',
            outlet: user.outlet || null
          })
        }
      }
    }

    const { error: insertError } = await supabase
      .from('Tasks')
      .insert(tasksToInsert)

    if (insertError) {
      throw new Error(`Bulk write transaction failed: ${insertError.message}`)
    }

    console.log(`[RUNNING] Database write successful. Broadcasting to Telegram...`)

    const broadcastPromises = users.map(user =>
      broadcastMessage(
        user.telegram_chat_id,
        `🔔 <b>Tugas Harian Baru!</b>\n\nHalo <b>${user.name}</b>, tugas harian kamu sudah ditambahkan ke sistem.\n\nKetik /tasks untuk melihat dan menyelesaikannya.`
      )
    )

    await Promise.all(broadcastPromises)

    console.log('[SUCCESS] Cron execution completed flawlessly.')
    return new Response(
      JSON.stringify({ success: true, tasks_generated: tasksToInsert.length }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err: any) {
    console.error('[FATAL ERROR] Cron Execution Exception:', err)

    const ADMIN_CHAT_ID = Deno.env.get('ADMIN_CHAT_ID');
    if (BOT_TOKEN && ADMIN_CHAT_ID) {
      const alertMsg = `🚨 *FATAL ERROR: Selkop Cron Job* 🚨\n\nSistem gagal melakukan eksekusi shift!\n\n*Log Error:*\n\`${err.message || String(err)}\``;

      // Send the emergency message silently to the Admin
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_CHAT_ID,
          text: alertMsg,
          parse_mode: 'Markdown'
        })
      }).catch(networkErr => console.error("Failsafe network error:", networkErr)); 
    }

    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), { 
      headers: { 'Content-Type': 'application/json' },
      status: 500 
    })
  }
})
