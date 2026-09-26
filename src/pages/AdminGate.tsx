import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { BrandLogo } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/useData';
import { loginAdmin } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function AdminGate() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const { admin } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (admin) return <Navigate to="/admin/settings" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await loginAdmin(code);
    setBusy(false);
    // เข้าโหมดผู้ดูแลแบบออฟไลน์ไม่ได้ เพราะโทเคนที่เป็นด่านจริงออกจากเซิร์ฟเวอร์เท่านั้น
    if (res.error === 'offline') return setError(t('auth.adminOffline'));
    if (!res.admin) return setError(t('auth.adminWrong'));
    toast(t('auth.adminTitle'));
    navigate('/admin/settings');
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4">
      <Link to="/" className="focusable mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')}
      </Link>

      <div className="panel overflow-hidden">
        <div className="brand-stripe h-[3px] w-full" />
        <form onSubmit={submit} className="p-6">
          <BrandLogo className="mb-5 w-[132px]" />
          <div className="mb-1 flex items-center gap-2">
            <Shield className="h-4 w-4 text-accent" />
            <h1 className="text-lg font-semibold">{t('auth.adminTitle')}</h1>
          </div>
          <p className="mb-5 text-[13px] text-muted-foreground">{t('admin.gateHint')}</p>

          <label className="mb-1.5 block text-[13px] font-medium">{t('auth.adminCode')}</label>
          <Input
            autoFocus
            type="password"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(e) => (setCode(e.target.value), setError(null))}
            className="num h-14 text-center text-2xl tracking-[0.2em]"
          />
          {error ? <p className="mt-2 text-[12px] text-bad">{error}</p> : null}

          <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" disabled={busy || !code}>
            <Shield className="h-4 w-4" />
            {busy ? t('common.loading') : t('auth.signIn')}
          </Button>

        </form>
      </div>
    </div>
  );
}
