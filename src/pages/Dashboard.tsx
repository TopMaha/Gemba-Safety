import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Lock, Medal, TrendingUp } from 'lucide-react';
import { BarList, ColumnChart, Meter, SegmentedBar, type BarRow, type Segment } from '@/components/charts';
import { PageTitle } from '@/components/ManagerShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatBlock } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, BandBar, EmptyState, InfoHint, SectionTitle, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { FindingCard } from '@/components/safety/FindingBits';
import { useCoreData, useFindings, useSession } from '@/hooks/useData';
import { countFindings, sortFindings } from '@/lib/safety';
import { adherence, bandOf, overallCompletion, rankManagers, themeCompletion } from '@/lib/calc';
import { managerLabel, themeLabel, useI18n } from '@/lib/i18n';
import {
  addMonths,
  addDays,
  endOfMonth,
  endOfWeek,
  formatDate,
  formatMonth,
  formatRange,
  formatWeekday,
  monthKey,
  rangeDays,
  startOfMonth,
  startOfWeek,
  todayISO,
} from '@/lib/time';
import { cn } from '@/lib/utils';

type Scope = 'week' | 'month';

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { session, admin } = useSession();
  const { walkers, areas, managers, plans, records, themes, isLoading } = useCoreData();
  const { data: allFindings } = useFindings();

  const [scope, setScope] = useState<Scope>('week');
  const [offset, setOffset] = useState(0);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([monthKey(todayISO())]);
  const [missingOf, setMissingOf] = useState<string | null>(null);

  const today = todayISO();

  const { from, to, label } = useMemo(() => {
    if (scope === 'week') {
      const anchor = addDays(today, offset * 7);
      const s = startOfWeek(anchor);
      const e = endOfWeek(anchor);
      return { from: s, to: e, label: formatRange(s, e, lang) };
    }
    const anchor = addMonths(today, offset);
    const s = startOfMonth(anchor);
    return { from: s, to: endOfMonth(anchor), label: formatMonth(monthKey(anchor), lang, true) };
  }, [scope, offset, today, lang]);

  /**
   * ใบแจ้งปัญหาที่พบในช่วงที่เลือก + ใบที่ยังค้างอยู่ทั้งหมด
   * ตัวเลข "ค้างอยู่" ไม่ผูกกับช่วงเวลาโดยตั้งใจ — ใบที่เปิดตั้งแต่เดือนที่แล้ว
   * แล้วยังไม่ปิดคือของที่ต้องตามวันนี้ ไม่ใช่ของที่หายไปพร้อมกับเดือนที่ผ่านไป
   */
  const findingStats = useMemo(() => {
    const all = allFindings ?? [];
    const inRange = all.filter((x) => x.reported_at.slice(0, 10) >= from && x.reported_at.slice(0, 10) <= to);
    return {
      found: inRange.length,
      counts: countFindings(all),
      urgent: sortFindings(all).filter((x) => ['open', 'assigned', 'in_progress', 'fixed'].includes(x.status)).slice(0, 5),
    };
  }, [allFindings, from, to]);

  /** ช่วงข้อมูลของแท็บ "สรุปหัวข้อ" — เดือนเลือกได้หลายเดือน */
  const themeRange = useMemo(() => {
    if (scope === 'week') return { from, to, label };
    const months = [...selectedMonths].sort();
    if (!months.length) return { from, to, label };
    return {
      from: `${months[0]}-01`,
      to: endOfMonth(`${months[months.length - 1]}-01`),
      label: months.map((m) => formatMonth(m, lang)).join(', '),
    };
  }, [scope, selectedMonths, from, to, label, lang]);

  const activeThemes = themes.filter((th) => th.is_active);
  const chosenThemes = selectedThemes.length ? selectedThemes : activeThemes.map((th) => th.id);

  const myAdherence = useMemo(
    () => adherence(plans, from, to, session?.manager_id),
    [plans, from, to, session],
  );
  const teamAdherence = useMemo(() => adherence(plans, from, to), [plans, from, to]);
  const ranks = useMemo(() => rankManagers(walkers, plans, records, from, to), [walkers, plans, records, from, to]);
  const myRank = ranks.find((r) => r.manager.id === session?.manager_id);
  const teamWalks = records.filter((r) => r.actual_date >= from && r.actual_date <= to);

  const completionRows = useMemo(
    () => themeCompletion(chosenThemes, records, walkers, themeRange.from, themeRange.to),
    [chosenThemes, records, walkers, themeRange],
  );
  const overall = overallCompletion(completionRows);

  const days = useMemo(() => rangeDays(from, to), [from, to]);

  /* ── ข้อมูลของกราฟภาพรวม ── */

  // ตัวเลขใหญ่: ของฉันถ้าล็อกอินเป็นผู้เดิน ไม่งั้น (โหมดผู้ดูแล) ของทั้งทีม
  const headline = session ? myAdherence : teamAdherence;
  // ไม่มีแผนในช่วงนี้ = ยังวัดไม่ได้ ไม่ใช่ 0% (แถบแดง 0% จะอ่านว่าทำไม่ได้ ทั้งที่ไม่มีอะไรให้ทำ)
  const adherenceRows = [
    ...(session ? [{ key: 'me', label: t('chart.adherenceMine'), pct: myAdherence.pct, total: myAdherence.total }] : []),
    { key: 'team', label: t('chart.adherenceTeam'), pct: teamAdherence.pct, total: teamAdherence.total },
  ];

  const dayColumns = useMemo(
    () =>
      days.map((d, i) => {
        const n = teamWalks.filter((r) => r.actual_date === d).length;
        const day = Number(d.slice(8, 10));
        return {
          key: d,
          // สัปดาห์: ชื่อวัน · เดือน: ทุก 5 วัน กันป้ายเบียดกัน
          tick: scope === 'week' ? formatWeekday(d, lang) : i === 0 || day % 5 === 0 ? String(day) : '',
          value: n,
          readout: t('chart.dayValue', { date: formatDate(d, lang), n }),
          mark: d === today,
        };
      }),
    [days, teamWalks, scope, lang, t, today],
  );

  const statusSegments: Segment[] = useMemo(() => {
    const all = (allFindings ?? []).filter((x) => x.status !== 'cancelled');
    const n = (st: string[]) => all.filter((x) => st.includes(x.status)).length;
    return [
      { key: 'open', label: t('chart.stOpen'), value: n(['open']), color: 'var(--chart-open)' },
      { key: 'working', label: t('chart.stWorking'), value: n(['assigned', 'in_progress']), color: 'var(--chart-working)' },
      { key: 'waiting', label: t('chart.stWaiting'), value: n(['fixed']), color: 'var(--chart-waiting)', ink: 'black' },
      { key: 'closed', label: t('chart.stClosed'), value: n(['closed']), color: 'var(--chart-closed)' },
    ];
  }, [allFindings, t]);
  const statusTotal = statusSegments.reduce((sum, x) => sum + x.value, 0);
  const statusAria = statusSegments.map((x) => `${x.label} ${x.value}`).join(', ');

  // หัวข้อที่พบปัญหามากสุด 5 อันดับ ที่เหลือรวมเป็น "อื่น ๆ"
  const topicRows: BarRow[] = useMemo(() => {
    const inRange = (allFindings ?? []).filter(
      (x) => x.status !== 'cancelled' && x.reported_at.slice(0, 10) >= from && x.reported_at.slice(0, 10) <= to,
    );
    const counts = new Map<string, number>();
    for (const x of inRange) counts.set(x.theme_id ?? '', (counts.get(x.theme_id ?? '') ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5).map(([id, value]) => ({
      key: id || 'none',
      label: id ? themeLabel(themes.find((th) => th.id === id), lang) : t('chart.other'),
      value,
      muted: !id,
    }));
    const rest = sorted.slice(5).reduce((sum, [, v]) => sum + v, 0);
    return rest ? [...top, { key: 'other', label: t('chart.other'), value: rest, muted: true }] : top;
  }, [allFindings, from, to, themes, lang, t]);

  const personRows: BarRow[] = useMemo(
    () =>
      ranks.slice(0, 8).map((r) => ({
        key: r.manager.id,
        label: managerLabel(r.manager, lang),
        value: r.walks,
        note: r.planned ? `${r.adherence}%` : '—',
        mark: r.manager.id === session?.manager_id,
      })),
    [ranks, lang, session],
  );

  if (!admin && session && !session.dashboard_enabled) {
    return (
      <div>
        <PageTitle title={t('dash.title')} />
        <EmptyState icon={<Lock className="h-8 w-8" />} title={t('dash.noAccess')} hint={t('dash.noAccessHint')} />
      </div>
    );
  }

  const missingRow = completionRows.find((r) => r.theme_id === missingOf);

  return (
    <div>
      <PageTitle title={t('dash.title')} />

      {/* ตัวเลือกช่วงเวลา */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={scope} onValueChange={(v) => (setScope(v as Scope), setOffset(0))}>
          <TabsList>
            <TabsTrigger value="week">{t('common.week')}</TabsTrigger>
            <TabsTrigger value="month">{t('common.month')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-1 rounded-md border bg-card px-1 py-0.5">
          <Button variant="ghost" size="iconSm" onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="num min-w-[130px] text-center text-[12px] font-medium">{label}</span>
          <Button variant="ghost" size="iconSm" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[86px]" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">{t('dash.tabOverview')}</TabsTrigger>
            <TabsTrigger value="themes">{t('dash.tabThemes')}</TabsTrigger>
          </TabsList>

          {/* ── ภาพรวม (กราฟ) ─────────────────────────── */}
          <TabsContent value="overview" className="space-y-4">
            <div className="stagger grid gap-4 md:grid-cols-2">
              {/* เดินตามแผน — ของฉันกับทั้งทีม */}
              <Card>
                <CardHeader
                  title={t('chart.adherence')}
                  right={
                    <InfoHint label={t('dash.adherence')}>
                      <p className="font-medium">{t('dash.adherence')}</p>
                      <p className="mt-1 text-muted-foreground">{t('dash.adherenceHint')}</p>
                      <p className="num mt-2">
                        {headline.done} ÷ {headline.total} × 100 = {headline.pct}%
                      </p>
                    </InfoHint>
                  }
                />
                <CardBody className="space-y-4 pt-1">
                  <div className="flex items-end gap-3">
                    <span className="text-[44px] font-semibold leading-none tracking-tight">
                      {headline.total ? headline.pct : '—'}
                      {headline.total ? <span className="ml-0.5 text-[20px] text-muted-foreground">%</span> : null}
                    </span>
                    <span className="pb-1 text-[12px] text-muted-foreground">
                      {headline.total
                        ? t('chart.adherenceSub', { done: headline.done, total: headline.total })
                        : t('chart.noPlans')}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {adherenceRows.map((row) => (
                      <div key={row.key}>
                        <div className="mb-1 flex items-baseline justify-between text-[12px]">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className="font-semibold">{row.total ? `${row.pct}%` : '—'}</span>
                        </div>
                        <Meter
                          pct={row.total ? row.pct : 0}
                          tone={row.total ? bandOf(row.pct) : 'accent'}
                          label={`${row.label} ${row.total ? `${row.pct}%` : '—'}`}
                        />
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>

              {/* สถานะใบแจ้งปัญหา — ก้อนเดียวแบ่งตามสถานะ */}
              <Card>
                <CardHeader
                  title={t('chart.findings')}
                  right={
                    <Link to="/findings" className="focusable text-[12px] font-medium text-accent hover:underline">
                      {t('chart.findingsTotal', { n: statusTotal })}
                    </Link>
                  }
                />
                <CardBody className="space-y-3 pt-1">
                  <SegmentedBar segments={statusSegments} ariaLabel={statusAria} />
                  {findingStats.counts.overdue ? (
                    <Link
                      to="/findings"
                      className="focusable flex min-h-[40px] items-center gap-2 rounded-md border border-bad/30 bg-bad/[0.07] px-3 text-[12px] font-medium text-bad"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                      {t('chart.overdue', { n: findingStats.counts.overdue })}
                    </Link>
                  ) : null}
                </CardBody>
              </Card>
            </div>

            {/* จำนวนครั้งที่เดินรายวัน */}
            <Card>
              <CardHeader title={t('chart.walksByDay')} hint={label} />
              <CardBody className="pt-1">
                <ColumnChart
                  columns={dayColumns}
                  ariaLabel={t('chart.walksByDay')}
                  summary={
                    <>
                      {t('chart.walksTotal', { n: teamWalks.length })} ·{' '}
                      {t('chart.walksWithIssue', { n: teamWalks.filter((r) => r.has_issue).length })} ·{' '}
                      <span className="font-sans">{t('chart.tapHint')}</span>
                    </>
                  }
                />
              </CardBody>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {/* ปัญหาที่พบตามหัวข้อ */}
              <Card>
                <CardHeader title={t('chart.byTopic')} hint={t('chart.byTopicHint')} />
                <CardBody className="pt-1">
                  {topicRows.length ? (
                    <BarList rows={topicRows} ariaLabel={t('chart.byTopic')} />
                  ) : (
                    <p className="py-4 text-center text-[12px] text-muted-foreground">{t('chart.noData')}</p>
                  )}
                </CardBody>
              </Card>

              {/* การเดินรายคน */}
              <Card>
                <CardHeader title={t('chart.byPerson')} hint={t('chart.byPersonHint')} />
                <CardBody className="pt-1">
                  {personRows.length ? (
                    <BarList rows={personRows} ariaLabel={t('chart.byPerson')} />
                  ) : (
                    <p className="py-4 text-center text-[12px] text-muted-foreground">{t('chart.noData')}</p>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* งานแก้ไขที่ต้องตามก่อน */}
            {findingStats.urgent.length ? (
              <section>
                <SectionTitle
                  right={
                    <Link to="/findings" className="focusable text-[12px] text-accent hover:underline">
                      {t('safety.title')}
                    </Link>
                  }
                >
                  {t('safety.filterOpen')}
                </SectionTitle>
                <div className="space-y-2">
                  {findingStats.urgent.slice(0, 3).map((x) => (
                    <FindingCard key={x.id} finding={x} areas={areas} managers={managers} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* ตารางการเดินรายบุคคล */}
            <Card>
              <CardHeader
                title={t('dash.heatTitle')}
                hint={t('dash.heatHint')}
                right={
                  <Badge tone="neutral" size="md">
                    {t('dash.adherence')} {teamAdherence.pct}%
                  </Badge>
                }
              />
              <div className="scroll-x">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left label-micro">{t('common.manager')}</th>
                      {days.map((d) => (
                        <th key={d} className="px-0.5 py-2 text-center">
                          <span className="num block text-[10px] text-muted-foreground">{Number(d.slice(8, 10))}</span>
                        </th>
                      ))}
                      <th className="px-2 py-2 text-right label-micro">{t('dash.walks')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranks.map((row) => (
                      <tr key={row.manager.id} className="border-b last:border-0">
                        <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={managerLabel(row.manager, lang)}
                              src={row.manager.avatar_url}
                              seed={row.manager.id}
                              size={24}
                            />
                            <span className="max-w-[130px] truncate text-[12px] font-medium">
                              {managerLabel(row.manager, lang)}
                            </span>
                          </div>
                        </td>
                        {days.map((d) => {
                          const n = records.filter(
                            (r) => r.manager_id === row.manager.id && r.actual_date === d,
                          ).length;
                          return (
                            <td key={d} className="px-0.5 py-1.5">
                              <span
                                title={`${formatDate(d, lang)} · ${n}`}
                                className={cn(
                                  'mx-auto block h-5 w-5 rounded-[3px] border',
                                  n === 0 && 'border-border bg-muted/50',
                                  n === 1 && 'border-accent/40 bg-accent/35',
                                  n === 2 && 'border-accent/60 bg-accent/65',
                                  n >= 3 && 'border-accent bg-accent',
                                )}
                              />
                            </td>
                          );
                        })}
                        <td className="num px-2 py-1.5 text-right text-[12px] font-semibold">{row.walks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* ── สรุปหัวข้อการเดิน ───────────────────────── */}
          <TabsContent value="themes" className="space-y-4">
            {scope === 'month' ? (
              <div>
                <SectionTitle>{t('dash.pickMonths')}</SectionTitle>
                <div className="scroll-x no-scrollbar flex gap-1.5 pb-1">
                  {Array.from({ length: 6 }, (_, i) => monthKey(addMonths(today, -i))).map((m) => {
                    const on = selectedMonths.includes(m);
                    return (
                      <button
                        key={m}
                        onClick={() =>
                          setSelectedMonths((prev) =>
                            on ? (prev.length > 1 ? prev.filter((x) => x !== m) : prev) : [...prev, m],
                          )
                        }
                        className={cn(
                          'press focusable shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium',
                          on ? 'border-accent bg-accent/15 text-foreground' : 'bg-card text-muted-foreground',
                        )}
                      >
                        {formatMonth(m, lang)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <SectionTitle
                right={
                  selectedThemes.length ? (
                    <button onClick={() => setSelectedThemes([])} className="text-[11px] text-accent hover:underline">
                      {t('common.clear')}
                    </button>
                  ) : null
                }
              >
                {t('dash.pickThemes')}
              </SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {activeThemes.map((th) => {
                  const on = selectedThemes.includes(th.id);
                  const name = themeLabel(th, lang);
                  const m = /^(\d+)[-.\s]\s*(.*)$/.exec(name);
                  return (
                    <button
                      key={th.id}
                      onClick={() =>
                        setSelectedThemes((prev) => (on ? prev.filter((x) => x !== th.id) : [...prev, th.id]))
                      }
                      className={cn(
                        'press focusable flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[12px]',
                        on ? 'border-accent bg-accent/15 font-medium' : 'bg-card text-muted-foreground',
                      )}
                    >
                      {m ? <span className="num font-semibold text-accent">{m[1]}</span> : null}
                      <span className="max-w-[160px] truncate">{m ? m[2] : name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ภาพรวมหัวข้อที่เลือก — เฉพาะมุมมองเดือน */}
            {scope === 'month' ? (
              <Card accent>
                <CardBody className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="label-micro">{t('dash.overallCard')}</span>
                      <InfoHint>
                        <p className="font-medium">{t('dash.overallCard')}</p>
                        <p className="mt-1 text-muted-foreground">{t('dash.overallHint')}</p>
                        <p className="num mt-2">
                          {overall.actual} ÷ {overall.plan} × 100 = {overall.pct}%
                        </p>
                      </InfoHint>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span
                        className={cn(
                          'num text-[34px] font-semibold leading-none',
                          bandOf(overall.pct) === 'ok' ? 'text-ok' : bandOf(overall.pct) === 'warn' ? 'text-warn' : 'text-bad',
                        )}
                      >
                        {overall.pct}%
                      </span>
                      <span className="num text-sm text-muted-foreground">
                        {overall.actual}/{overall.plan}
                      </span>
                    </div>
                    <p className="num mt-1 text-[10px] text-muted-foreground">{themeRange.label}</p>
                  </div>
                  <TrendingUp className="ml-auto h-10 w-10 text-accent/30" />
                </CardBody>
              </Card>
            ) : null}

            <Card>
              <CardHeader
                title={t('dash.themeSummary')}
                hint={`${t('dash.scope')}: ${themeRange.label} · Plan = ${walkers.length} ${t('common.people')}`}
              />
              <CardBody className="space-y-3">
                {completionRows.map((row) => {
                  const th = themes.find((x) => x.id === row.theme_id);
                  return (
                    <div key={row.theme_id}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px]">{themeLabel(th, lang)}</span>
                        <button
                          onClick={() => setMissingOf(row.theme_id)}
                          className="num focusable shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold hover:border-accent hover:text-accent"
                          title={t('dash.notWalked')}
                        >
                          {row.actual}/{row.plan}
                        </button>
                      </div>
                      <BandBar pct={row.pct} showLabel />
                    </div>
                  );
                })}
                {!completionRows.length ? (
                  <EmptyState title={t('common.noData')} className="border-0 py-6" />
                ) : null}
              </CardBody>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* รายชื่อผู้ที่ยังไม่เดิน */}
      <Dialog open={!!missingOf} onOpenChange={(o) => !o && setMissingOf(null)}>
        {missingRow ? (
          <DialogContent
            title={t('dash.notWalkedTitle', {
              theme: themeLabel(themes.find((x) => x.id === missingRow.theme_id), lang),
            })}
            description={`${themeRange.label} · ${missingRow.actual}/${missingRow.plan} (${missingRow.pct}%)`}
          >
            {missingRow.missingManagerIds.length ? (
              <ul className="space-y-1.5">
                {missingRow.missingManagerIds.map((id) => {
                  const m = walkers.find((x) => x.id === id);
                  return (
                    <li key={id} className="flex items-center gap-2.5 rounded-md border px-3 py-2">
                      <Avatar name={managerLabel(m, lang)} src={m?.avatar_url} seed={id} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{managerLabel(m, lang)}</div>
                        <div className="num text-[10px] text-muted-foreground">
                          {m?.manager_code} · {m?.department}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title={t('dash.allWalked')} className="border-0" />
            )}
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
