# คู่มือติดตั้งและ Deploy — GEMBA SAFETY

พาตั้งแต่รันในเครื่อง ไปจนถึงขึ้นระบบจริงบน Cloudflare (Pages + Worker + D1 + R2)

## 🟢 สถานะตอนนี้ — ขึ้นระบบจริงแล้ว

| ปลายทาง | สถานะ | URL / หมายเหตุ |
|---|---|---|
| **หน้าเว็บ (Cloudflare Pages)** | ✅ ใช้งานได้แล้ว | <https://gemba-safety.pages.dev> |
| **API (Cloudflare Worker)** | ✅ ใช้งานได้แล้ว | <https://gemba-safety-api.wiphawas-sketchup.workers.dev> |
| **ฐานข้อมูล D1** | ✅ ใส่ข้อมูลครบแล้ว | `gemba-safety` · id `8a51ba3b-8982-4916-ae2d-4b997e095200` |
| **ที่เก็บรูป R2** | ✅ สร้างแล้ว | `gemba-safety-photos` |
| โค้ดฝั่งหน้าเว็บ + Worker | ✅ ผ่าน `tsc` · `vitest` · `build` | |
| วงจรใบแจ้งปัญหาครบวง | ✅ ทดสอบผ่าน API และผ่านหน้าเว็บจริงแล้ว | เปิด → มอบหมาย → แก้ + รูป → ตรวจรับ → ปิด |
| ทะเบียนสิทธิ์รายคน (`user_roles`) | ⏳ เว้นว่างตามที่ตกลง | กรอกที่ `/admin/roles` เมื่อพร้อม |

> `.env.local` ในเครื่องถูกตั้งให้ชี้ Worker จริงแล้ว แก้โค้ดเสร็จสั่ง `npm run deploy` คำสั่งเดียวขึ้นเว็บได้เลย

> โปรเจกต์นี้แยกจาก Gemba Walk เดิมคนละชุดทรัพยากร (คนละฐานข้อมูล คนละ Worker คนละเว็บ)
> ของเดิมที่ <https://gemba-audit.pages.dev> จึงไม่ถูกกระทบเลย

---

## สารบัญ

