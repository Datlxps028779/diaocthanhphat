import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Globe2, RefreshCw, Save, Search, ShieldCheck } from 'lucide-react';
import type { SeoRouteOverride, SiteSetting } from '../../../lib/supabase';
import { adminGetAllSiteSettings, adminGetSeoAudit, adminGetSeoRouteOverrides, adminUpsertSeoRouteOverride, SEO_ROUTE_PATHS, upsertSiteSetting } from '../../../lib/api';
import { buildLocalBusinessJsonLd, serializeJsonLd } from '../../../lib/seo';
import { parseSeoSchema, SeoFields, type SeoFieldsValue } from '../shared/SeoFields';

const SCHEMA_SETTINGS: Array<Pick<SiteSetting, 'key' | 'label' | 'group_name' | 'type'> & { placeholder?: string }> = [
  { key: 'organization_legal_name', label: 'Tên pháp lý doanh nghiệp', group_name: 'schema', type: 'text' },
  { key: 'organization_description', label: 'Mô tả doanh nghiệp cho AI/Google', group_name: 'schema', type: 'textarea' },
  { key: 'geo_area_served', label: 'Khu vực phục vụ', group_name: 'schema', type: 'text', placeholder: 'Bình Dương, TP.HCM, Đồng Nai' },
  { key: 'knows_about', label: 'Chủ đề chuyên môn', group_name: 'schema', type: 'textarea', placeholder: 'bất động sản Bình Dương, đất nền, nhà phố...' },
  { key: 'organization_license', label: 'Giấy phép/chứng nhận thật (nếu có)', group_name: 'schema', type: 'text' },
];

function emptySeo(row?: SeoRouteOverride): SeoFieldsValue {
  return {
    meta_title: row?.meta_title ?? '',
    meta_description: row?.meta_description ?? '',
    focus_keywords: row?.focus_keywords ?? '',
    schema_markup: row?.schema_markup ? JSON.stringify(row.schema_markup, null, 2) : '',
  };
}

