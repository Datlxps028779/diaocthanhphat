import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, KeyRound, Play, RefreshCw, Save, Send, ShieldCheck, XCircle } from 'lucide-react';
import { getNurtureDripConfig, invokeNurtureDrip, updateNurtureDripConfig } from '../../../lib/api';
import type { NurtureDripConfig } from '../../../lib/supabase';
import { validateNurtureConfig } from '../../../lib/leadDrip';
import { ConfirmDialog } from '../shared/ConfirmDialog';

function resultText(code: number): string {
  if (code === 1) return 'Đã gửi lệnh quét tới Edge Function qua pg_net.';
  if (code === 0) return 'Drip đang tắt hoặc thiếu endpoint/secret.';
  if (code === -1) return 'Thiếu pg_net: cần bật extension hoặc chạy Edge Function thủ công.';
  return `Kết quả: ${code}`;
}

export function NurtureTab() {
  const [config, setConfig] = useState<NurtureDripConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmRun, setConfirmRun] = useState(false);
  const [lastRun, setLastRun] = useState<{ code: number; at: string } | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const row = await getNurtureDripConfig();
      setConfig(row);
      setEnabled(row?.enabled ?? false);
      setEndpoint(row?.endpoint ?? '');
      setSecret('');
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Không tải được cấu hình drip.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const statusTiles = useMemo(() => [
    { label: 'Trạng thái', value: enabled ? 'Đang bật' : 'Đang tắt', tone: enabled ? 'text-emerald-600' : 'text-gray-500', icon: enabled ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-gray-400" /> },
    { label: 'Endpoint', value: endpoint.trim() ? 'Đã cấu hình' : 'Chưa có', tone: endpoint.trim() ? 'text-emerald-600' : 'text-amber-600', icon: <Send className="w-4 h-4 text-blue-500" /> },
    { label: 'Secret', value: config?.secret || secret.trim() ? 'Đã cấu hình' : 'Chưa có', tone: config?.secret || secret.trim() ? 'text-emerald-600' : 'text-amber-600', icon: <KeyRound className="w-4 h-4 text-violet-500" /> },
  ], [config?.secret, enabled, endpoint, secret]);

  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const validation = validateNurtureConfig({
        enabled,
        endpoint,
        secret: secret || (config?.secret ? 'configured' : ''),
      });
      if (!validation.ok) { setError(validation.error); return; }
      const patch: Parameters<typeof updateNurtureDripConfig>[0] = {
        enabled: validation.value.enabled,
        endpoint: validation.value.endpoint,
      };
      if (secret.trim()) patch.secret = secret.trim();
      await updateNurtureDripConfig(patch);
      setMessage('Đã lưu cấu hình nuôi dưỡng.');
      await load();
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Không lưu được cấu hình.');
    } finally { setSaving(false); }
  };

  const runNow = async () => {
    setRunning(true); setError(''); setMessage('');
    try {
      const code = await invokeNurtureDrip();
      const at = new Date().toLocaleString('vi-VN');
      setLastRun({ code, at });
      setMessage(resultText(code));
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Không chạy được quét nuôi dưỡng.');
    } finally { setRunning(false); setConfirmRun(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Đang tải cấu hình...</div>;
  }

  return (
    <div className="space-y-4">
      {(error || message) && (
        <div className={`rounded-xl p-3 text-sm border ${error ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {statusTiles.map(t => (
          <div key={t.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">{t.icon}<span>{t.label}</span></div>
            <p className={`text-lg font-black ${t.tone}`}>{t.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-black text-gray-900 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-red-500" />Cấu hình Zalo drip</h2>
            <p className="text-xs text-gray-500 mt-1">DB cron gọi Edge Function qua endpoint + secret. Secret cũ không hiển thị lại; nhập secret mới nếu muốn đổi.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 select-none cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="rounded border-gray-300 text-red-600 focus:ring-red-400" />
            Bật drip
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Endpoint Edge Function</span>
            <input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://<project-ref>.supabase.co/functions/v1/nurture-drip"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">NURTURE_DRIP_SECRET</span>
            <input value={secret} onChange={e => setSecret(e.target.value)} type="password" placeholder={config?.secret ? 'Đã có secret — nhập nếu muốn đổi' : 'Nhập secret trùng với Edge Function secret'}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </label>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Lưu cấu hình
          </button>
          <button onClick={() => setConfirmRun(true)} disabled={running} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50">
            {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Quét nuôi dưỡng ngay
          </button>
          {lastRun && <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Lần chạy cuối: {lastRun.at} · {resultText(lastRun.code)}</span>}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-bold">Checklist production</p>
          <ol className="list-decimal ml-4 mt-1 space-y-0.5 text-xs">
            <li>Deploy Edge Function: <span className="font-mono">supabase functions deploy nurture-drip</span></li>
            <li>Set secrets: <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>, <span className="font-mono">NURTURE_DRIP_SECRET</span>, <span className="font-mono">ZALO_OA_TOKEN</span>.</li>
            <li>Secret trong form này phải trùng <span className="font-mono">NURTURE_DRIP_SECRET</span>.</li>
            <li>Lead cần <span className="font-mono">zalo_user_id</span>; chỉ có SĐT thì log sẽ là skipped.</li>
          </ol>
        </div>
      </div>

      {confirmRun && (
        <ConfirmDialog
          message="Chạy quét nuôi dưỡng ngay? Hệ thống sẽ gọi Edge Function; nếu đủ token và zalo_user_id có thể gửi Zalo thật."
          onConfirm={runNow}
          onCancel={() => setConfirmRun(false)}
        />
      )}
    </div>
  );
}
