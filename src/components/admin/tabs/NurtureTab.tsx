import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, Copy, ExternalLink, GripVertical, KeyRound, Play, Plus, RefreshCw, Save, Send, ShieldCheck, Sparkles, Trash2, Users, XCircle } from 'lucide-react';
import {
  countEligibleLeads, createDripStep, deleteDripStep, getDripSteps, getNurtureDripConfig, getRecentDripLogs,
  invokeNurtureDrip, reorderDripSteps, updateDripStep, updateNurtureDripConfig, type DripLogWithLead, type DripStepInput,
} from '../../../lib/api';
import type { LeadDripLog, NurtureDripConfig, NurtureDripStep } from '../../../lib/supabase';
import { PIPELINE_STAGES, type StageKey } from '../../../lib/leadPipeline';
import {
  DRIP_CHANNELS, NURTURE_DEPLOY_COMMAND, NURTURE_SECRET_KEYS, SAMPLE_LEAD, TEMPLATE_VARS, channelLabel, channelReady,
  dripStatusLabel, dripStatusTone, dripStepLabel, renderDripMessage, stepLabelFromDays, summarizeDripLogs,
  supabaseSecretsUrl, validateDripStep, validateNurtureConfig, type DripChannel,
} from '../../../lib/leadDrip';
import { ConfirmDialog } from '../shared/ConfirmDialog';

type LogFilter = 'all' | LeadDripLog['status'];