export function SeoGeoTab() {
  const [settingValues, setSettingValues] = useState<Record<string, string>>({});
  const [routes, setRoutes] = useState<SeoRouteOverride[]>([]);
  const [activePath, setActivePath] = useState<string>(SEO_ROUTE_PATHS[0]);
  const [routeSeo, setRouteSeo] = useState<SeoFieldsValue>(emptySeo());
  const [canonicalPath, setCanonicalPath] = useState('');
  const [robotsIndex, setRobotsIndex] = useState(true);
  const [robotsFollow, setRobotsFollow] = useState(true);
  const [audit, setAudit] = useState<{ properties: unknown[]; news: unknown[]; areas: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    const [settingsData, routeData, auditData] = await Promise.all([
      adminGetAllSiteSettings(),
      adminGetSeoRouteOverrides().catch(() => []),
      adminGetSeoAudit().catch(() => ({ properties: [], news: [], areas: [] })),
    ]);
    setSettingValues(Object.fromEntries(settingsData.map(s => [s.key, s.value ?? ''])));
    setRoutes(routeData);
    setAudit(auditData);
    setLoading(false);
  };

  useEffect(() => { load().catch(e => { console.error(e); setLoading(false); }); }, []);

  useEffect(() => {
    const row = routes.find(r => r.path === activePath);
    setRouteSeo(emptySeo(row));
    setCanonicalPath(row?.canonical_path ?? '');
    setRobotsIndex(row?.robots_index ?? true);
    setRobotsFollow(row?.robots_follow ?? true);
  }, [activePath, routes]);

  const settingsMap = useMemo(() => ({ ...settingValues }), [settingValues]);
  const organizationPreview = useMemo(() => serializeJsonLd(buildLocalBusinessJsonLd(settingsMap)), [settingsMap]);
  const routeValidation = parseSeoSchema(routeSeo.schema_markup, 'route');

  const saveSettings = async () => {
    setSaving(true);
    setMessage('');
    try {
      for (const def of SCHEMA_SETTINGS) {
        await upsertSiteSetting({ ...def, value: settingValues[def.key] ?? '' });
      }
      setMessage('Đã lưu Site Entity schema settings.');
      await load();
    } catch (e) {
      console.error(e);
      setMessage('Lưu settings thất bại. Kiểm tra quyền admin/RLS.');
    } finally { setSaving(false); }
  };

  const saveRoute = async () => {
    const parsed = parseSeoSchema(routeSeo.schema_markup, 'route');
    if (parsed.error) { setMessage(parsed.error); return; }
    setSaving(true);
    setMessage('');
    try {
      await adminUpsertSeoRouteOverride({
        path: activePath,
        meta_title: routeSeo.meta_title.trim() || null,
        meta_description: routeSeo.meta_description.trim() || null,
        focus_keywords: routeSeo.focus_keywords.trim() || null,
        canonical_path: canonicalPath.trim() || null,
        robots_index: robotsIndex,
        robots_follow: robotsFollow,
        schema_markup: parsed.schema,
      });
      setMessage(`Đã lưu override cho ${activePath}.`);
      const nextRoutes = await adminGetSeoRouteOverrides().catch(() => []);
      setRoutes(nextRoutes);
    } catch (e) {
      console.error(e);
      setMessage('Lưu route override thất bại. Kiểm tra migration/RLS.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-red-100 bg-gradient-to-r from-red-50 to-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-red-600">Schema Pro</p>
            <h2 className="mt-1 text-xl font-black text-gray-900">SEO / GEO cho Google Search & AI</h2>
            <p className="mt-1 text-sm text-gray-500">Quản trị entity, schema JSON-LD, route override và audit chất lượng index.</p>
          </div>
          <button onClick={() => load()} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">
            <RefreshCw className="h-4 w-4" /> Làm mới audit
          </button>
        </div>
      </div>

      {message && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />{message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-black text-gray-900"><Globe2 className="h-4 w-4 text-red-500" />Site Entity</h3>
              <button onClick={saveSettings} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                <Save className="h-4 w-4" /> Lưu entity
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {SCHEMA_SETTINGS.map(def => (
                <div key={def.key} className={def.type === 'textarea' ? 'md:col-span-2' : ''}>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">{def.label}</label>
                  {def.type === 'textarea' ? (
                    <textarea value={settingValues[def.key] ?? ''} onChange={e => setSettingValues(v => ({ ...v, [def.key]: e.target.value }))}
                      rows={3} placeholder={def.placeholder}
                      className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  ) : (
                    <input value={settingValues[def.key] ?? ''} onChange={e => setSettingValues(v => ({ ...v, [def.key]: e.target.value }))}
                      placeholder={def.placeholder}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-base font-black text-gray-900"><Search className="h-4 w-4 text-red-500" />Route Overrides</h3>
            <div className="mb-4 flex flex-wrap gap-2">
              {SEO_ROUTE_PATHS.map(path => (
                <button key={path} onClick={() => setActivePath(path)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${activePath === path ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'}`}>
                  {path}
                </button>
              ))}
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Canonical path</label>
                <input value={canonicalPath} onChange={e => setCanonicalPath(e.target.value)} placeholder={activePath}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={robotsIndex} onChange={e => setRobotsIndex(e.target.checked)} className="accent-red-600" /> Index
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={robotsFollow} onChange={e => setRobotsFollow(e.target.checked)} className="accent-red-600" /> Follow
              </label>
            </div>
            <SeoFields value={routeSeo} onChange={setRouteSeo} target="route" basePath={canonicalPath || activePath} />
            <div className="mt-4 flex justify-end">
              <button onClick={saveRoute} disabled={saving || !!routeValidation.error}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                <Save className="h-4 w-4" /> Lưu route
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-base font-black text-gray-900"><ShieldCheck className="h-4 w-4 text-emerald-500" />Entity Audit</h3>
            <div className="grid gap-3">
              <AuditCard label="Tin BĐS cần bổ sung" count={audit?.properties.length ?? 0} hint="Thiếu ảnh, mô tả, meta hoặc geo." />
              <AuditCard label="Bài viết cần tối ưu" count={audit?.news.length ?? 0} hint="Thiếu excerpt, ảnh hoặc meta description." />
              <AuditCard label="Khu vực cần làm dày" count={audit?.areas.length ?? 0} hint="Thiếu mô tả/meta; vẫn phải qua quality gate trước khi index." />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-black text-gray-900">Preview Organization JSON-LD</h3>
            <pre className="max-h-[420px] overflow-auto rounded-xl bg-gray-950 p-4 text-[11px] leading-relaxed text-emerald-100">{organizationPreview}</pre>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="mb-1 flex items-center gap-2 font-bold"><CheckCircle className="h-4 w-4" />Nguyên tắc GEO</div>
            Schema chỉ giúp Google/AI hiểu dữ liệu; thứ hạng vẫn phụ thuộc nội dung thật, độ dày trang, internal links, tín hiệu doanh nghiệp và Search Console sau deploy.
          </div>
        </aside>
      </div>
    </div>
  );
}

function AuditCard({ label, count, hint }: { label: string; count: number; hint: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-gray-900">{label}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{count}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}
