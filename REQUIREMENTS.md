# Pengembangan Lanjutan (Development Requirements)

Dokumen ini ditujukan untuk IT Admin atau Developer selanjutnya yang akan memelihara atau mengembangkan **Selkop Operations Bot**.

Seperti yang disebutkan oleh Senior IT, bot ini **sudah berjalan secara mandiri di Cloud (Supabase Edge Functions)**. File kode lokal di laptop ini *tidak dibutuhkan* agar bot tetap hidup sehari-hari. 

Namun, folder kode lokal ini **SANGAT DIBUTUHKAN** jika di masa depan admin ingin:
1. Menambahkan fitur baru ke dalam bot.
2. Mengubah teks balasan atau logika bot.
3. Memperbaiki bug.

Jika laptop ini diformat, pastikan folder kode ini sudah di-zip dan diserahkan ke admin, karena ini adalah *blueprint* dari bot tersebut.

---

## 🛠️ Kebutuhan Sistem (System Requirements)

Jika admin baru ingin mengedit kode dan melakukan *deploy* ulang ke Supabase, mereka wajib menginstal perangkat lunak berikut di laptop/PC mereka:

### 1. Deno (Runtime Environment)
Supabase Edge Functions tidak menggunakan Node.js, melainkan **Deno**. Deno dibutuhkan agar VS Code bisa mengenali kode TypeScript tanpa error dan untuk menjalankan simulasi lokal.
* **Instalasi (Windows Powershell):** `irm https://deno.land/install.ps1 | iex`
* **Website:** [deno.land](https://deno.land/)
* **Ekstensi VS Code:** Wajib menginstal ekstensi `Deno` di VS Code dan pastikan sudah berstatus *Enable*.

### 2. Supabase CLI (Deployment Tool)
Ini adalah alat wajib untuk menghubungkan laptop admin dengan server Supabase di cloud.
* **Instalasi (Windows/Scoop):** `scoop install supabase` (Atau gunakan NPM: `npm install -g supabase`)
* **Website:** [Supabase CLI Docs](https://supabase.com/docs/guides/cli)

### 3. Git & VS Code
Editor standar untuk mengedit file `.ts` (TypeScript).

---

## 📦 Library & Dependencies (Ketergantungan)

Proyek ini **TIDAK menggunakan `package.json` atau `npm install`**. Karena berjalan di atas Deno, semua library diimpor langsung menggunakan URL HTTPS (ES Modules).

Satu-satunya library eksternal yang digunakan proyek ini ada di baris pertama pada file `index.ts`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
```
*Library ini otomatis diunduh oleh Deno saat fungsi di-deploy atau dijalankan.*

---

## 🔑 Akses Kredensial yang Harus Diserahkan

Sebagai intern yang akan handover proyek ini, Anda **wajib** menyerahkan akses berikut kepada IT Admin:

1. **Akun Supabase:** Email dan password login ke dashboard Supabase Cloud.
2. **Telegram BotFather:** Akun Telegram yang membuat bot ini (atau transfer kepemilikan bot via BotFather), agar admin bisa mendapatkan `BOT_TOKEN` atau mengubah nama/foto profil bot.
3. **Google Apps Script (Opsional):** Jika webhook Google Sheets digunakan, pastikan akun Google yang membuat script tersebut bisa diakses oleh admin, atau pindahkan kepemilikan file spreadsheet tersebut.

---

## 🚀 Cara Memulai Pengembangan (Quick Start)

Jika admin baru sudah menginstal Deno dan Supabase CLI, berikut cara mereka mulai mengedit:

1. Buka folder proyek ini di VS Code.
2. Buka Terminal di VS Code.
3. Login ke Supabase CLI: `supabase login`
4. Link ke project cloud: `supabase link --project-ref <PROJECT_ID>`
5. Edit kode di `supabase/functions/telegram-bot/index.ts`.
6. Simpan, dan deploy ulang: `supabase functions deploy telegram-bot`
