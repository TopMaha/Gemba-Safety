import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Shield } from 'lucide-react';
import { BrandLockup } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useSession, useSettings } from '@/hooks/useData';
import { loginManager } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { startSession } from '@/lib/session';
import { formatDate, todayISO } from '@/lib/time';

export default function Home() {
  const { t, lang, setLang } = useI18n();
  const { session } = useSession();
  const { data: settings } = useSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/findings" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await loginManager(code);
    setBusy(false);
    if (res.error === 'not_found') return setError(t('auth.wrongCode'));
    if (res.error === 'inactive') return setError(t('auth.inactive'));
    if (res.error === 'no_access') return setError(t('auth.noAccess'));
    if (res.manager) {
      startSession(res.manager);
      toast(`${t('auth.welcome')} ${res.manager.full_name}`);
      navigate('/findings');
    }
  };

  return (
    <div className="relative z-10 flex min-h-[100dvh] flex-col">
      {/* แถบบน */}
      <div className="flex items-center gap-3 px-4 pt-safe">
        <div className="flex h-14 w-full items-center gap-2.5">
          <BrandLockup logoClassName="w-[112px] sm:w-[128px]" />
          <div className="ml-auto flex h-8 items-center rounded-md border bg-card p-0.5">
            {(['th', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`press focusable h-7 rounded-[4px] px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${
                  lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 px-4 py-8 md:grid-cols-[1.1fr_.9fr] md:gap-12 md:py-16">
        {/* ฝั่งซ้าย: ข้อความหลัก */}
        <div className="stagger">
          <div className="mb-4 flex items-center gap-2">
            <span className="brand-stripe h-[3px] w-12 rounded-full" />
            <span className="label-micro">{t('home.tagline')}</span>
          </div>
          <h1 className="text-[clamp(2.4rem,9vw,4.2rem)] font-bold leading-[0.95] tracking-tight">
            Gemba
            <br />
            <span className="text-accent">Safety</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">{t('home.lead')}</p>

          <dl className="mt-7 grid max-w-md grid-cols-3 gap-3">
            {[
              { k: '01', th: 'เดินตรวจ', en: 'Inspect' },
              { k: '02', th: 'มอบหมายแก้ไข', en: 'Assign' },
              { k: '03', th: 'ตรวจรับปิดงาน', en: 'Verify' },
            ].map((s) => (
              <div key={s.k} className="panel px-3 py-2.5">
                <dt className="num text-[11px] font-semibold text-accent">{s.k}</dt>
                <dd className="mt-0.5 text-[13px] font-medium">{lang === 'th' ? s.th : s.en}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ฝั่งขวา: เข้าสู่ระบบ */}
        <div className="panel animate-fade-up overflow-hidden">
          <div className="brand-stripe h-[3px] w-full" />
          <form onSubmit={submit} className="p-5 sm:p-6">
            <div className="mb-1 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent" />
              <h2 className="text-base font-semibold">{t('auth.signIn')}</h2>
            </div>
            <p className="num mb-5 text-[11px] text-muted-foreground">
              {settings?.plant_name} · {formatDate(todayISO(), lang, { full: true })}
            </p>

            <label className="mb-1.5 block text-[13px] font-medium">{t('auth.managerCode')}</label>
            <Input
              autoFocus
              value={code}
              // รหัสพนักงานมีทั้งตัวอักษรและขีดกลาง (T-815 · PST742) จึงเป็นแป้นตัวอักษร
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('auth.codePlaceholder')}
              onChange={(e) => (setCode(e.target.value), setError(null))}
              className="num h-14 text-center text-2xl font-semibold uppercase tracking-[0.18em]"
            />
            {error ? <p className="mt-2 text-[12px] text-bad">{error}</p> : null}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t('auth.codeHint')}</p>

            <Button type="submit" variant="accent" size="lg" className="mt-4 w-full" disabled={busy || !code}>
              {busy ? t('common.loading') : t('auth.signIn')}
              <ArrowRight className="h-4 w-4" />
            </Button>

            <Link
              to="/admin"
              className="focusable mt-4 flex items-center justify-center gap-1.5 rounded-md py-2 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <Shield className="h-3.5 w-3.5" />
              {t('home.adminCta')}
            </Link>
          </form>
        </div>
      </div>

      <footer className="border-t px-4 py-4 text-center">
        <p className="num text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {settings?.company_name ?? 'TENNECO'} · GEMBA SAFETY
        </p>
      </footer>
    </div>
  );
}