- [ส่วนที่ 1 — รันในเครื่อง](#ส่วนที่-1--รันในเครื่อง)
- [ส่วนที่ 2 — ขึ้นระบบจริงบน Cloudflare](#ส่วนที่-2--ขึ้นระบบจริงบน-cloudflare)
- [ส่วนที่ 3 — ตรวจว่าใช้ได้จริง](#ส่วนที่-3--ตรวจว่าใช้ได้จริง)
- [ส่วนที่ 4 — กรอกทะเบียนสิทธิ์ผู้ใช้งาน](#ส่วนที่-4--กรอกทะเบียนสิทธิ์ผู้ใช้งาน)
- [ส่วนที่ 5 — รายการ endpoint](#ส่วนที่-5--รายการ-endpoint)
- [ภาคผนวก ก — ย้ายจากฐานข้อมูลเดิม](#ภาคผนวก-ก--ย้ายจากฐานข้อมูลเดิม)

---

## ส่วนที่ 1 — รันในเครื่อง

**หน้าเว็บอย่างเดียว (โหมดในเครื่อง ข้อมูลไม่ถูกแชร์)**

```bash
npm install && npm run dev
```

**หน้าเว็บ + หลังบ้านครบชุด (ข้อมูลชุดเดียวกัน เหมือนของจริง)**

เปิดเทอร์มินัลที่หนึ่ง — สร้างฐานข้อมูลในเครื่องแล้วรัน Worker

```bash
cd worker && npm install
```

```bash
printf 'AUTH_TOKEN=local-dev-token\n' > worker/.dev.vars
```

```bash
cd worker && npx wrangler d1 execute gemba-safety --local --file=./schema.sql
```

```bash
cd worker && npx wrangler d1 execute gemba-safety --local --file=./seed.sql
```

```bash
cd worker && npx wrangler d1 execute gemba-safety --local --file=./seed-safety.sql
```

```bash
cd worker && npx wrangler dev --local --port 8787
```

เปิดเทอร์มินัลที่สอง — ชี้หน้าเว็บมาที่ Worker ในเครื่อง

```bash
printf 'VITE_API_URL=http://127.0.0.1:8787\nVITE_AUTH_TOKEN=local-dev-token\n' > .env.local
```

```bash
npm run dev
```

เข้าสู่ระบบด้วยรหัสพนักงาน เช่น `T-815` (ผู้ดูแลระบบใช้รหัสเดียวกันที่หน้า `/admin`)

---

## ส่วนที่ 2 — ขึ้นระบบจริงบน Cloudflare

ทำครั้งเดียวตามลำดับ คัดลอกทีละบล็อกได้เลย

### 2.1 ล็อกอิน (ครั้งเดียวต่อเครื่อง)

```bash
npx wrangler login
```

### 2.2 สร้างฐานข้อมูล D1 — ✅ ทำให้แล้ว

```bash
npx wrangler d1 create gemba-safety
```

คำสั่งนี้พิมพ์ `database_id` ออกมา และค่าที่ได้ถูกใส่ลง `worker/wrangler.toml` ให้เรียบร้อยแล้ว
(`8a51ba3b-8982-4916-ae2d-4b997e095200`) ถ้าสร้างใหม่เมื่อไหร่ต้องเปลี่ยนค่านี้ตาม

### 2.3 สร้างตารางและใส่ข้อมูลตั้งต้น — ✅ ทำให้แล้ว

รันไปแล้วทั้งสามไฟล์ ผลที่ได้: 26 ตาราง · พนักงาน 393 คน (ผู้เดินตรวจ 1 — ล้างด้วย `migrate-walkers-reset.sql`) · พื้นที่ 20 ·
หมวด 12 · ข้อตรวจ 48 · บทบาท 6 · สิทธิ์ 17 · ทะเบียนสิทธิ์รายคน 0 (ตั้งใจเว้นไว้)
เก็บคำสั่งไว้เผื่อต้องสร้างฐานใหม่หรือรันซ้ำ (ทุกไฟล์รันซ้ำได้ ไม่เกิดข้อมูลซ้ำ)

```bash
cd worker && npx wrangler d1 execute gemba-safety --remote --file=./schema.sql
```

```bash
cd worker && npx wrangler d1 execute gemba-safety --remote --file=./seed.sql
```

```bash
cd worker && npx wrangler d1 execute gemba-safety --remote --file=./seed-safety.sql
```

ตรวจว่าข้อมูลเข้าครบ — ต้องได้ `393 · 20 · 12 · 48 · 6 · 17`

```bash
cd worker && npx wrangler d1 execute gemba-safety --remote --command "SELECT (SELECT COUNT(*) FROM managers) mgrs, (SELECT COUNT(*) FROM areas) areas, (SELECT COUNT(*) FROM walk_themes) themes, (SELECT COUNT(*) FROM safety_checklist_items) items, (SELECT COUNT(*) FROM roles) roles, (SELECT COUNT(*) FROM permissions) perms"
```

### 2.4 สร้างที่เก็บรูป R2 — ✅ ทำให้แล้ว (`gemba-safety-photos`)

```bash
npx wrangler r2 bucket create gemba-safety-photos
```

### 2.5 ตั้งโทเคนแล้ว deploy Worker — ✅ ทำให้แล้ว

```bash
cd worker && npx wrangler secret put AUTH_TOKEN
```

พิมพ์ค่าที่ตั้งเองแล้วกด Enter (สุ่มยาว ๆ) — ค่านี้จะไม่ถูกบันทึกลง repo

```bash
cd worker && npx wrangler deploy
```

จดที่อยู่ที่ได้กลับมา เช่น `https://gemba-safety-api.<บัญชีของคุณ>.workers.dev`

### 2.6 ตั้งค่าฝั่งหน้าเว็บแล้ว deploy — ✅ ทำให้แล้ว

```bash
cp .env.example .env.local
```

| ตัวแปร | ค่า |
|---|---|
| `VITE_API_URL` | ที่อยู่ Worker จากขั้นที่แล้ว (ห้ามมี `/` ท้าย) |
| `VITE_AUTH_TOKEN` | ค่าเดียวกับที่ตั้งด้วย `wrangler secret put` |

```bash
npm run deploy
```

ครั้งแรกจะถามว่าจะสร้างโปรเจกต์ Pages ชื่อ `gemba-safety` ไหม — ตอบตกลง
ได้เว็บที่ <https://gemba-safety.pages.dev>

### 2.7 เปิดให้หน้าเว็บเรียก API ได้ (CORS)

แก้ `ALLOWED_ORIGIN` ใน `worker/wrangler.toml` ให้ตรงกับที่อยู่จริงของหน้าเว็บ
(ค่าตั้งต้นใส่ `https://gemba-safety.pages.dev` ไว้แล้ว — ถ้าใช้โดเมนอื่นให้เพิ่มเข้าไป คั่นด้วยจุลภาค ห้ามมี `/` ท้าย)
แล้ว deploy Worker ซ้ำ

```bash
cd worker && npx wrangler deploy
```

> ⚠️ **เรื่องความปลอดภัยที่ต้องรู้**
> `VITE_AUTH_TOKEN` ถูกฝังลงไฟล์ JavaScript ตอน build ใครเปิดหน้าเว็บได้ก็อ่านค่านี้ได้
> มันกันคนที่ยิง API ตรง ๆ จากภายนอก แต่ไม่ได้กันคนที่เข้าถึงหน้าเว็บ
> ด่านจริงของงานที่แก้กติกาของระบบคือ **เซสชันผู้ดูแล** ที่เซิร์ฟเวอร์ออกให้ (ตาราง `admin_sessions`)
> ถ้าต้องการกันระดับรายคนจริง ๆ ต้องเพิ่มระบบล็อกอินฝั่งเซิร์ฟเวอร์ที่ออก session token ต่อคน

---

## ส่วนที่ 3 — ตรวจว่าใช้ได้จริง

แทน `<TOKEN>` ด้วยโทเคนของคุณ และ `<API>` ด้วยที่อยู่ Worker

```bash
curl -s <API>/api/health
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" <API>/api/findings
```

```bash
curl -s -H "X-Auth-Token: <TOKEN>" "<API>/api/safety/summary?from=2026-09-01&to=2026-09-30"
```

**เกณฑ์ผ่าน** — คำสั่งแรกได้ `{"ok":true,...,"db":"ok"}` · คำสั่งที่สองได้ **401**
(ไม่ส่งโทเคนต้องเข้าไม่ได้) · คำสั่งที่สามได้ `{"ok":true,"data":{...}}`

**ทดสอบบนหน้าเว็บ** (เส้นทางเดียวกับที่ทดสอบไว้แล้วตอนพัฒนา)

1. เข้าสู่ระบบด้วยรหัสพนักงาน → ต้องเด้งไปหน้า "ใบแจ้งปัญหาความปลอดภัย"
2. ป้ายบนหัวจอต้องขึ้น **ซิงก์แล้ว** (ถ้าขึ้น "ออฟไลน์" แปลว่า `VITE_API_URL` ผิดหรือ CORS ยังไม่เปิด)
3. `/walk/new` → เลือกพื้นที่ + หมวด → เช็คลิสต์โผล่ → ติ๊ก "ไม่ผ่าน" หนึ่งข้อ → บันทึก
   → ต้องเด้งไปหน้าใบแจ้งปัญหาพร้อมใบใหม่
4. เปิดใบนั้น → **มอบหมาย** ผู้จัดการ + หัวหน้างาน → สถานะเปลี่ยนเป็น "มอบหมายแล้ว"
5. **บันทึกการแก้ไข** โดยไม่แนบรูป → ต้องขึ้นเตือน "ต้องแนบรูปหลังแก้ไขอย่างน้อย 1 รูป"
6. แนบรูปแล้วบันทึก → สถานะ "รอตรวจรับ" → กด **ตรวจรับผ่าน** → "ปิดงาน"
7. เปิดอีกเครื่อง/อีกเบราว์เซอร์ด้วยรหัสคนอื่น → ต้องเห็นใบเดียวกันและสถานะเดียวกัน

---

## ส่วนที่ 4 — กรอกทะเบียนสิทธิ์ผู้ใช้งาน

ตาราง `user_roles` ถูกเว้นว่างไว้ตั้งใจ ระบบจึงใช้งานได้ทันทีตั้งแต่วันแรก
โดยทุกคนที่ล็อกอินได้จะถือบทบาท `inspector` (เดินตรวจ + เปิดใบแจ้ง)

**วิธีที่ 1 — ผ่านหน้าเว็บ (แนะนำ)**
เข้าที่ `/admin` ด้วยรหัสผู้ดูแล → ไปที่ `/admin/roles` → เลือกคน · บทบาท · ขอบเขตพื้นที่ → กดเพิ่ม

**วิธีที่ 2 — ใส่ทีเดียวหลายคนด้วย SQL**

```bash
cd worker && npx wrangler d1 execute gemba-safety --remote --command "INSERT OR IGNORE INTO user_roles (id, manager_id, role_id, scope_area_id, granted_by, granted_at) SELECT 'ur_' || m.id || '_safety', m.id, 'role_safety', '*', 'setup', datetime('now') FROM managers m WHERE m.manager_code IN ('T-815','T-798')"
```

**เมื่อกรอกครบแล้ว** ให้เปลี่ยนบทบาทตั้งต้นเป็น `viewer` ที่หน้า `/admin/roles`
คนที่ไม่ได้อยู่ในทะเบียนสิทธิ์จะเหลือแค่สิทธิ์ดูอย่างเดียวทันที

---

## ส่วนที่ 5 — รายการ endpoint

```text
GET    /api/health                              ไม่ต้องใช้โทเคน

POST   /api/auth/login · /api/auth/admin · /api/auth/admin/session · /api/auth/admin/logout
GET    /api/login-history

GET    /api/managers · /api/areas · /api/themes · /api/settings        (แก้ไขต้องเป็นผู้ดูแล)
GET    /api/plans · /api/records                                        + POST/PUT/DELETE
GET    /api/focus ?date · /api/focus/list

── งานความปลอดภัย ─────────────────────────────────────────────────────
GET    /api/findings   ?from &to &status &severity &area_id &assignee_id &reported_by &limit &offset
GET    /api/findings/:id                        (แนบไทม์ไลน์มาด้วย)
POST   /api/findings · PUT /api/findings/:id
POST   /api/findings/:id/assign                 { assigned_manager_id, assigned_supervisor_id, due_date, note }
POST   /api/findings/:id/start                  รับงาน
POST   /api/findings/:id/fix                    { action_taken, root_cause, after_photos[] }  ← บังคับรูป
POST   /api/findings/:id/verify                 ตรวจรับผ่าน → ปิดงาน
POST   /api/findings/:id/reject                 ตีกลับ (ต้องมี note)
POST   /api/findings/:id/cancel · /reopen · /comment
GET    /api/finding-events ?finding_id &limit

GET    /api/checklist · POST /api/checklist · PUT /api/checklist/:id    (แก้ไขต้องเป็นผู้ดูแล)
GET    /api/checklist-results ?record_id

GET    /api/roles · /api/permissions · /api/user-roles
PUT    /api/roles/:id/permissions               (ผู้ดูแลเท่านั้น)
POST   /api/user-roles · DELETE /api/user-roles/:id   (ผู้ดูแลเท่านั้น)

GET    /api/notifications ?manager_id · POST /api/notifications/read

POST   /api/uploads · GET /api/uploads/:key · DELETE /api/uploads/:key
GET    /api/dashboard/summary ?from &to
GET    /api/safety/summary    ?from &to
GET    /api/export/csv        ?from &to
GET    /api/export/findings.csv ?from &to
```

**ตัวเลขสรุปทุกตัวคำนวณที่ Worker เท่านั้น ไม่รับค่าจาก client**

---

## ภาคผนวก ก — ย้ายจากฐานข้อมูลเดิม

ถ้าอยากใช้ฐานข้อมูลเดิมของ Gemba Walk (`gemba-audit`) ต่อ แทนการสร้างใหม่

1. เปลี่ยน `database_name` / `database_id` ใน `worker/wrangler.toml` ให้ชี้ฐานเดิม
2. รันสามไฟล์นี้ตามลำดับ

```bash
cd worker && npx wrangler d1 execute gemba-audit --remote --file=./schema.sql
```

```bash
cd worker && npx wrangler d1 execute gemba-audit --remote --file=./migrate-safety.sql
```

```bash
cd worker && npx wrangler d1 execute gemba-audit --remote --file=./seed-safety.sql
```

- `schema.sql` ใช้ `CREATE TABLE IF NOT EXISTS` ตารางเดิมจึงไม่ถูกแตะ
- `migrate-safety.sql` เพิ่ม 6 คอลัมน์ใน `app_settings` ที่ `CREATE TABLE` ข้ามไป
  (SQLite ไม่มี `ADD COLUMN IF NOT EXISTS` — รันซ้ำจะได้ error `duplicate column name` ซึ่งข้ามได้)
- หมวดการเดินเดิม 8 หัวข้อจะยังอยู่ แต่ `seed-safety.sql` ใส่ข้อตรวจไว้ให้หมวด `th_01`–`th_12`
  ถ้าใช้ฐานเดิมให้ไปเพิ่มหมวดที่ขาดเองที่ `/admin/settings` หรือรัน `seed.sql` ทับ (ใช้ `INSERT OR IGNORE`)
