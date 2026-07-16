import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, Copy, ExternalLink, KeyRound, Play, RefreshCw, Save, Send, ShieldCheck, XCircle } from 'lucide-react';
import { getNurtureDripConfig, getRecentDripLogs, invokeNurtureDrip, updateNurtureDripConfig, type DripLogWithLead } from '../../../lib/api';
import type { LeadDripLog, NurtureDripConfig } from '../../../lib/supabase';
import { NURTURE_DEPLOY_COMMAND, NURTURE_SECRET_KEYS, dripStatusLabel, dripStatusTone, dripStepLabel, summarizeDripLogs, supabaseSecretsUrl, validateNurtureConfig } from '../../../lib/leadDrip';
import { ConfirmDialog } from '../shared/ConfirmDialog';

type LogFilter = 'all' | LeadDripLog['status'];

function badgeClass(status: LeadDripLog['status']): string {
  const tone = dripStatusTone(status);
  if (tone === 'green') return 'bg-emerald-100 text-emerald-700';
  if (tone === 'amber') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

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
  const [logs, setLogs] = useState<DripLogWithLead[]>([]);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [logsLoading, setLogsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(c => (c === key ? null : c)), 1500);
    } catch {
      setError('Trình duyệt chặn clipboard. Chép tay đoạn văn bản này.');
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      setLogs(await getRecentDripLogs({ limit: 200 }));
    } catch {
      setLogs([]);
    } finally { setLogsLoading(false); }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const counts = useMemo(() => summarizeDripLogs(logs), [logs]);
  const filteredLogs = useMemo(() => logFilter === 'all' ? logs : logs.filter(l => l.status === logFilter), [logs, logFilter]);
  const secretsUrl = useMemo(() => supabaseSecretsUrl(endpoint), [endpoint]);

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
      await loadLogs();
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

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-black text-gray-900 flex items-center gap-2"><Send className="w-4 h-4 text-red-500" />Nhật ký gửi drip</h2>
            <p className="text-xs text-gray-500 mt-1">200 lượt gửi gần nhất. Theo dõi lead bị bỏ qua/lỗi để xử lý.</p>
          </div>
          <button onClick={loadLogs} disabled={logsLoading} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg disabled:opacity-50" title="Làm mới">
            <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'all' as LogFilter, label: 'Tổng', value: counts.total, tone: 'text-gray-900' },
            { key: 'sent' as LogFilter, label: 'Đã gửi', value: counts.sent, tone: 'text-emerald-600' },
            { key: 'skipped' as LogFilter, label: 'Bỏ qua', value: counts.skipped, tone: 'text-amber-600' },
            { key: 'failed' as LogFilter, label: 'Lỗi', value: counts.failed, tone: 'text-red-600' },
          ].map(s => (
            <button key={s.key} onClick={() => setLogFilter(s.key)}
              className={`text-left rounded-lg p-3 border transition-colors ${logFilter === s.key ? 'border-red-300 bg-red-50/50' : 'border-gray-100 bg-gray-50 hover:border-red-200'}`}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-xl font-black ${s.tone}`}>{s.value}</p>
            </button>
          ))}
        </div>

        {logsLoading ? (
          <div className="py-8 text-center text-gray-400 text-sm">Đang tải nhật ký…</div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">Chưa có lượt gửi nào{logFilter !== 'all' ? ` ở trạng thái “${dripStatusLabel(logFilter)}”` : ''}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left font-medium py-1.5">Khách</th>
                  <th className="text-left font-medium">Bước</th>
                  <th className="text-left font-medium">Trạng thái</th>
                  <th className="text-left font-medium">Chi tiết</th>
                  <th className="text-right font-medium">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 text-gray-800 font-medium">{log.leads?.full_name || log.leads?.phone || 'Khách'}</td>
                    <td className="text-gray-600">{dripStepLabel(log.step)}</td>
                    <td><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass(log.status)}`}>{dripStatusLabel(log.status)}</span></td>
                    <td className="text-gray-500 max-w-[220px] truncate">{log.detail || '—'}</td>
                    <td className="text-right text-gray-400">{new Date(log.sent_at).toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="font-black text-gray-900 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-red-500" />Kích hoạt production</h2>
          <p className="text-xs text-gray-500 mt-1">3 bước bật drip thật. Chạy trên máy đã đăng nhập Supabase CLI.</p>
        </div>

        <ol className="space-y-3">
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-black flex items-center justify-center">1</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">Deploy Edge Function</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-lg bg-gray-900 text-gray-100 px-3 py-2 text-xs font-mono">{NURTURE_DEPLOY_COMMAND}</code>
                <button onClick={() => copyText('deploy', NURTURE_DEPLOY_COMMAND)} className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  {copied === 'deploy' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === 'deploy' ? 'Đã chép' : 'Chép'}
                </button>
              </div>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-black flex items-center justify-center">2</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-800">Set secrets cho Edge Function</p>
                {secretsUrl && (
                  <a href={secretsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline">
                    Mở Supabase <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="mt-1 space-y-1.5">
                {NURTURE_SECRET_KEYS.map(key => (
                  <div key={key} className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-lg bg-gray-50 border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-700">{key}</code>
                    <button onClick={() => copyText(key, key)} className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                      {copied === key ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied === key ? 'Đã chép' : 'Chép'}
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1"><span className="font-mono">NURTURE_DRIP_SECRET</span> phải trùng secret trong form cấu hình phía trên. <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> có sẵn cho Edge Function, không cần set.</p>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-black flex items-center justify-center">3</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">Gán <span className="font-mono">zalo_user_id</span> cho lead</p>
              <p className="text-xs text-gray-500 mt-0.5">Chỉ gửi Zalo khi khách đã follow OA và có <span className="font-mono">zalo_user_id</span>. Thiếu token hoặc id thì log ghi <span className="font-semibold text-amber-600">Bỏ qua</span>, không gửi bừa theo SĐT.</p>
            </div>
          </li>
        </ol>
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
