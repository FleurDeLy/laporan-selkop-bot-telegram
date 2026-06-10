import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!

const supabase = createClient(supabaseUrl, supabaseKey)

async function sendMessage(chatId: number, text: string, replyMarkup?: any, parseMode: string = 'HTML'): Promise<void> {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: parseMode,
      reply_markup: replyMarkup
    })
  })
  if (!response.ok) {
    console.error(`Telegram API communication failure: ${response.statusText}`)
  }
}

async function sendDocument(chatId: number, documentBuffer: any, filename: string): Promise<void> {
  const formData = new FormData()
  formData.append('chat_id', chatId.toString())
  formData.append('document', new Blob([documentBuffer], { type: 'text/csv' }), filename)

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
    method: 'POST',
    body: formData
  })
  if (!response.ok) {
    console.error(`Telegram sendDocument failure: ${response.statusText}`)
  }
}

async function sendAnimation(chatId: number, fileId: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAnimation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, animation: fileId })
  })
}

// ============================================================
// HYPE GIFs — Fill these with real file_ids!
// HOW TO COLLECT: Forward any funny GIF directly to the bot.
// It will instantly reply with the file_id. Copy & paste it
// into this array. Add as many as you like!
// ============================================================
const HYPE_GIFS: string[] = [
  'CgACAgQAAxkBAAIDDWohFwunKPW-TcD7otHfhuW3NUlfAAIbBAACt4qsUg1HAtdn0EsNOwQ',
  'CgACAgQAAxkBAAIDEWohGI_lpe5WsC2YA3pSEyfATgJ9AAJoBwACbrZ9U2eDln5LBgX8OwQ',
  'CgACAgQAAxkBAAIDE2ohGKDxx0SpIdWdq_PfcJ44FltlAAJSBAAC83icUrAymUUFP9CNOwQ',
  'CgACAgQAAxkBAAIDFWohGKxGWxlraa2R-GnAHorQIYN2AAIIAwACyxUUU_yvTnb-o8dfOwQ',
  'CgACAgQAAxkBAAIDF2ohGLc8xQarRCBSMN3hOBT81Gf5AAIQAwACseElU-hbKFiqu21NOwQ',
  'CgACAgQAAxkBAAIDGWohGPIuxMCm5bKGbY5yC8Lk2MqoAALhAgACkosVUxuPBPSm9DykOwQ',
  'CgACAgQAAxkBAAIDG2ohGRDRBamsxScXZzpMvbJ51gjoAAICAwACTR8FU2HaUoRvwrjDOwQ',
  'CgACAgQAAxkBAAIDHWohGYB05nnQhu3ji5cAASzgPHL-cQACvgIAAoL3nVM9fLSHiQKP7jsE',
  'CgACAgQAAxkBAAIDH2ohGdRttXCH2U0KndupFbAZMQ11AAIYAwACoCgEU0zI-D2er1v_OwQ',
]
/**
 * /recap [DD-MM-YYYY] [DD-MM-YYYY]
 * PIC-only. Shows completion stats grouped by outlet for a given date range.
 * Defaults to today if no dates given.
 */
