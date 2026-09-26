import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Download, FileSpreadsheet } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatBlock } from '@/components/ui/card';
import { BandBar } from '@/components/ui/misc';
import { useChangeHistory, useCoreData, useSession } from '@/hooks/useData';
import { adherence, themeCompletion } from '@/lib/calc';
import { downloadText, toCsv } from '@/lib/csv';
import { managerLabel, themeLabel, useI18n } from '@/lib/i18n';
import { formatDate, startOfMonth, todayISO } from '@/lib/time';

export default function Report() {
  const { t, lang } = useI18n();
  const { admin } = useSession();
  const { managers, activeManagers, plans, records, themes, pathOf } = useCoreData();
  const { data: changes = [] } = useChangeHistory();
  const today = todayISO();
  const [from, setFrom] = useState(startOfMonth(today));
  const [to, setTo] = useState(today);

  if (!admin) return <Navigate to="/admin" replace />;

  const scopedPlans = plans.filter((p) => p.plan_date >= from && p.plan_date <= to);
  const scopedRecords = records.filter((r) => r.actual_date >= from && r.actual_date <= to);
  const ad = adherence(plans, from, to);

  const byDepartment = useMemo(() => {
    const depts = [...new Set(managers.map((m) => m.department))].sort();
    return depts.map((dept) => {
      const ids = managers.filter((m) => m.department === dept).map((m) => m.id);
      const dPlans = scopedPlans.filter((p) => ids.includes(p.manager_id) && p.status !== 'cancelled');
      const done = dPlans.filter((p) => p.status === 'completed').length;
      return {
        dept,
        people: ids.length,
        plans: dPlans.length,
        walks: scopedRecords.filter((r) => ids.includes(r.manager_id)).length,
        pct: dPlans.length ? Math.round((done / dPlans.length) * 100) : 0,
      };
    });
  }, [managers, scopedPlans, scopedRecords]);

  const byTheme = useMemo(
    () => themeCompletion(themes.filter((x) => x.is_active).map((x) => x.id), records, activeManagers, from, to),
    [themes, records, activeManagers, from, to],
  );

  const exportWalks = () => {
    const rows: (string | number)[][] = [
      ['record_id', 'plan_id', 'manager_code', 'manager_name', 'department', 'actual_date', 'actual_time', 'area_path', 'themes', 'observation', 'has_issue', 'issue_summary', 'photos', 'participants', 'ci_ticket_no', 'ci_ticket_link', 'completed_at'],
    ];
    scopedRecords.forEach((r) => {
      const m = managers.find((x) => x.id === r.manager_id);
      rows.push([
        r.id,
        r.plan_id ?? 'ad-hoc',
        m?.manager_code ?? '',
        m?.full_name ?? '',
        m?.department ?? '',
        r.actual_date,
        r.actual_time,
        pathOf(r.actual_area_id),
        r.theme_ids.map((id) => themeLabel(themes.find((x) => x.id === id), lang)).join(' | '),
        r.observation,
        r.has_issue ? 'YES' : 'NO',
        r.issue_summary ?? '',
        r.photo_urls.length,
        r.participant_names.join(' | '),
        r.ci_ticket_no ?? '',
        r.ci_ticket_link ?? '',
        r.completed_at,
      ]);
    });
    downloadText(`gemba-walks-${from}_${to}.csv`, toCsv(rows));
  };

  const exportPlans = () => {
    const rows: (string | number)[][] = [
      ['plan_id', 'manager_code', 'manager_name', 'plan_date', 'plan_time', 'area_path', 'themes', 'note', 'status'],
    ];
    scopedPlans.forEach((p) => {
      const m = managers.find((x) => x.id === p.manager_id);
      rows.push([
        p.id,
        m?.manager_code ?? '',
        m?.full_name ?? '',
        p.plan_date,
        p.plan_time,
        pathOf(p.area_id),
        p.theme_ids.map((id) => themeLabel(themes.find((x) => x.id === id), lang)).join(' | '),
        p.note ?? '',
        p.status,
      ]);
    });
    downloadText(`gemba-plans-${from}_${to}.csv`, toCsv(rows));
  };

  const exportAudit = () => {
    const rows: (string | number)[][] = [
      ['change_id', 'table_name', 'record_id', 'action_type', 'field', 'old_value', 'new_value', 'changed_by', 'changed_at'],
    ];
    changes.forEach((c) =>
      rows.push([c.id, c.table_name, c.record_id, c.action_type, c.field ?? '', c.old_value ?? '', c.new_value ?? '', c.changed_by, c.changed_at]),
    );
    downloadText(`gemba-audit-${todayISO()}.csv`, toCsv(rows));
  };

  return (
    <div>
      <PageTitle title={t('report.title')} subtitle={t('report.subtitle')} />

      <Card className="mb-4">
        <CardHeader title={t('report.range')} />
        <CardBody className="flex flex-wrap items-end gap-3">
          <label className="flex-1">
            <span className="label-micro mb-1 block">{t('report.from')}</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-11 w-full rounded-md border bg-card px-3 text-sm focusable"
            />
          </label>
          <label className="flex-1">
            <span className="label-micro mb-1 block">{t('report.to')}</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-11 w-full rounded-md border bg-card px-3 text-sm focusable"
            />
          </label>
          <span className="num pb-3 text-[11px] text-muted-foreground">
            {formatDate(from, lang)} – {formatDate(to, lang)}
          </span>
        </CardBody>
      </Card>

      <div className="stagger mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatBlock label={t('report.totalPlans')} value={scopedPlans.length} />
        <StatBlock label={t('report.totalWalks')} value={scopedRecords.length} tone="accent" />
        <StatBlock label={t('report.totalIssues')} value={scopedRecords.filter((r) => r.has_issue).length} tone="bad" />
        <StatBlock label={t('dash.adherence')} value={ad.pct} unit="%" sub={`${ad.done}/${ad.total}`} />
      </div>

      <Card className="mb-4">
        <CardHeader title={t('report.byDepartment')} />
        <div className="scroll-x">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2 text-left label-micro">{t('common.department')}</th>
                <th className="px-3 py-2 text-right label-micro">{t('common.people')}</th>
                <th className="px-3 py-2 text-right label-micro">{t('report.totalPlans')}</th>
                <th className="px-3 py-2 text-right label-micro">{t('report.totalWalks')}</th>
                <th className="px-3 py-2 text-left label-micro">{t('dash.adherence')}</th>
              </tr>
            </thead>
            <tbody>
              {byDepartment.map((d) => (
                <tr key={d.dept} className="border-b last:border-0">
                  <td className="px-3 py-2">{d.dept}</td>
                  <td className="num px-3 py-2 text-right">{d.people}</td>
                  <td className="num px-3 py-2 text-right">{d.plans}</td>
                  <td className="num px-3 py-2 text-right">{d.walks}</td>
                  <td className="px-3 py-2">
                    <BandBar pct={d.pct} showLabel />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader title={t('report.byTheme')} hint={`Plan = ${activeManagers.length} ${t('common.people')}`} />
        <CardBody className="space-y-3">
          {byTheme.map((row) => (
            <div key={row.theme_id}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {themeLabel(themes.find((x) => x.id === row.theme_id), lang)}
                </span>
                <span className="num shrink-0 text-[11px] text-muted-foreground">
                  {row.actual}/{row.plan}
                </span>
              </div>
              <BandBar pct={row.pct} showLabel />
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('common.export')} right={<FileSpreadsheet className="h-4 w-4 text-muted-foreground" />} />
        <CardBody className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportWalks}>
            <Download className="h-4 w-4" />
            {t('report.exportWalks')}
          </Button>
          <Button variant="outline" onClick={exportPlans}>
            <Download className="h-4 w-4" />
            {t('report.exportPlans')}
          </Button>
          <Button variant="outline" onClick={exportAudit}>
            <Download className="h-4 w-4" />
            {t('report.exportAudit')}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
