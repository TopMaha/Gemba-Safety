/**
 * สรุปผลสำหรับแดชบอร์ด — คำนวณที่ฝั่งเซิร์ฟเวอร์ทั้งหมด
 *
 * ⚠️ ห้ามรับตัวเลขสรุปจาก client มาใช้เด็ดขาด ทุกค่าคำนวณใหม่จากข้อมูลดิบที่นี่
 *
 * สูตรตรงกับ src/lib/calc.ts ของ frontend
 *   Adherence %  = แผนที่เดินแล้ว ÷ แผนที่ถึงกำหนดแล้ว × 100
 *                  (ไม่นับแผนที่ยกเลิก และไม่นับแผนที่ยังไม่ถึงกำหนด)
 *   Completion % = คนที่เดินหัวข้อนั้น (ไม่ซ้ำ) ÷ พนักงาน Active ทั้งหมด × 100
 *   ทุกเปอร์เซ็นต์ปัดลง (floor) ตามสเปก — 17/30 = 56%
 */

import { todayBangkok } from './http.js';

const pct = (a, b) => (b > 0 ? Math.floor((a / b) * 100) : 0);

export async function buildSummary(db, from, to) {
  const asOf = todayBangkok();

  const [plansRow, activeRow, recordsRow, themeRows, areaRows, issueRows] = await Promise.all([
    // Adherence — นับเฉพาะแผนที่ถึงกำหนดแล้ว หรือเดินไปแล้ว
    db
      .prepare(
        `SELECT COUNT(*) AS due,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_x
           FROM gemba_plans
          WHERE plan_date BETWEEN ? AND ?
            AND status <> 'cancelled'
            AND (plan_date <= ? OR status = 'completed')`,
      )
      .bind(from, to, asOf)
      .first(),

    db.prepare(`SELECT COUNT(*) AS n FROM managers WHERE is_active = 1`).first(),

    db
      .prepare(
        `SELECT COUNT(*) AS walks,
                COUNT(DISTINCT manager_id) AS walkers,
                SUM(CASE WHEN has_issue = 1 THEN 1 ELSE 0 END) AS issues,
                SUM(CASE WHEN plan_id IS NULL THEN 1 ELSE 0 END) AS adhoc
           FROM gemba_walk_records
          WHERE actual_date BETWEEN ? AND ?`,
      )
      .bind(from, to)
      .all()
      .then((r) => r.results[0]),

    // Completion รายหัวข้อ — นับ "คน" ไม่ซ้ำ
    db
      .prepare(
        `SELECT t.id, t.theme_name, t.theme_name_en,
                COUNT(DISTINCT r.manager_id) AS actual
           FROM walk_themes t
           LEFT JOIN record_themes rt ON rt.theme_id = t.id
           LEFT JOIN gemba_walk_records r
                  ON r.id = rt.record_id AND r.actual_date BETWEEN ? AND ?
          WHERE t.is_active = 1
          GROUP BY t.id
          ORDER BY t.id`,
      )
      .bind(from, to)
      .all(),

    // ความครอบคลุมพื้นที่ + พื้นที่ที่ห่างหายนานสุด
    db
      .prepare(
        `SELECT a.id, a.area_name,
                COUNT(r.id) AS visits,
                MAX(r.actual_date) AS last_visit
           FROM areas a
           LEFT JOIN gemba_walk_records r
                  ON r.actual_area_id = a.id AND r.actual_date BETWEEN ? AND ?
          WHERE a.is_active = 1
          GROUP BY a.id`,
      )
      .bind(from, to)
      .all(),

    // หัวข้อที่พบปัญหาบ่อยที่สุด (แทน "5 ข้อที่ NG บ่อย" ของระบบเช็คลิสต์)
    db
      .prepare(
        `SELECT t.id, t.theme_name, COUNT(*) AS issue_count
           FROM gemba_walk_records r
           JOIN record_themes rt ON rt.record_id = r.id
           JOIN walk_themes t ON t.id = rt.theme_id
          WHERE r.actual_date BETWEEN ? AND ? AND r.has_issue = 1
          GROUP BY t.id
          ORDER BY issue_count DESC, t.id
          LIMIT 5`,
      )
      .bind(from, to)
      .all(),
  ]);

  const activeManagers = activeRow?.n ?? 0;
  const due = plansRow?.due ?? 0;
  const done = plansRow?.done ?? 0;
  const walks = recordsRow?.walks ?? 0;
  const issues = recordsRow?.issues ?? 0;

  const themes = themeRows.results.map((t) => ({
    theme_id: t.id,
    theme_name: t.theme_name,
    theme_name_en: t.theme_name_en ?? undefined,
    plan: activeManagers,
    actual: t.actual,
    pct: pct(t.actual, activeManagers),
  }));

  const areas = areaRows.results;
  const neverVisited = areas.filter((a) => a.visits === 0).length;

  return {
    range: { from, to, as_of: asOf },

    adherence: {
      due,
      done,
      pct: pct(done, due),
    },

    walks: {
      total: walks,
      adhoc: recordsRow?.adhoc ?? 0,
      distinct_managers: recordsRow?.walkers ?? 0,
      active_managers: activeManagers,
    },

    issues: {
      total: issues,
      // สัดส่วนการเดินที่พบปัญหา — เทียบเท่า NG rate ของระบบเช็คลิสต์
      rate_pct: pct(issues, walks),
      open: issues,
    },

    // ภาพรวมหัวข้อ = ผลรวม actual ÷ ผลรวม plan (ตาม overallCompletion ใน calc.ts)
    theme_completion: {
      overall_pct: pct(
        themes.reduce((s, t) => s + t.actual, 0),
        themes.reduce((s, t) => s + t.plan, 0),
      ),
      rows: themes,
    },

    coverage: {
      total_areas: areas.length,
      visited: areas.length - neverVisited,
      never_visited: neverVisited,
      pct: pct(areas.length - neverVisited, areas.length),
    },

    top_issue_themes: issueRows.results.map((r) => ({
      theme_id: r.id,
      theme_name: r.theme_name,
      count: r.issue_count,
    })),
  };
}