async function handleRecapCommand(chatId: number, text: string): Promise<void> {
  try {
    // 1. Parse and Validate Input
    const args = text.trim().split(/\s+/);
    const dateRegex = /^\d{2}-\d{2}-\d{4}$/;

    if (args.length !== 3 || !dateRegex.test(args[1]) || !dateRegex.test(args[2])) {
      await sendMessage(chatId, "⚠️ *Format Salah*\nGunakan: `/recap DD-MM-YYYY DD-MM-YYYY`\nContoh: `/recap 01-06-2026 08-06-2026`", undefined, 'Markdown');
      return;
    }

    const startInput = args[1]; 
    const endInput = args[2];   

    const toDBDate = (dateStr: string) => dateStr.split('-').reverse().join('-');
    const dbStartDate = toDBDate(startInput);
    const dbEndDate = toDBDate(endInput);

    // 2. Fetch Full Data from the Master Reporting View
    const { data: recapData, error } = await supabase
      .from('Tasks_Recap_WITA')
      .select('*')
      .gte('created_at_wita', `${dbStartDate} 00:00:00`)
      .lte('created_at_wita', `${dbEndDate} 23:59:59`);

    if (error) throw new Error(error.message);

    // 3. Handle Empty State Safely
    if (!recapData || recapData.length === 0) {
      await sendMessage(chatId, `📭 Tidak ada data untuk periode *${startInput}* s/d *${endInput}*.`, undefined, 'Markdown');
      return;
    }

    // 4. Calculate Detailed Statistics (Matching Screenshot 2 UX)
    const stats: Record<string, { total: number, done: number, failed: number, pending: number }> = {};
    let grandTotal = 0;
    let grandDone = 0;
    let grandFailed = 0;
    let grandPending = 0;

    recapData.forEach((task: any) => {
      let branch = task.outlet || "Outlet Tidak Diketahui";
      if (!stats[branch]) stats[branch] = { total: 0, done: 0, failed: 0, pending: 0 };
      
      stats[branch].total += 1;
      grandTotal += 1;

      if (task.status === 'done') {
        stats[branch].done += 1;
        grandDone += 1;
      } else if (task.status === 'pending') {
        stats[branch].pending += 1;
        grandPending += 1;
      } else {
        stats[branch].failed += 1;
        grandFailed += 1;
      }
    });

    // Calculate Grand Completion Rate safely
    const grandRate = grandTotal === 0 ? 0 : Math.round((grandDone / grandTotal) * 100);

    // 5. Build the Beautiful Text Message (HTML Safe)
    let reportText = `📋 <b>Rekap Tugas — ${startInput} s/d ${endInput}</b>\n\n`;
    
    reportText += `📊 Total: ${grandTotal} tugas\n`;
    reportText += `✅ Selesai: ${grandDone}\n`;
    reportText += `❌ Tidak Selesai: ${grandFailed}\n`;
    reportText += `⏳ Masih Pending: ${grandPending}\n`;
    reportText += `🏆 Completion Rate: <b>${grandRate}%</b>\n\n`;

    for (const [branch, data] of Object.entries(stats)) {
      const branchRate = data.total === 0 ? 0 : Math.round((data.done / data.total) * 100);
      
      reportText += `🏢 <b>${branch}</b>\n`;
      reportText += `✅ ${data.done}/${data.total} tugas (${branchRate}%)\n`;
      reportText += `❌ Tidak selesai: ${data.failed}\n`;
      reportText += `⏳ Pending: ${data.pending}\n\n`;
    }

    reportText += `<i>Ketik /recap DD-MM-YYYY DD-MM-YYYY untuk rekap rentang tanggal.</i>`;

    // 6. Send the Detailed Text Message
    await sendMessage(chatId, reportText, undefined, 'HTML');

    // 7. Generate the CSV in RAM using Web Standards (Blob)
    const escapeCSV = (str: any) => {
      if (str === null || str === undefined) return '""';
      const text = String(str);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const headers = ['Task ID', 'Outlet', 'Staff Name', 'Task Name', 'Status', 'Dibuat (WITA)', 'Diselesaikan (WITA)'];
    
    const csvRows = recapData.map((t: any) => [
      escapeCSV(t.task_id),
      escapeCSV(t.outlet),
      escapeCSV(t.staff_name),
      escapeCSV(t.task_name),
      escapeCSV(t.status === 'done' ? 'Selesai' : 'Tidak Diselesaikan'),
      escapeCSV(t.created_at_wita),
      escapeCSV(t.completed_at_wita || 'N/A')
    ].join(','));

    // Join with carriage returns for strict CSV compliance
    const csvContent = [headers.join(','), ...csvRows].join('\r\n'); 
    
    // Convert to Uint8Array instead of Buffer
    const encoder = new TextEncoder();
    const csvUint8 = encoder.encode(csvContent);

    // 8. Send Document via Telegram API (Deno Compatible)
    const filename = `Laporan_Selkop_${startInput}_sd_${endInput}.csv`;
    
    await sendDocument(chatId, csvUint8, filename);

  } catch (error: any) {
    // Let's print the actual error to your terminal so we aren't guessing next time!
    console.error("CRITICAL RECAP ERROR:", error);
    await sendMessage(chatId, `❌ Terjadi kesalahan sistem: ${error.message}`);
  }
}

async function notifyPicsForCompletedTask(supabaseClient: any, staffChatId: number, taskName: string, photoUrl: string) {
  try {
    // 1. Get the staff member's outlet context
    const { data: staffData, error: staffError } = await supabaseClient
      .from('Users')
      .select('name, outlet')
      .eq('telegram_chat_id', staffChatId)
      .single();

    if (staffError || !staffData) {
      console.error("Failed to fetch staff context for routing:", staffError);
      return;
    }

    const staffName = staffData.name;
    const staffOutlet = staffData.outlet;

    // 2. Query matching PICs (Targeted branch PICs OR Global PICs with no restrictions)
    const { data: pics, error: picsError } = await supabaseClient
      .from('Users')
      .select('telegram_chat_id')
      .eq('role', 'pic')
      // Use ilike and % wildcards to ignore accidental spaces around GLOBAL
      .or(`outlet.eq."${staffOutlet}",outlet.ilike."%GLOBAL%"`); 

    if (picsError) {
      console.error("Failed to fetch target PICs for routing:", picsError);
      return;
    }

    // 3. Format the operational report message
    const reportMsg = `✅ *Tugas Kebersihan Selesai* ✅\n\n` +
                      `*Outlet:* ${staffOutlet || 'GLOBAL'}\n` +
                      `*Staff:* ${staffName}\n` +
                      `*Tugas:* ${taskName}\n\n` +
                      `Status telah diperbarui di Database & Spreadsheet.`;

    const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!BOT_TOKEN) return;

    // 4. Broadcast dynamically to the filtered PIC list only
    for (const pic of pics) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: pic.telegram_chat_id,
          photo: photoUrl,
          caption: reportMsg,
          parse_mode: 'Markdown'
        })
      }).catch(err => console.error(`Failed to send report to PIC ${pic.telegram_chat_id}:`, err));
    }

  } catch (err) {
    console.error("Catastrophic error in PIC routing system:", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') {
    return new Response('Telegram Bot Edge Function Online', { status: 200 })
  }

  try {
    const update = await req.json()

    // 1. Handle Inline Keyboard Button Clicks
    if (update.callback_query) {
      const chatId = update.callback_query.message?.chat?.id
      const data = update.callback_query.data
      const firstName = update.callback_query.from?.first_name || 'User'

      if (chatId && data && data.startsWith('task_')) {
        const taskId = parseInt(data.split('_')[1], 10)
        const { error } = await supabase.from('Users').update({ active_task_id: taskId }).eq('telegram_chat_id', chatId)
        if (error) {
          await sendMessage(chatId, `❌ Gagal memproses permintaan.`)
        } else {
          await sendMessage(chatId, `📸 Siap, <b>${firstName}</b>! Silakan kirim foto sebagai bukti untuk menyelesaikan tugas ini.`)
        }
      }

      if (chatId && data && data.startsWith('assign_')) {
        const targetId = parseInt(data.split('_')[1], 10)
        const { data: targetUser } = await supabase.from('Users').select('name').eq('telegram_chat_id', targetId).maybeSingle()
        const targetName = targetUser?.name || 'Staff'

        await supabase.from('Users').update({ draft_assignee_id: targetId }).eq('telegram_chat_id', chatId)
        await sendMessage(chatId, `📝 Baik, silakan ketik deskripsi tugas untuk <b>${targetName}</b>:`)
      }
      return new Response('OK', { status: 200 })
    }

    // GIF COLLECTOR — Forward any GIF to the bot and it replies with the file_id
    // Remove this block once you have collected all your hype GIF IDs
    if (update.message && update.message.animation) {
      const chatId = update.message.chat.id
      const fileId = update.message.animation.file_id
      await sendMessage(chatId, `🎬 GIF <code>file_id</code>:\n<code>${fileId}</code>\n\nCopy this and paste it into the HYPE_GIFS array!`)
      return new Response('OK', { status: 200 })
    }

    // 2. Handle Photo Uploads & Completion Receipts
    if (update.message && update.message.photo) {
      const chatId = update.message.chat.id
      const firstName = update.message.from?.first_name || 'Staff'
      const highestResPhoto = update.message.photo.pop() 
      const fileId = highestResPhoto.file_id

      const { data: user } = await supabase.from('Users').select('active_task_id, name, outlet').eq('telegram_chat_id', chatId).maybeSingle()

      if (!user || !user.active_task_id) {
        await sendMessage(chatId, '⚠️ Kamu belum memilih tugas! Ketik /tasks dan pilih tugas terlebih dahulu.')
        return new Response('OK', { status: 200 })
      }

      const activeTaskId = user.active_task_id
      await sendMessage(chatId, '⏳ Mengunggah bukti laporan...')

      try {
        const { data: taskData } = await supabase.from('Tasks').select('task_name, assigned_by, created_at').eq('id', activeTaskId).maybeSingle()
        const tgFileResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)
        const tgFileData = await tgFileResponse.json()
        const filePath = tgFileData.result.file_path

        const imageResponse = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
        const imageBlob = await imageResponse.blob()
        const fileName = `${chatId}_${activeTaskId}_${Date.now()}.jpg`
        
        const { error: uploadError } = await supabase.storage.from('task-photos').upload(fileName, imageBlob, { contentType: 'image/jpeg' })
        if (uploadError) throw uploadError

        const { data: publicUrlData } = supabase.storage.from('task-photos').getPublicUrl(fileName)
        const photoUrl = publicUrlData.publicUrl

        const completedAt = new Date()
        const { data: updatedTask, error: updateError } = await supabase.from('Tasks').update({ status: 'done', photo_url: photoUrl, completed_at: completedAt.toISOString() }).eq('id', activeTaskId).select('task_name').single()
        if (updateError) throw updateError
        await supabase.from('Users').update({ active_task_id: null }).eq('telegram_chat_id', chatId)

        // Build WITA timestamps directly — no view query needed
        const completedAtWita = completedAt.toLocaleString('sv-SE', { timeZone: 'Asia/Makassar' })
        const assignedAtWita = taskData?.created_at
          ? new Date(taskData.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Makassar' })
          : '-'
        const staffName = user.name || firstName

        // POST to Google Sheets
        const sheetsWebhookUrl = Deno.env.get('GOOGLE_SHEETS_WEBHOOK_URL')
        if (sheetsWebhookUrl) {
          try {
            const sheetsResponse = await fetch(sheetsWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                task_id: activeTaskId,
                outlet: user.outlet || 'N/A',
                staff_name: staffName,
                task_name: taskData?.task_name || '-',
                assigned_at_wita: assignedAtWita,
                completed_at_wita: completedAtWita,
                photo_url: photoUrl
              })
            })
            console.log('[Sheets Sync] status:', sheetsResponse.status)
          } catch (err) {
            console.error('[Sheets Sync Error]:', err)
          }
        }

        const taskNameDisplay = updatedTask?.task_name ? `<b>${updatedTask.task_name}</b> ` : ''
        await sendMessage(chatId, `✅ Tugas ${taskNameDisplay}Berhasil Diselesaikan!\n\nBukti telah tersimpan. Ketik /tasks untuk mengecek sisa tugasmu.`)

        // 🎉 Send a random hype GIF to celebrate!
        if (HYPE_GIFS.length > 0) {
          const randomGif = HYPE_GIFS[Math.floor(Math.random() * HYPE_GIFS.length)]
          await sendAnimation(chatId, randomGif)
        }

        // Notify PICs using the new scoped routing layer
        await notifyPicsForCompletedTask(supabase, chatId, taskData?.task_name || '-', photoUrl);
      } catch (err) {
        console.error('Photo Upload Exception:', err)
        await sendMessage(chatId, '❌ Gagal menyimpan foto. Silakan coba kirim ulang.')
      }
      return new Response('OK', { status: 200 })
    }

    // 3. Handle System Text Commands & Text Interceptors
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id
      const text = update.message.text.trim()
      const firstName = update.message.from?.first_name || 'User'

      // INTERCEPTOR: Drafting a new task description
      if (!text.startsWith('/')) {
        const { data: draftUser } = await supabase.from('Users').select('draft_assignee_id').eq('telegram_chat_id', chatId).maybeSingle()

        if (draftUser && draftUser.draft_assignee_id) {
          const assigneeId = draftUser.draft_assignee_id
          const taskDescription = `[ Tambahan ] ${text}`
          // Snapshot the assignee's outlet at task-creation time (point-in-time audit integrity)
          const { data: assigneeUser } = await supabase.from('Users').select('outlet').eq('telegram_chat_id', assigneeId).maybeSingle()
          await supabase.from('Tasks').insert({ telegram_chat_id: assigneeId, task_name: taskDescription, status: 'pending', assigned_by: chatId, outlet: assigneeUser?.outlet || null })
          await supabase.from('Users').update({ draft_assignee_id: null }).eq('telegram_chat_id', chatId)
          await sendMessage(chatId, '✅ Tugas berhasil dikirim ke staff!')
          await sendMessage(assigneeId, `🔔 <b>Tugas Baru dari PIC!</b>\n\nTask: ${taskDescription}\n\nKetik /tasks untuk melihat.`)
          return new Response('OK', { status: 200 })
        }
      }

      // COMMAND ROUTER
      if (text === '/start') {
        // Check if user already exists to avoid overwriting their role
        const { data: existingUser } = await supabase.from('Users').select('name, role').eq('telegram_chat_id', chatId).maybeSingle()

        if (!existingUser) {
          // New user: insert with default role
          const { error } = await supabase.from('Users').insert({ telegram_chat_id: chatId, name: firstName, role: 'staff' })
          if (error) {
            await sendMessage(chatId, `❌ Gagal mendaftar ke database.`)
          } else {
            await sendMessage(chatId, `✅ Halo <b>${firstName}</b>! Kamu berhasil terdaftar di database.\n\nKetik /tasks untuk melihat daftar tugasmu, atau ketik /help untuk panduan.`)
          }
        } else {
          // Existing user: welcome back without touching their role
          await sendMessage(chatId, `✅ Halo <b>${existingUser.name}</b>, kamu sudah terdaftar di sistem!\n\nKetik /help untuk panduan.`)
        }
      }

      else if (text === '/stop') {
        const { error } = await supabase.from('Users').delete().eq('telegram_chat_id', chatId)
        if (error) {
          await sendMessage(chatId, `❌ Gagal menghapus data dari sistem.`)
          console.error('Delete Error:', error)
        } else {
          await sendMessage(chatId, `🚫 Kamu telah berhenti berlangganan. Semua tugasmu telah dihapus dari sistem. Ketik /start jika ingin kembali.`)
        }
      }
      
      else if (text === '/tasks') {
        const { data: tasks, error } = await supabase.from('Tasks').select('id, task_name').eq('telegram_chat_id', chatId).eq('status', 'pending')
        if (error || !tasks || tasks.length === 0) {
          await sendMessage(chatId, '🎉 Tidak ada tugas pending untukmu saat ini!')
          return new Response('OK', { status: 200 })
        }
        const buttons = tasks.map(task => ([{ text: `✅ Selesaikan: ${task.task_name}`, callback_data: `task_${task.id}` }]))
        await sendMessage(chatId, '📋 <b>Tugas Kamu Hari Ini:</b>\nSilakan pilih tugas yang ingin diselesaikan:', { inline_keyboard: buttons })
      }

      else if (text === '/help') {
        const helpMsg =
          `🤖 <b>Panduan Bot Laporan Harian</b>\n\n` +
          `<b>Perintah Umum (Staff):</b>\n` +
          `🔹 /start - Mendaftar ke sistem\n` +
          `🔹 /tasks - Melihat dan menyelesaikan tugas\n` +
          `🔹 /status - Mengecek status pendaftaran\n` +
          `🔹 /stop - Berhenti dan hapus data\n` +
          `🔹 /help - Menampilkan panduan ini\n\n` +
          `<b>Perintah Khusus (PIC):</b>\n` +
          `🔸 /addtask - Memberikan tugas dadakan ke staff\n` +
          `🔸 /monitor - Memantau seluruh progres tugas`
        await sendMessage(chatId, helpMsg)
      }

      else if (text === '/status') {
        const { data: user } = await supabase.from('Users').select('id').eq('telegram_chat_id', chatId).maybeSingle()
        const { count } = await supabase.from('Users').select('*', { count: 'exact', head: true })
        const isRegistered = !!user
        await sendMessage(chatId, `📊 <b>Status Bot</b>\n\nStatus kamu: ${isRegistered ? '✅ Terdaftar' : '❌ Belum Terdaftar'}\nTotal Staff: ${count || 0} orang\n\n${isRegistered ? 'Ketik /tasks untuk melihat tugasmu.' : 'Ketik /start untuk mendaftar.'}`)
      }
      
      else if (text === '/addtask') {
        const { data: sender } = await supabase.from('Users').select('role').eq('telegram_chat_id', chatId).maybeSingle()
        if (sender?.role !== 'pic') {
          await sendMessage(chatId, '❌ Akses ditolak. Perintah ini hanya untuk PIC.')
          return new Response('OK', { status: 200 })
        }
        const { data: staffList } = await supabase.from('Users').select('telegram_chat_id, name').eq('role', 'staff')
        if (!staffList || staffList.length === 0) {
          await sendMessage(chatId, '❌ Tidak ada staff yang terdaftar saat ini.')
          return new Response('OK', { status: 200 })
        }
        const buttons = staffList.map(staff => ([{ text: `👤 ${staff.name}`, callback_data: `assign_${staff.telegram_chat_id}` }]))
        await sendMessage(chatId, '📋 <b>Pilih staff yang akan diberi tugas:</b>', { inline_keyboard: buttons })
      }

      else if (text === '/monitor') {
        try {
          // 1. Authorize the user and get their PIC scope
          const { data: userData, error: userError } = await supabase
            .from('Users')
            .select('role, outlet')
            .eq('telegram_chat_id', chatId)
            .single();

          if (userError || !userData || userData.role !== 'pic') {
            return new Response('OK', { status: 200 }); 
          }

          // 2. Defensive String Sanitization
          const rawOutlet = userData.outlet || '';
          const picOutlet = rawOutlet.trim().toUpperCase();
          
          // 3. "Silent Boss" Logic: Both GLOBAL and EMPTY get full access
          const isGlobal = (picOutlet === 'GLOBAL' || picOutlet === 'EMPTY');
          const displayScope = isGlobal ? 'GLOBAL' : rawOutlet;

          // 4. Fetch scoped staff list
          let staffQuery = supabase
            .from('Users')
            .select('telegram_chat_id, name, outlet, active_task_id')
            .eq('role', 'staff');
            
          if (!isGlobal) {
            staffQuery = staffQuery.eq('outlet', rawOutlet);
          }
          const { data: staffList } = await staffQuery;

          // 5. Fetch today's tasks
          const today = new Date().toISOString().split('T')[0]; 
          const { data: todayTasks } = await supabase
            .from('Tasks')
            .select('telegram_chat_id, status, task_name') 
            .gte('created_at', `${today}T00:00:00Z`)
            .lte('created_at', `${today}T23:59:59Z`);

          // 6. Construct the Ultimate Dashboard String
          let monitorMsg = `📊 *Live Operations Monitor*\n*Scope:* ${displayScope}\n\n`;

          if (!staffList || staffList.length === 0) {
            monitorMsg += "Tidak ada staff yang terdaftar di outlet ini.";
          } else {
            for (const staff of staffList) {
              // Filter tasks for this specific staff member
              const staffTasks = (todayTasks || []).filter((t: any) => t.telegram_chat_id === staff.telegram_chat_id);
              const totalTasks = staffTasks.length;
              const completedTasks = staffTasks.filter((t: any) => t.status === 'Selesai' || t.status === 'done' || t.status === 'DONE').length; 
              
              const currentActivity = staff.active_task_id ? "🟢 (Sedang Bekerja)" : "⚪ (Standby)";

              // Print High-Level Summary
              monitorMsg += `👷‍♂️ *${staff.name}* (${staff.outlet})\n`;
              monitorMsg += `Status: ${completedTasks}/${totalTasks} Selesai ${currentActivity}\n`;

              // Print Itemized Detailed Breakdown
              if (totalTasks > 0) {
                for (const task of staffTasks) {
                  const icon = (task.status === 'Selesai' || task.status === 'done' || task.status === 'DONE') ? '✅' : '⌛';
                  monitorMsg += `${icon} ${task.task_name}\n`;
                }
              } else {
                monitorMsg += `_Belum ada tugas hari ini._\n`;
              }
              monitorMsg += `\n`; // Add spacing between staff members
            }
          }

          // 7. Send the report
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: monitorMsg,
              parse_mode: 'Markdown'
            })
          });
          
        } catch (error) {
          console.error("Error generating /monitor dashboard:", error);
        }
        return new Response('OK', { status: 200 });
      }

      else if (text.startsWith('/recap')) {
        const { data: sender } = await supabase.from('Users').select('role').eq('telegram_chat_id', chatId).maybeSingle()
        if (sender?.role !== 'pic') {
          await sendMessage(chatId, '❌ Akses ditolak. Perintah ini hanya untuk PIC.')
          return new Response('OK', { status: 200 })
        }
        await handleRecapCommand(chatId, text)
      }

    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('Webhook exception:', err)
    return new Response('Error', { status: 200 })
  }
})