const OPEN_STAGES = PIPELINE_STAGES.filter(s => s.type === 'open');

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
  const [eligibleStatuses, setEligibleStatuses] = useState<StageKey[]>([]);
  const [requirePhone, setRequirePhone] = useState(true);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [steps, setSteps] = useState<NurtureDripStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmRun, setConfirmRun] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
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
      const [row, stepRows] = await Promise.all([getNurtureDripConfig(), getDripSteps()]);
      setConfig(row);
      setEnabled(row?.enabled ?? false);
      setEndpoint(row?.endpoint ?? '');
      setSecret('');
      setEligibleStatuses((row?.eligible_statuses as StageKey[] | undefined) ?? OPEN_STAGES.map(s => s.key));
      setRequirePhone(row?.require_phone ?? true);
      setSteps(stepRows);
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Không tải được cấu hình drip.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Badge "N lead đủ điều kiện" — cập nhật theo luật lọc đang chọn.
  useEffect(() => {
    let cancelled = false;
    countEligibleLeads({ eligible_statuses: eligibleStatuses, require_phone: requirePhone })
      .then(n => { if (!cancelled) setEligibleCount(n); })
      .catch(() => { if (!cancelled) setEligibleCount(null); });
    return () => { cancelled = true; };
  }, [eligibleStatuses, requirePhone]);

  const statusTiles = useMemo(() => [
    { label: 'Trạng thái', value: enabled ? 'Đang bật' : 'Đang tắt', tone: enabled ? 'text-emerald-600' : 'text-gray-500', icon: enabled ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-gray-400" /> },
    { label: 'Endpoint', value: endpoint.trim() ? 'Đã cấu hình' : 'Chưa có', tone: endpoint.trim() ? 'text-emerald-600' : 'text-amber-600', icon: <Send className="w-4 h-4 text-blue-500" /> },
    { label: 'Secret', value: config?.secret || secret.trim() ? 'Đã cấu hình' : 'Chưa có', tone: config?.secret || secret.trim() ? 'text-emerald-600' : 'text-amber-600', icon: <KeyRound className="w-4 h-4 text-violet-500" /> },
  ], [config?.secret, enabled, endpoint, secret]);

  const toggleStage = (key: StageKey) => {
    setEligibleStatuses(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const validation = validateNurtureConfig({
        enabled,
        endpoint,
        secret: secret || (config?.secret ? 'configured' : ''),
      });
      if (!validation.ok) { setError(validation.error); return; }
      if (eligibleStatuses.length === 0) { setError('Chọn ít nhất một giai đoạn lead để nuôi dưỡng.'); return; }
      const patch: Parameters<typeof updateNurtureDripConfig>[0] = {
        enabled: validation.value.enabled,
        endpoint: validation.value.endpoint,
        eligible_statuses: eligibleStatuses,
        require_phone: requirePhone,
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

  const patchStepLocal = (id: string, patch: Partial<NurtureDripStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const saveStep = async (step: NurtureDripStep) => {
    const check = validateDripStep(step);
    if (!check.ok) { setError(check.error ?? 'Bước không hợp lệ.'); return; }
    setError(''); setMessage('');
    try {
      const patch: Partial<DripStepInput> = {
        delay_days: step.delay_days, channel: step.channel, message_template: step.message_template, enabled: step.enabled,
      };
      await updateDripStep(step.id, patch);
      setMessage('Đã lưu bước chăm sóc.');
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Không lưu được bước.');
    }
  };

  const addStep = async () => {
    setError(''); setMessage('');
    try {
      const nextDelay = steps.length ? Math.max(...steps.map(s => s.delay_days)) + 2 : 1;
      const created = await createDripStep({
        delay_days: nextDelay, channel: 'zalo', enabled: true,
        message_template: '{ten} ơi, Dia Oc Thanh Phat có thêm lựa chọn phù hợp với {nhu_cau}. Nhắn lại nếu mình muốn xem nhé.',
      });
      setSteps(prev => [...prev, created]);
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Không thêm được bước.');
    }
  };

  const removeStep = async (id: string) => {
    setDeleteId(null); setError(''); setMessage('');
    try {
      await deleteDripStep(id);
      setSteps(prev => prev.filter(s => s.id !== id));
      setMessage('Đã xóa bước chăm sóc.');
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Không xóa được bước.');
    }
  };

  const moveStep = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);
    try {
      await reorderDripSteps(next.map(s => s.id));
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Không đổi được thứ tự.');
      await load();
    }
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

      {/* KHỐI 1 — Nuôi dưỡng AI */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-black text-gray-900 flex items-center gap-2"><Users className="w-4 h-4 text-red-500" />Nuôi dưỡng ai?</h2>
            <p className="text-xs text-gray-500 mt-1">Chọn giai đoạn lead được đưa vào chuỗi chăm sóc tự động.</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Hiện đủ điều kiện</p>
            <p className="text-2xl font-black text-red-600">{eligibleCount ?? '—'}<span className="text-sm font-semibold text-gray-400"> lead</span></p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {OPEN_STAGES.map(stage => {
            const on = eligibleStatuses.includes(stage.key);
            return (
              <button key={stage.key} onClick={() => toggleStage(stage.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${on ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-500 hover:border-red-200'}`}>
                <span className={`w-2 h-2 rounded-full ${stage.dot}`} />{stage.label}
                {on && <CheckCircle className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>

        <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 select-none cursor-pointer">
          <input type="checkbox" checked={requirePhone} onChange={e => setRequirePhone(e.target.checked)} className="rounded border-gray-300 text-red-600 focus:ring-red-400" />
          Chỉ nuôi dưỡng lead có số điện thoại
        </label>

        <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
          Luật cố định (luôn áp dụng): bỏ qua lead <b>đã chốt/đã mất</b>; bỏ qua khi lead <b>đang có lịch hẹn</b> trong tương lai;
          mỗi bước chỉ gửi <b>một lần</b> cho mỗi lead. Số đếm trên là ước lượng theo giai đoạn + SĐT, chưa tính tuổi lead và bước đã gửi.
        </p>
      </div>

      {/* KHỐI 2 — Kịch bản chăm sóc */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-black text-gray-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-red-500" />Kịch bản chăm sóc</h2>
            <p className="text-xs text-gray-500 mt-1">Mỗi bước gửi sau N ngày kể từ hoạt động gần nhất của lead. Sửa nội dung, số ngày, kênh và thứ tự tại đây.</p>
          </div>
          <button onClick={addStep} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700">
            <Plus className="w-4 h-4" />Thêm bước
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-500 mr-1 self-center">Biến chèn được:</span>
          {TEMPLATE_VARS.map(v => (
            <span key={v.token} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100" title={`${v.label} — ví dụ: ${v.sample}`}>
              {v.token}
            </span>
          ))}
        </div>

        {steps.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">Chưa có bước nào. Bấm “Thêm bước” để tạo kịch bản.</div>
        ) : (
          <div className="space-y-3">
            {steps.map((step, i) => {
              const check = validateDripStep(step);
              return (
                <div key={step.id} className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-30 leading-none">▲</button>
                        <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-30 leading-none">▼</button>
                      </div>
                      <GripVertical className="w-4 h-4 text-gray-300" />
                      <span className="text-sm font-black text-gray-800">Bước {i + 1}</span>
                      <span className="text-xs text-gray-500">· {stepLabelFromDays(step.delay_days)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 select-none cursor-pointer">
                        <input type="checkbox" checked={step.enabled} onChange={e => patchStepLocal(step.id, { enabled: e.target.checked })} className="rounded border-gray-300 text-red-600 focus:ring-red-400" />
                        {step.enabled ? 'Đang bật' : 'Đang tắt'}
                      </label>
                      <button onClick={() => setDeleteId(step.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Xóa bước"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-600">Gửi sau (ngày)</span>
                      <input type="number" min={0} value={step.delay_days}
                        onChange={e => patchStepLocal(step.id, { delay_days: parseInt(e.target.value, 10) || 0 })}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-600">Kênh gửi</span>
                      <select value={step.channel} onChange={e => patchStepLocal(step.id, { channel: e.target.value as DripChannel })}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                        {DRIP_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}{c.ready ? '' : ' (chưa nối)'}</option>)}
                      </select>
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Nội dung tin</span>
                    <textarea value={step.message_template} rows={3}
                      onChange={e => patchStepLocal(step.id, { message_template: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-y" />
                  </label>

                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                    <p className="text-[11px] font-semibold text-gray-400 mb-1">Xem trước (lead mẫu):</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{renderDripMessage(step.message_template, SAMPLE_LEAD)}</p>
                  </div>

                  {!channelReady(step.channel) && (
                    <p className="text-xs text-amber-600">Kênh {channelLabel(step.channel)} chưa nối — lead sẽ được ghi log “Bỏ qua”, không gửi.</p>
                  )}
                  {check.warnings.map((w, wi) => <p key={wi} className="text-xs text-amber-600">{w}</p>)}

                  <button onClick={() => saveStep(step)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-800">
                    <Save className="w-3.5 h-3.5" />Lưu bước
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* KHỐI 3 — Kỹ thuật & kích hoạt */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-black text-gray-900 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-red-500" />Kỹ thuật & kết nối</h2>
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

        <ol className="space-y-3 pt-2 border-t border-gray-100">
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

      {/* Nhật ký gửi drip */}
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
                  <th className="text-left font-medium">Nội dung</th>
                  <th className="text-left font-medium">Chi tiết</th>
                  <th className="text-right font-medium">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 text-gray-800 font-medium">{log.leads?.full_name || log.leads?.phone || 'Khách'}</td>
                    <td className="text-gray-600">{dripStepLabel(log.step, steps)}</td>
                    <td><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass(log.status)}`}>{dripStatusLabel(log.status)}</span></td>
                    <td className="text-gray-600 max-w-[320px] truncate" title={log.message || ''}>{log.message || '—'}</td>
                    <td className="text-gray-500 max-w-[220px] truncate">{log.detail || '—'}</td>
                    <td className="text-right text-gray-400">{new Date(log.sent_at).toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmRun && (
        <ConfirmDialog
          title="Chạy quét nuôi dưỡng"
          confirmLabel="Chạy quét"
          tone="primary"
          message="Chạy quét nuôi dưỡng ngay? Hệ thống sẽ gọi Edge Function; nếu đủ token và zalo_user_id có thể gửi Zalo thật."
          onConfirm={runNow}
          onCancel={() => setConfirmRun(false)}
        />
      )}
      {deleteId && (
        <ConfirmDialog
          message="Xóa bước chăm sóc này? Nhật ký đã gửi vẫn được giữ."
          onConfirm={() => removeStep(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