/* ── ส่งออก CSV ─────────────────────────────────────────────────────────── */

/** หุ้มค่าตามกติกา CSV — ใส่เครื่องหมายคำพูดเมื่อมีอักขระพิเศษ */
function cell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /["',\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export async function buildCsv(db, from, to) {
  const { results } = await db
    .prepare(
      `SELECT r.actual_date, r.actual_time,
              m.manager_code, m.full_name, m.department,
              a.area_name,
              (SELECT group_concat(t.theme_name, ' | ' ORDER BY rt.sort_order)
                 FROM record_themes rt JOIN walk_themes t ON t.id = rt.theme_id
                WHERE rt.record_id = r.id) AS themes,
              r.observation, r.has_issue, r.issue_summary,
              r.ci_required, r.ci_ticket_no,
              (SELECT COUNT(*) FROM record_participants p WHERE p.record_id = r.id) AS participants,
              (SELECT COUNT(*) FROM record_photos ph WHERE ph.record_id = r.id) AS photos,
              CASE WHEN r.plan_id IS NULL THEN 'Ad-hoc' ELSE 'ตามแผน' END AS walk_type
         FROM gemba_walk_records r
         JOIN managers m ON m.id = r.manager_id
         JOIN areas a ON a.id = r.actual_area_id
        WHERE r.actual_date BETWEEN ? AND ?
        ORDER BY r.actual_date DESC, r.actual_time DESC`,
    )
    .bind(from, to)
    .all();

  const header = [
    'วันที่', 'เวลา', 'รหัสผู้จัดการ', 'ชื่อผู้จัดการ', 'แผนก', 'พื้นที่',
    'หัวข้อการเดิน', 'ประเภท', 'สิ่งที่สังเกต', 'พบปัญหา', 'สรุปปัญหา',
    'ต้องแก้ไข', 'เลขใบงาน CI', 'จำนวนผู้ร่วมเดิน', 'จำนวนรูป',
  ];

  const lines = [header.map(cell).join(',')];
  for (const r of results) {
    lines.push(
      [
        r.actual_date, r.actual_time, r.manager_code, r.full_name, r.department, r.area_name,
        r.themes ?? '', r.walk_type, r.observation,
        r.has_issue ? 'ใช่' : 'ไม่', r.issue_summary,
        r.ci_required ? 'ใช่' : 'ไม่', r.ci_ticket_no,
        r.participants, r.photos,
      ]
        .map(cell)
        .join(','),
    );
  }

  // BOM ข้างหน้า เพื่อให้ Excel เปิดแล้วอ่านภาษาไทยถูก (ตรงกับ downloadText ใน csv.ts)
  return '﻿' + lines.join('\r\n');
}
