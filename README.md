# SELKOP Bot — IT Handover Guide

## System Architecture (Big Picture)

```
Google Sheets (laporan) ←── Supabase Edge Function (telegram-bot)
                                        ↑
Telegram (staff & PIC)   ──────────────┘
                                        ↑
pg_cron (every 4 hours)  → Supabase Edge Function (daily-task-cron)
```

All business logic lives inside **two TypeScript files** deployed on Supabase. There is no traditional server to manage or maintain.

---

## Part 1: GitHub (Code Handover)

The code is the easiest part. Push it to a private GitHub repository.

### One-time setup (you do this now)

```bash
# Inside the project folder
cd "c:\Users\ASUS\Documents\TelegramBOT SELKOP"
git init
git add .
git commit -m "Initial commit — SELKOP bot handover"
```

Then create a **private** repo on [github.com](https://github.com/new) and follow GitHub's push instructions.

### What the IT team receives

Once they clone the repo, they get:

| File | Purpose |
|---|---|
| `supabase/functions/telegram-bot/index.ts` | Main bot logic (all commands) |
| `supabase/functions/daily-task-cron/index.ts` | The 4-hour task broadcaster |
| `supabase/config.toml` | Supabase project config |

> [!IMPORTANT]
> **Secrets are NOT in the code.** They live only in the Supabase Dashboard → Settings → Edge Function Secrets. Never commit them to GitHub.

---

## Part 2: Supabase (Database & Functions)

The IT team needs access to the Supabase project to manage the database, deploy functions, and update secrets.

### Option A — Add IT team as collaborators (recommended)

1. Go to **[Supabase Dashboard → Settings → Team](https://supabase.com/dashboard/project/epjfnkxigzugiljmemcc/settings/team)**
2. Click **Invite** → enter the IT team member's email
3. Set role: **Developer** (or Owner if they take full control)

They can now deploy functions, view logs, and manage secrets without needing your account.

### Option B — Transfer full ownership

In **Settings → General**, scroll to the bottom to find the project transfer option. Use this if the IT team creates their own Supabase organization.

> [!WARNING]
> If they create a brand-new Supabase project, they must re-run all the SQL setup below and re-configure all secrets and the cron job from scratch.

---

## Part 3: Secrets (Environment Variables)

These are set in **Supabase Dashboard → Edge Functions → Secrets** and MUST be preserved.

| Secret Name | What it is | How to update |
|---|---|---|
| `BOT_TOKEN` | Telegram Bot API token from @BotFather | `supabase secrets set BOT_TOKEN="new_token"` |
| `CRON_SECRET` | Password that authorizes the cron job | `supabase secrets set CRON_SECRET="new_password"` |
| `GOOGLE_SHEETS_WEBHOOK_URL` | Apps Script Web App URL | `supabase secrets set GOOGLE_SHEETS_WEBHOOK_URL="new_url"` |
| `SUPABASE_URL` | Auto-set by Supabase | No action needed |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-set by Supabase | No action needed |

> [!CAUTION]
> If `CRON_SECRET` is changed, the SQL cron job must also be updated with the new password. Run the scheduler SQL again (Part 5 below).

---

## Part 4: Google Sheets (Laporan)

The Google Sheet is a standalone file in your Google Drive.

### Share / Transfer ownership

1. Open the spreadsheet
2. Click **Share** (top right)
3. Add the IT team's Google email → set to **Editor**
4. To fully transfer: Click the person's name → change role to **Owner**

### About the Apps Script (Code.gs)

The Apps Script is **attached to the spreadsheet** — it travels with it. When ownership is transferred, the new owner must:

1. Open **Extensions → Apps Script**
2. Click **Deploy → Manage deployments**
3. Create a **New deployment** (Web app, Execute as: Me, Who has access: Anyone)
4. Copy the new URL
5. Update the Supabase secret:
   ```bash
   supabase secrets set GOOGLE_SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/NEW_URL/exec"
   supabase functions deploy telegram-bot
   ```

> [!NOTE]
> Yes — the IT team must do steps 3–5 when they take over. This is because Apps Script deployments are tied to the Google account that deployed them. The code (`Code.gs`) stays, only the deployment URL changes.

---

## Part 5: Database (If Starting Fresh)

If the IT team needs to rebuild the database from scratch (new Supabase project), they need to run these SQL commands in order.

### Tables

```sql
-- Users table
CREATE TABLE public."Users" (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_chat_id bigint UNIQUE NOT NULL,
    name text,
    role text DEFAULT 'staff',
    active_task_id bigint,
    draft_assignee_id bigint,
    created_at timestamptz DEFAULT now()
);

-- Tasks table
CREATE TABLE public."Tasks" (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_chat_id bigint REFERENCES public."Users"(telegram_chat_id),
    task_name text NOT NULL,
    status text DEFAULT 'pending',
    photo_url text,
    assigned_by bigint,
    created_at timestamptz DEFAULT now(),
    completed_at timestamptz
);
```

### View (for Tasks_Recap_WITA)

```sql
DROP VIEW IF EXISTS public."Tasks_Recap_WITA";

CREATE VIEW public."Tasks_Recap_WITA" AS
SELECT
    t.id              AS task_id,
    t.task_name,
    t.status,
    u.name            AS staff_name,
    t.created_at  AT TIME ZONE 'Asia/Makassar' AS created_at_wita,
    t.completed_at AT TIME ZONE 'Asia/Makassar' AS completed_at_wita,
    t.photo_url
FROM
    public."Tasks" t
JOIN
    public."Users" u ON t.telegram_chat_id = u.telegram_chat_id;
```

### Cron Job (pg_cron scheduler)

```sql
-- Remove any existing schedule first
SELECT cron.unschedule('selkop-4-hour-tasks');

-- Schedule: every 4 hours, 24/7
SELECT cron.schedule(
    'selkop-4-hour-tasks', 
    '0 */4 * * *', 
    $$
    SELECT net.http_post(
        url:='https://YOUR_PROJECT_ID.supabase.co/functions/v1/daily-task-cron',
        headers:='{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
    )
    $$
);
```

### Storage Bucket (for photos)

1. Go to **Supabase → Storage → New bucket**
2. Name: `task-photos`
3. Make it **Public** (so photo URLs are accessible in the spreadsheet)

---

## Part 6: Telegram Bot Registration

If the bot ever needs to be re-registered:

1. Message **@BotFather** on Telegram
2. `/newbot` → follow prompts
3. Copy the token → `supabase secrets set BOT_TOKEN="token"`
4. Register the webhook:
   ```
   https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://{PROJECT_ID}.supabase.co/functions/v1/telegram-bot
   ```

---

## Part 7: Deploying Code Changes

The IT team uses the Supabase CLI to deploy updates.

```bash
# Install CLI (one time)
npm install -g supabase

# Login
supabase login

# Deploy bot changes
supabase functions deploy telegram-bot

# Deploy cron changes  
supabase functions deploy daily-task-cron
```

---

## 6. Secrets (Environment Variables)

Secrets are securely stored in the **Supabase Dashboard → Edge Functions → Secrets**.

| Secret Name | Purpose | How to Update (CLI) |
|---|---|---|
| `BOT_TOKEN` | Telegram Bot API token from @BotFather | `supabase secrets set BOT_TOKEN="new_token"` |
| `CRON_SECRET` | Password authorizing the cron job | `supabase secrets set CRON_SECRET="password"` |
| `GOOGLE_SHEETS_WEBHOOK_URL` | Apps Script Deployment URL | `supabase secrets set GOOGLE_SHEETS_WEBHOOK_URL="url"` |

> [!WARNING]
> If you change the `CRON_SECRET`, you **MUST** also update the SQL query in the `pg_cron` scheduler to match the new password, otherwise `daily-task-cron` will reject the request with a 401 Unauthorized error.

---

## 7. The Cron Scheduler (pg_cron)

The database itself is responsible for triggering the `daily-task-cron` Edge Function. This is configured in the Supabase SQL Editor.

```sql
-- To update or install the schedule:
SELECT cron.unschedule('selkop-4-hour-tasks');

SELECT cron.schedule(
    'selkop-4-hour-tasks', 
    '0 */4 * * *',  -- Every 4 hours
    $$
    SELECT net.http_post(
        url:='https://[YOUR_SUPABASE_PROJECT_REF].supabase.co/functions/v1/daily-task-cron',
        headers:='{"Authorization": "Bearer [YOUR_CRON_SECRET]"}'::jsonb
    )
    $$
);
```

---

## 8. Common Troubleshooting

* **Crash: "Bad Request: can't parse entities" on Telegram**
  * *Cause:* You accidentally used `parse_mode: 'MarkdownV2'` and sent a string containing hyphens or periods.
  * *Fix:* Always use `parse_mode: 'HTML'` for dynamic text generation.
* **Crash: "ReferenceError: Buffer is not defined"**
  * *Cause:* Supabase Edge Functions run on Deno. Native Node.js `Buffer` requires polyfills which can be unstable.
  * *Fix:* Use Web Standard `TextEncoder` and `Uint8Array` to manipulate binary files in memory.
* **Crash: "permission denied for table X"**
  * *Cause:* Table was created manually via SQL editor without API grants.
  * *Fix:* Run `GRANT ALL ON TABLE public."X" TO service_role, authenticated, anon;`
* **Bot is silent / Not responding**
  * *Cause:* The Telegram Webhook might have detached.
  * *Fix:* Re-register the webhook by visiting this URL in your browser: `https://api.telegram.org/bot[BOT_TOKEN]/setWebhook?url=https://[YOUR_SUPABASE_PROJECT_REF].supabase.co/functions/v1/telegram-bot`

---

## Quick Reference: What Lives Where

| Component | Location | Who manages |
|---|---|---|
| Bot logic | GitHub repo → Supabase | IT team via CLI |
| Database | Supabase Dashboard | IT team |
| Secrets/env vars | Supabase Dashboard → Secrets | IT team |
| Cron schedule | Supabase SQL Editor → `cron.job` table | IT team |
| Spreadsheet | Google Drive | IT team |
| Apps Script | Attached to spreadsheet | IT team (must redeploy) |
| Telegram bot | @BotFather | IT team |
