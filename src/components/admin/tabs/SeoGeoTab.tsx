import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Globe2, MapPin, RefreshCw, Save, Search, ShieldCheck, Wand2, X } from 'lucide-react';
import type { Area, NewsArticle, Property, SeoRouteOverride, SiteSetting } from '../../../lib/supabase';
import type { AdminTab } from '../types';
import { supabase } from '../../../lib/supabase';
import { adminGetAllSiteSettings, adminGetSeoAudit, adminGetSeoRouteOverrides, adminUpsertSeoRouteOverride, diagnoseSearchConsoleAccess, getAreas, getSearchVisibilityAudit, inspectSearchVisibilityBatch, SEO_ROUTE_PATHS, SearchVisibilityApiError, submitSearchVisibilitySitemap, syncSearchVisibilityAudit, updateArea, upsertSiteSetting } from '../../../lib/api';
import { buildLocalBusinessJsonLd, serializeJsonLd } from '../../../lib/seo';
import { buildAutoSchema, schemaToJson } from '../../../lib/seoAuto';
import { buildSiteEntitySchema } from '../../../lib/api';
import { areaSummaryFromData, buildAreaCollectionJsonLd, evaluateAreaSeo, getAreaDetails } from '../../../lib/areaSeo';
import { parseSeoSchema, SeoFields, type SeoFieldsValue } from '../shared/SeoFields';
import { PublicUrlPreview } from '../shared/PublicUrlPreview';
import { ImageOptimizerCard } from '../shared/ImageOptimizerCard';
import type { SearchConsoleAccessDiagnosis, SearchVisibilityAuditResponse } from '../../../lib/api/searchVisibility';

function schemaTypeFromGuide(schemaType?: string): 'WebPage' | 'CollectionPage' | 'AboutPage' | 'WebSite' | 'FAQPage' {
  if (!schemaType) return 'WebPage';
  if (schemaType.includes('CollectionPage')) return 'CollectionPage';
  if (schemaType.includes('AboutPage')) return 'AboutPage';
  if (schemaType.includes('WebSite')) return 'WebSite';
  if (schemaType.includes('FAQPage')) return 'FAQPage';
  return 'WebPage';
}

const SCHEMA_SETTINGS: Array<Pick<SiteSetting, 'key' | 'label' | 'group_name' | 'type'> & { placeholder?: string }> = [
  { key: 'organization_legal_name', label: 'Tên pháp lý doanh nghiệp', group_name: 'schema', type: 'text' },
  { key: 'organization_description', label: 'Mô tả doanh nghiệp cho AI/Google', group_name: 'schema', type: 'textarea' },
  { key: 'geo_area_served', label: 'Khu vực phục vụ', group_name: 'schema', type: 'text', placeholder: 'Bình Dương, TP.HCM, Đồng Nai' },
  { key: 'knows_about', label: 'Chủ đề chuyên môn', group_name: 'schema', type: 'textarea', placeholder: 'bất động sản Bình Dương, đất nền, nhà phố...' },
  { key: 'organization_license', label: 'Giấy phép/chứng nhận thật (nếu có)', group_name: 'schema', type: 'text' },
];

const ROUTE_GUIDE: Record<string, { title: string; description: string; canonical: string; keywords: string; schemaType: string; note: string }> = {
  '/': {
    title: 'Chợ Nhà Việt – Mua bán, cho thuê bất động sản uy tín',
    description: 'Cổng thông tin mua bán, cho thuê bất động sản Bình Dương và khu vực lân cận với tin thật, pháp lý minh bạch, tư vấn tận tâm.',
    canonical: '/',
    keywords: 'bất động sản Bình Dương, mua bán nhà đất Bình Dương, cho thuê bất động sản',
    schemaType: 'WebPage hoặc FAQPage nếu schema bổ sung khớp nội dung đang hiển thị',
    note: 'Trang chủ nên tập trung thương hiệu, khu vực phục vụ, tin nổi bật và FAQ thật.',
  },
  '/danh-sach': {
    title: 'Danh sách bất động sản Bình Dương mới nhất',
    description: 'Tìm kiếm nhà đất, đất nền, nhà phố, căn hộ và bất động sản cho thuê tại Bình Dương theo khu vực, giá, diện tích và pháp lý.',
    canonical: '/danh-sach',
    keywords: 'danh sách bất động sản, tìm nhà đất Bình Dương, lọc bất động sản',
    schemaType: 'CollectionPage + ItemList khi có danh sách SSR đủ dữ liệu thật',
    note: 'Không nhồi từ khóa; ưu tiên mô tả chức năng tìm kiếm và bộ lọc.',
  },
  '/mua-ban': {
    title: 'Mua bán bất động sản Bình Dương chính chủ, pháp lý rõ ràng',
    description: 'Cập nhật tin mua bán nhà đất Bình Dương: đất nền, nhà phố, căn hộ, biệt thự với giá bán, vị trí và pháp lý minh bạch.',
    canonical: '/mua-ban',
    keywords: 'mua bán bất động sản Bình Dương, bán nhà đất Bình Dương, đất nền Bình Dương',
    schemaType: 'CollectionPage + ItemList',
    note: 'Chỉ index mạnh khi danh sách có tin thật và được cập nhật đều.',
  },
  '/cho-thue': {
    title: 'Cho thuê bất động sản Bình Dương – nhà, mặt bằng, căn hộ',
    description: 'Tin cho thuê bất động sản Bình Dương gồm nhà ở, căn hộ, mặt bằng, kho xưởng và phòng trọ với thông tin giá thuê rõ ràng.',
    canonical: '/cho-thue',
    keywords: 'cho thuê bất động sản Bình Dương, thuê nhà Bình Dương, thuê mặt bằng Bình Dương',
    schemaType: 'CollectionPage + ItemList',
    note: 'Mô tả rõ loại tài sản thuê; không dùng giá/ưu đãi nếu không có dữ liệu thật.',
  },
  '/khu-vuc': {
    title: 'Khu vực bất động sản Bình Dương và vùng lân cận',
    description: 'Khám phá thị trường bất động sản theo khu vực: Bình Dương, TP.HCM, Đồng Nai, Bình Phước với dữ liệu tin đăng và hạ tầng nổi bật.',
    canonical: '/khu-vuc',
    keywords: 'khu vực bất động sản, bất động sản Bình Dương theo khu vực, thị trường nhà đất',
    schemaType: 'CollectionPage',
    note: 'Trang khu vực con vẫn phải qua quality gate, thiếu dữ liệu thì noindex.',
  },
  '/tin-tuc': {
    title: 'Tin tức bất động sản Bình Dương, hạ tầng và đầu tư',
    description: 'Cập nhật tin tức thị trường bất động sản Bình Dương, quy hoạch, hạ tầng, đầu tư và kinh nghiệm mua bán nhà đất.',
    canonical: '/tin-tuc',
    keywords: 'tin tức bất động sản Bình Dương, thị trường nhà đất, quy hoạch Bình Dương',
    schemaType: 'CollectionPage; từng bài dùng NewsArticle riêng',
    note: 'Bài viết cần author, ngày cập nhật, ảnh, excerpt và nội dung thật.',
  },
  '/ve-chung-toi': {
    title: 'Về Chợ Nhà Việt – Đơn vị tư vấn bất động sản địa phương',
    description: 'Tìm hiểu Chợ Nhà Việt, định hướng tư vấn bất động sản địa phương, khu vực phục vụ và cam kết minh bạch thông tin.',
    canonical: '/ve-chung-toi',
    keywords: 'Chợ Nhà Việt, tư vấn bất động sản Bình Dương, đơn vị nhà đất Bình Dương',
    schemaType: 'AboutPage hoặc WebPage',
    note: 'Chỉ ghi giấy phép/chứng nhận/kinh nghiệm nếu có thật.',
  },
  '/so-sanh': {
    title: 'So sánh bất động sản Bình Dương theo giá, diện tích, pháp lý',
    description: 'So sánh các bất động sản đã chọn tại Bình Dương theo giá, diện tích, giá/m², pháp lý, hướng nhà và tiện ích hiển thị từ dữ liệu thật.',
    canonical: '/so-sanh',
    keywords: 'so sánh bất động sản Bình Dương, so sánh nhà đất, so sánh giá nhà đất',
    schemaType: 'WebPage',
    note: 'Không tạo schema đánh giá/rating; chỉ mô tả công cụ so sánh dữ liệu người dùng đã chọn.',
  },
  '/dinh-gia': {
    title: 'Định giá bất động sản Bình Dương theo dữ liệu tham khảo',
    description: 'Ước tính khoảng giá nhà đất Bình Dương theo thông tin tài sản và dữ liệu tham khảo, hỗ trợ người mua bán có thêm cơ sở so sánh.',
    canonical: '/dinh-gia',
    keywords: 'định giá bất động sản Bình Dương, ước tính giá nhà đất, định giá nhà đất',
    schemaType: 'WebPage',
    note: 'Tránh cam kết giá chính xác; nội dung phải nói rõ đây là tham khảo, không thay thế thẩm định chính thức.',
  },
  '/du-an': {
    title: 'Dự án bất động sản Bình Dương và khu vực lân cận',
    description: 'Tổng hợp dự án bất động sản, khu đô thị và khu dân cư tại Bình Dương, ưu tiên thông tin vị trí, pháp lý và tiến độ có dữ liệu thật.',
    canonical: '/du-an',
    keywords: 'dự án bất động sản Bình Dương, khu đô thị Bình Dương, dự án nhà đất',
    schemaType: 'CollectionPage',
    note: 'Chỉ nêu chủ đầu tư, tiến độ, pháp lý khi có dữ liệu xác thực trong dự án.',
  },
  '/dau-tu': {
    title: 'Đầu tư bất động sản Bình Dương – công cụ ROI và tư vấn',
    description: 'Phân tích cơ hội đầu tư bất động sản Bình Dương với công cụ tính ROI, dòng tiền và góc nhìn rủi ro dựa trên dữ liệu người dùng nhập.',
    canonical: '/dau-tu',
    keywords: 'đầu tư bất động sản Bình Dương, tính ROI bất động sản, đầu tư nhà đất',
    schemaType: 'WebPage',
    note: 'Không hứa lợi nhuận; mọi con số ROI phải đến từ input/công cụ hiển thị hoặc ghi rõ là ước tính.',
  },
};

function schemaExample(path: string): string {
  const type = path === '/tin-tuc' || path === '/mua-ban' || path === '/cho-thue' || path === '/danh-sach' || path === '/khu-vuc' ? 'CollectionPage' : 'WebPage';
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': type,
    name: ROUTE_GUIDE[path]?.title ?? path,
    description: ROUTE_GUIDE[path]?.description ?? '',
  }, null, 2);
}

function emptySeo(row?: SeoRouteOverride): SeoFieldsValue {
  return {
    meta_title: row?.meta_title ?? '',
    meta_description: row?.meta_description ?? '',
    focus_keywords: row?.focus_keywords ?? '',
    schema_markup: row?.schema_markup ? JSON.stringify(row.schema_markup, null, 2) : '',
  };
}

export function SeoGeoTab({ onEditEntity }: { onEditEntity?: (tab: AdminTab, id: string) => void } = {}) {
  const [settingValues, setSettingValues] = useState<Record<string, string>>({});
  const [routes, setRoutes] = useState<SeoRouteOverride[]>([]);
  const [activePath, setActivePath] = useState<string>(SEO_ROUTE_PATHS[0]);
  const [routeSeo, setRouteSeo] = useState<SeoFieldsValue>(emptySeo());
  const [canonicalPath, setCanonicalPath] = useState('');
  const [robotsIndex, setRobotsIndex] = useState(true);
  const [robotsFollow, setRobotsFollow] = useState(true);
  const [audit, setAudit] = useState<{ properties: Property[]; news: NewsArticle[]; areas: Area[] } | null>(null);
  const [auditModal, setAuditModal] = useState<'properties' | 'news' | 'areas' | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [activeAreaId, setActiveAreaId] = useState('');
  const [areaSeo, setAreaSeo] = useState<SeoFieldsValue>({ meta_title: '', meta_description: '', focus_keywords: '', schema_markup: '' });
  const [areaListings, setAreaListings] = useState<Pick<Property, 'id' | 'title' | 'slug' | 'district' | 'property_type_id'>[]>([]);
  const [areaIndexable, setAreaIndexable] = useState<boolean | null>(null);
  const [areaGateReasons, setAreaGateReasons] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<SearchVisibilityAuditResponse | null>(null);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [visibilitySyncing, setVisibilitySyncing] = useState(false);
  const [visibilityGoogleAction, setVisibilityGoogleAction] = useState<'diagnostic' | 'sitemap' | 'inspection' | null>(null);
  const [visibilityAccessDiagnosis, setVisibilityAccessDiagnosis] = useState<SearchConsoleAccessDiagnosis | null>(null);
  const [visibilityError, setVisibilityError] = useState<{ message: string; code: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    const [settingsData, routeData, auditData, areasData] = await Promise.all([
      adminGetAllSiteSettings(),
      adminGetSeoRouteOverrides().catch(() => []),
      adminGetSeoAudit().catch(() => ({ properties: [], news: [], areas: [] })),
      getAreas().catch(() => []),
    ]);
    setSettingValues(Object.fromEntries(settingsData.map(s => [s.key, s.value ?? ''])));
    setRoutes(routeData);
    setAudit(auditData);
    setAreas(areasData);
    setLoading(false);
  };

  useEffect(() => { load().catch(e => { console.error(e); setLoading(false); }); }, []);

  const loadVisibility = async () => {
    setVisibilityLoading(true);
    setVisibilityError(null);
    try {
      setVisibility(await getSearchVisibilityAudit());
    } catch (cause) {
      setVisibility(null);
      const error = cause as Error;
      setVisibilityError({ message: error.message || 'Chưa tải được audit URL.', code: 'LOAD' });
    } finally {
      setVisibilityLoading(false);
    }
  };

  const syncVisibility = async () => {
    setVisibilitySyncing(true);
    setVisibilityError(null);
    try {
      await syncSearchVisibilityAudit();
      await loadVisibility();
    } catch (cause) {
      const error = cause as Error;
      setVisibilityError({
        message: error.message || 'Không đồng bộ được audit URL.',
        code: error instanceof SearchVisibilityApiError ? error.code : 'UNKNOWN',
      });
    } finally {
      setVisibilitySyncing(false);
    }
  };

  const runGoogleVisibilityAction = async (action: 'diagnostic' | 'sitemap' | 'inspection') => {
    setVisibilityGoogleAction(action);
    setVisibilityError(null);
    try {
      if (action === 'diagnostic') {
        setVisibilityAccessDiagnosis(await diagnoseSearchConsoleAccess());
      } else {
        if (action === 'sitemap') await submitSearchVisibilitySitemap();
        else await inspectSearchVisibilityBatch();
        await loadVisibility();
      }
    } catch (cause) {
      const error = cause as Error;
      setVisibilityError({
        message: error.message || 'Không hoàn tất được thao tác Search Console.',
        code: error instanceof SearchVisibilityApiError ? error.code : 'UNKNOWN',
      });
    } finally {
      setVisibilityGoogleAction(null);
    }
  };

  useEffect(() => { void loadVisibility(); }, []);

  useEffect(() => {
    const row = routes.find(r => r.path === activePath);
    setRouteSeo(emptySeo(row));
    setCanonicalPath(row?.canonical_path ?? '');
    setRobotsIndex(row?.robots_index ?? true);
    setRobotsFollow(row?.robots_follow ?? true);
  }, [activePath, routes]);

  useEffect(() => {
    const area = areas.find(a => a.id === activeAreaId);
    setAreaSeo({
      meta_title: area?.meta_title ?? '',
      meta_description: area?.meta_description ?? '',
      focus_keywords: area?.focus_keywords ?? '',
      schema_markup: area?.schema_markup ? JSON.stringify(area.schema_markup, null, 2) : '',
    });
  }, [activeAreaId, areas]);

  // Nạp listings thật của khu vực để schema + quality gate khớp public page
  // (/khu-vuc/[slug]). Thiếu dữ liệu → evaluateAreaSeo ra noindex, admin thấy ngay.
  useEffect(() => {
    let cancelled = false;
    if (!activeAreaId) { setAreaListings([]); setAreaIndexable(null); setAreaGateReasons([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id,title,slug,district,property_type_id')
        .eq('is_active', true)
        .eq('area_id', activeAreaId)
        .limit(50);
      if (cancelled) return;
      if (error) { setAreaListings([]); setAreaIndexable(null); setAreaGateReasons([]); return; }
      const listings = (data ?? []) as Pick<Property, 'id' | 'title' | 'slug' | 'district' | 'property_type_id'>[];
      setAreaListings(listings);
      const area = areas.find(a => a.id === activeAreaId);
      if (area) {
        const districts = Array.from(new Set(listings.map(l => l.district).filter(Boolean))) as string[];
        const propertyTypes = Array.from(new Set(listings.map(l => l.property_type_id).filter(Boolean))) as string[];
        const ev = evaluateAreaSeo({ area, activeListings: listings, districts, propertyTypes, hasDescription: !!area.description?.trim() });
        setAreaIndexable(ev.indexable);
        setAreaGateReasons(ev.reasons);
      }
    })();
    return () => { cancelled = true; };
  }, [activeAreaId, areas]);

  const activeArea = areas.find(a => a.id === activeAreaId);

  const fillAreaFromData = () => {
    if (!activeArea) return;
    const detail = getAreaDetails(activeArea.slug);
    const summary = areaSummaryFromData(activeArea, detail);
    const fallbackDescription = summary.length > 155 ? `${summary.slice(0, 152).trim()}...` : summary;
    setAreaSeo({
      meta_title: activeArea.meta_title?.trim() || `Bất động sản ${activeArea.name}`,
      meta_description: activeArea.meta_description?.trim() || fallbackDescription,
      focus_keywords: activeArea.focus_keywords?.trim() || `${activeArea.name}, bất động sản ${activeArea.name}`,
      schema_markup: schemaToJson(buildAreaCollectionJsonLd(activeArea, areaListings.map(l => ({ id: l.id, title: l.title, slug: l.slug })))),
    });
    if (areaIndexable !== null) {
      setRobotsIndex(areaIndexable);
      setRobotsFollow(true);
    }
    setMessage(areaIndexable === false
      ? `Đã điền mẫu. Lưu ý: khu vực CHƯA qua quality gate (${areaGateReasons.join(', ')}) — nên giữ noindex cho đến khi đủ dữ liệu thật.`
      : 'Đã điền mẫu SEO/GEO từ dữ liệu khu vực.');
  };

  const settingsMap = useMemo(() => ({ ...settingValues }), [settingValues]);
  const activeGuide = ROUTE_GUIDE[activePath];
  const activeRouteSchema = buildAutoSchema('route', {
    title: routeSeo.meta_title || activeGuide?.title,
    description: routeSeo.meta_description || activeGuide?.description,
    focus_keywords: routeSeo.focus_keywords || activeGuide?.keywords,
    path: canonicalPath || activePath,
    route_type: schemaTypeFromGuide(activeGuide?.schemaType),
  });
  const organizationSchema = useMemo(() => buildSiteEntitySchema(settingsMap), [settingsMap]);
  const organizationPreview = useMemo(() => serializeJsonLd(buildLocalBusinessJsonLd(settingsMap)), [settingsMap]);
  const routePreview = useMemo(() => JSON.stringify(activeRouteSchema, null, 2), [activeRouteSchema]);
  const sitePreview = useMemo(() => schemaToJson(organizationSchema), [organizationSchema]);
  const routeValidation = parseSeoSchema(routeSeo.schema_markup, 'route');
  // Schema deterministic cho area = đúng builder public (CollectionPage + ItemList từ listings thật),
  // fallback buildAutoSchema('area') khi chưa nạp listings. Truyền vào autoSchema của SeoFields.
  const areaAutoSchema = useMemo(() => {
    if (!activeArea) return buildAutoSchema('area', { path: '/khu-vuc' });
    if (areaListings.length > 0) {
      return buildAreaCollectionJsonLd(activeArea, areaListings.map(l => ({ id: l.id, title: l.title, slug: l.slug })));
    }
    return buildAutoSchema('area', { title: `Bất động sản ${activeArea.name}`, path: `/khu-vuc/${activeArea.slug}` });
  }, [activeArea, areaListings]);

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
      const detail = e instanceof Error ? e.message : 'Không rõ lỗi';
      setMessage(`Lưu settings thất bại: ${detail}. Nếu bạn đang dùng tài khoản admin, hãy kiểm tra migration đã seed các key schema và policy site_settings có is_admin().`);
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

  const areaValidation = parseSeoSchema(areaSeo.schema_markup, 'area');

  const saveArea = async () => {
    if (!activeAreaId) { setMessage('Chọn khu vực trước khi lưu.'); return; }
    const parsed = parseSeoSchema(areaSeo.schema_markup, 'area');
    if (parsed.error) { setMessage(parsed.error); return; }
    setSaving(true);
    setMessage('');
    try {
      await updateArea(activeAreaId, {
        meta_title: areaSeo.meta_title.trim() || null,
        meta_description: areaSeo.meta_description.trim() || null,
        focus_keywords: areaSeo.focus_keywords.trim() || null,
        schema_markup: parsed.schema,
      });
      setMessage(`Đã lưu SEO cho khu vực ${activeArea?.name ?? ''}.`);
      const nextAreas = await getAreas().catch(() => areas);
      setAreas(nextAreas);
    } catch (e) {
      console.error(e);
      setMessage('Lưu SEO khu vực thất bại. Kiểm tra migration/RLS.');
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
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-bold">Nên cấu hình gì cho từng route?</p>
              <p className="mt-1 text-blue-800">Dùng route override cho các trang tĩnh/danh mục để Google hiểu đúng mục đích trang. Trang chi tiết BĐS, bài viết và khu vực con đã có schema riêng theo dữ liệu thật.</p>
              {activeGuide && (
                <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                  <div><span className="font-bold">Title mẫu:</span> {activeGuide.title}</div>
                  <div><span className="font-bold">Canonical:</span> {activeGuide.canonical}</div>
                  <div className="md:col-span-2"><span className="font-bold">Description mẫu:</span> {activeGuide.description}</div>
                  <div><span className="font-bold">Keywords:</span> {activeGuide.keywords}</div>
                  <div><span className="font-bold">Schema nên dùng:</span> {activeGuide.schemaType}</div>
                  <div className="md:col-span-2"><span className="font-bold">Lưu ý:</span> {activeGuide.note}</div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!activeGuide) return;
                  setCanonicalPath(activeGuide.canonical);
                  setRouteSeo({
                    meta_title: activeGuide.title,
                    meta_description: activeGuide.description,
                    focus_keywords: activeGuide.keywords,
                    schema_markup: schemaExample(activePath),
                  });
                }}
                className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
              >
                Điền mẫu cho route này
              </button>
            </div>
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
                <PublicUrlPreview path={canonicalPath || activePath} />
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={robotsIndex} onChange={e => setRobotsIndex(e.target.checked)} className="accent-red-600" /> Index
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={robotsFollow} onChange={e => setRobotsFollow(e.target.checked)} className="accent-red-600" /> Follow
              </label>
            </div>
            <SeoFields value={routeSeo} onChange={setRouteSeo} target="route" basePath={canonicalPath || activePath} autoSchema={activeRouteSchema} />
            <div className="mt-4 flex justify-end">
              <button onClick={saveRoute} disabled={saving || !!routeValidation.error}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                <Save className="h-4 w-4" /> Lưu route
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-base font-black text-gray-900"><MapPin className="h-4 w-4 text-red-500" />SEO / GEO khu vực</h3>
            <p className="mb-4 text-sm text-gray-500">Chỉnh metadata và schema cho từng trang khu vực <code className="rounded bg-gray-100 px-1">/khu-vuc/[slug]</code>. Trang khu vực vẫn phải đủ dữ liệu thật trước khi index.</p>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-semibold text-gray-700">Chọn khu vực</label>
              <select value={activeAreaId} onChange={e => setActiveAreaId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                <option value="">-- Chọn khu vực --</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {activeAreaId ? (
              <>
                <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">Điền mẫu từ dữ liệu khu vực</p>
                      <p className="mt-1 text-blue-800">Sinh title/description/keywords + schema CollectionPage (ItemList từ {areaListings.length} tin đăng thật) đúng chuẩn public page. Robots tự khớp quality gate.</p>
                    </div>
                    <button type="button" onClick={fillAreaFromData}
                      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
                      <Wand2 className="h-3.5 w-3.5" /> Điền mẫu cho khu vực này
                    </button>
                  </div>
                  {areaIndexable === false && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                      Khu vực chưa qua quality gate: {areaGateReasons.join(', ')}. Nên giữ noindex cho đến khi đủ {5} tin đăng thật + mô tả riêng.
                    </p>
                  )}
                </div>
                <SeoFields value={areaSeo} onChange={setAreaSeo} target="area" basePath={`/khu-vuc/${activeArea?.slug ?? ''}`} autoSchema={areaAutoSchema} />
                <div className="mt-4 flex justify-end">
                  <button onClick={saveArea} disabled={saving || !!areaValidation.error}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                    <Save className="h-4 w-4" /> Lưu SEO khu vực
                  </button>
                </div>
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">Chọn một khu vực để chỉnh SEO/GEO.</p>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-base font-black text-gray-900"><ShieldCheck className="h-4 w-4 text-emerald-500" />Entity Audit</h3>
            <div className="grid gap-3">
              <AuditCard label="Tin BĐS cần bổ sung" count={audit?.properties.length ?? 0} hint="Thiếu ảnh, mô tả, meta hoặc geo." onClick={audit?.properties.length ? () => setAuditModal('properties') : undefined} />
              <AuditCard label="Bài viết cần tối ưu" count={audit?.news.length ?? 0} hint="Thiếu excerpt, ảnh hoặc meta description." onClick={audit?.news.length ? () => setAuditModal('news') : undefined} />
              <AuditCard label="Khu vực cần làm dày" count={audit?.areas.length ?? 0} hint="Thiếu mô tả/meta; vẫn phải qua quality gate trước khi index." onClick={audit?.areas.length ? () => setAuditModal('areas') : undefined} />
            </div>
          </div>

          <SearchVisibilityCard
            audit={visibility}
            loading={visibilityLoading}
            syncing={visibilitySyncing}
            googleAction={visibilityGoogleAction}
            error={visibilityError}
            onRefresh={() => void loadVisibility()}
            onSync={() => void syncVisibility()}
            accessDiagnosis={visibilityAccessDiagnosis}
            onDiagnoseAccess={() => void runGoogleVisibilityAction('diagnostic')}
            onSubmitSitemap={() => void runGoogleVisibilityAction('sitemap')}
            onInspectBatch={() => void runGoogleVisibilityAction('inspection')}
          />

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-black text-gray-900">Preview Organization JSON-LD</h3>
            <pre className="max-h-[420px] overflow-auto rounded-xl bg-gray-950 p-4 text-[11px] leading-relaxed text-emerald-100">{organizationPreview}</pre>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-black text-gray-900">Preview Route JSON-LD</h3>
            <pre className="max-h-[320px] overflow-auto rounded-xl bg-gray-950 p-4 text-[11px] leading-relaxed text-emerald-100">{routePreview}</pre>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-black text-gray-900">Preview Site Entity Schema</h3>
            <pre className="max-h-[320px] overflow-auto rounded-xl bg-gray-950 p-4 text-[11px] leading-relaxed text-emerald-100">{sitePreview}</pre>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="mb-1 flex items-center gap-2 font-bold"><CheckCircle className="h-4 w-4" />Nguyên tắc GEO</div>
            Schema chỉ giúp Google/AI hiểu dữ liệu; thứ hạng vẫn phụ thuộc nội dung thật, độ dày trang, internal links, tín hiệu doanh nghiệp và Search Console sau deploy.
          </div>
        </aside>
      </div>

      <ImageOptimizerCard />

      {auditModal && audit && (
        <AuditModal
          kind={auditModal}
          audit={audit}
          onClose={() => setAuditModal(null)}
          onEditProperty={id => { setAuditModal(null); onEditEntity?.('properties', id); }}
          onEditNews={id => { setAuditModal(null); onEditEntity?.('news', id); }}
          onEditArea={id => { setAuditModal(null); setActiveAreaId(id); }}
        />
      )}
    </div>
  );
}

function SearchVisibilityCard({
  audit,
  loading,
  syncing,
  googleAction,
  accessDiagnosis,
  error,
  onRefresh,
  onSync,
  onDiagnoseAccess,
  onSubmitSitemap,
  onInspectBatch,
}: {
  audit: SearchVisibilityAuditResponse | null;
  loading: boolean;
  syncing: boolean;
  googleAction: 'diagnostic' | 'sitemap' | 'inspection' | null;
  accessDiagnosis: SearchConsoleAccessDiagnosis | null;
  error: { message: string; code: string } | null;
  onRefresh: () => void;
  onSync: () => void;
  onDiagnoseAccess: () => void;
  onSubmitSitemap: () => void;
  onInspectBatch: () => void;
}) {
  const excluded = audit?.urls.filter(row => !row.eligible).slice(0, 4) ?? [];
  const lastRun = audit?.runs[0];
  const errorHint = error?.code === 'CANONICAL_CONSTRAINT'
    ? 'Constraint production đang sai regex. Hãy chạy migration sửa constraint, sau đó đồng bộ lại.'
    : error?.code === 'CANONICAL_POLICY'
      ? 'Đã chặn trước khi ghi dữ liệu vì URL không đúng canonical domain. Không cần chạy lại migration.'
      : error?.code === 'SOURCE_READ'
      ? 'Kiểm tra schema nguồn URL của production; không cần gọi Google hay chạy lại migration audit.'
      : error?.code === 'AUDIT_WRITE'
        ? 'Kiểm tra dữ liệu canonical/slug trong registry; không cần gọi Google.'
        : error?.code === 'GOOGLE_NOT_CONFIGURED'
          ? 'Chưa có Google API nào được gọi. Owner cần cấu hình secrets server-side và cấp service account quyền trên Search Console.'
          : error?.code === 'GOOGLE_AUTH'
            ? 'Google từ chối xác thực/quyền truy cập. Kiểm tra service account đã được thêm vào đúng Search Console property.'
            : error?.code === 'GOOGLE_DEFERRED'
              ? 'Đây là cooldown có chủ đích: sitemap vừa được gửi cùng fingerprint nên hệ thống không gọi lại Google.'
              : error?.code?.startsWith('GOOGLE_')
              ? 'Google trả về lỗi cấu hình hoặc phản hồi. Không có secret nào được hiển thị trong hệ thống.'
              : 'Kiểm tra quyền owner-MFA hoặc cấu hình server. Không có Google API nào được gọi ở bước này.';

  return (
    <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black text-gray-900"><Search className="h-4 w-4 text-indigo-600" />Search Visibility</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">Kiểm tra URL canonical đủ điều kiện theo sitemap/quality gate. Đây không phải công cụ ép Google index URL.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onRefresh} disabled={loading || syncing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Làm mới
          </button>
          <button type="button" onClick={onSync} disabled={loading || syncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            <ShieldCheck className="h-3.5 w-3.5" />{syncing ? 'Đang kiểm tra…' : 'Đồng bộ điều kiện URL'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"><strong>{error.message}</strong><br />{errorHint}</div>
      ) : loading ? (
        <p className="mt-4 text-sm text-gray-400">Đang tải audit URL…</p>
      ) : audit ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Metric label="URL đã đánh giá" value={audit.summary.total} tone="gray" />
            <Metric label="Đủ điều kiện" value={audit.summary.eligible} tone="green" />
            <Metric label="Chủ đích loại trừ" value={audit.summary.excluded} tone="amber" />
          </div>
          <div className="mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            <strong>Search Console: {audit.searchConsole.configurationState === 'configured' ? 'đã cấu hình server' : audit.searchConsole.configurationState === 'invalid' ? 'cấu hình server chưa hợp lệ' : 'chưa cấu hình server'}.</strong>{' '}
            Google evidence: <strong>{audit.summary.googleEvidenceCount}</strong> URL. Sitemap được Google nhận không đảm bảo crawl/index; URL Inspection phản ánh phiên bản Google đã biết, không phải live test.
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={onDiagnoseAccess} disabled={loading || syncing || !!googleAction || audit.searchConsole.configurationState !== 'configured'}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">
              <ShieldCheck className="h-3.5 w-3.5" />{googleAction === 'diagnostic' ? 'Đang chẩn đoán…' : 'Chẩn đoán quyền'}
            </button>
            <button type="button" onClick={onSubmitSitemap} disabled={loading || syncing || !!googleAction || audit.searchConsole.configurationState !== 'configured'}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50">
              <Globe2 className="h-3.5 w-3.5" />{googleAction === 'sitemap' ? 'Đang gửi sitemap…' : 'Gửi sitemap lên Search Console'}
            </button>
            <button type="button" onClick={onInspectBatch} disabled={loading || syncing || !!googleAction || audit.searchConsole.configurationState !== 'configured'}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50">
              <Search className="h-3.5 w-3.5" />{googleAction === 'inspection' ? 'Đang kiểm tra…' : 'Kiểm tra tối đa 5 URL'}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-gray-500">Chẩn đoán quyền chỉ đọc property `chonhaviet.com` mà service account đang nhìn thấy; không gửi sitemap, không kiểm tra URL và không hiển thị key/token.</p>
          {accessDiagnosis && (
            <div className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${accessDiagnosis.status === 'ACCESS_CONFIRMED' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              <strong>Service account: {accessDiagnosis.serviceAccountEmail}</strong><br />
              <strong>Property https://chonhaviet.com/: </strong>{accessDiagnosis.canonicalProperty.found ? accessDiagnosis.canonicalProperty.permissionLevel ?? 'Google không trả permission level' : 'không xuất hiện trong danh sách quyền'}.<br />
              {accessDiagnosis.domainProperty.found && <>Property domain `sc-domain:chonhaviet.com`: {accessDiagnosis.domainProperty.permissionLevel ?? 'không rõ'} (không thay thế quyền URL-prefix).<br /></>}
              {accessDiagnosis.alternateProperties.length > 0 && <>Property biến thể Google trả về: {accessDiagnosis.alternateProperties.map(property => `${property.siteUrl} (${property.permissionLevel ?? 'không rõ'})`).join(', ')}.<br /></>}
              {accessDiagnosis.message}
            </div>
          )}
          {audit.searchConsole.configurationState !== 'configured' && <p className="mt-2 text-[11px] leading-4 text-gray-500">Các thao tác Google đang khóa: chỉ owner cấu hình secrets server-side, cấp quyền Search Console rồi tải lại trang. Không nhập secret tại đây.</p>}
          {excluded.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-bold text-gray-700">Ưu tiên xử lý từ dữ liệu nguồn</p>
              {excluded.map(row => (
                <div key={row.source_key} className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                  <span className="font-bold text-gray-800">{row.source_key}</span> · {row.reason_code}{row.reason_detail ? `: ${row.reason_detail}` : ''}
                </div>
              ))}
            </div>
          )}
          {lastRun && <p className="mt-3 text-[11px] text-gray-400">Lần audit gần nhất: {new Date(lastRun.started_at).toLocaleString('vi-VN')} · {lastRun.status} · {lastRun.succeeded_count}/{lastRun.requested_count} URL.</p>}
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'gray' | 'green' | 'amber' }) {
  const colors = {
    gray: 'bg-gray-50 text-gray-800',
    green: 'bg-emerald-50 text-emerald-800',
    amber: 'bg-amber-50 text-amber-800',
  };
  return <div className={`rounded-xl px-2 py-3 ${colors[tone]}`}><p className="text-lg font-black">{value}</p><p className="text-[10px] font-semibold leading-4">{label}</p></div>;
}

function AuditCard({ label, count, hint, onClick }: { label: string; count: number; hint: string; onClick?: () => void }) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-left transition-colors ${clickable ? 'cursor-pointer hover:border-amber-300 hover:bg-amber-50/40' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-gray-900">{label}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{count}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
      {clickable && <p className="mt-1 text-[11px] font-semibold text-amber-600">Bấm để xem &amp; sửa →</p>}
    </button>
  );
}

const PROP_CHECKS: { key: keyof Property; label: string }[] = [
  { key: 'image_url', label: 'Ảnh' },
  { key: 'description', label: 'Mô tả' },
  { key: 'meta_description', label: 'Meta description' },
  { key: 'latitude', label: 'Vĩ độ' },
  { key: 'longitude', label: 'Kinh độ' },
];
const NEWS_CHECKS: { key: keyof NewsArticle; label: string }[] = [
  { key: 'excerpt', label: 'Excerpt' },
  { key: 'image_url', label: 'Ảnh' },
  { key: 'meta_description', label: 'Meta description' },
];
const AREA_CHECKS: { key: keyof Area; label: string }[] = [
  { key: 'description', label: 'Mô tả' },
  { key: 'meta_description', label: 'Meta description' },
];

function missingFields<T>(row: T, checks: { key: keyof T; label: string }[]): string[] {
  return checks.filter(c => {
    const v = row[c.key];
    return v === null || v === undefined || v === '';
  }).map(c => c.label);
}

function AuditModal({ kind, audit, onClose, onEditProperty, onEditNews, onEditArea }: {
  kind: 'properties' | 'news' | 'areas';
  audit: { properties: Property[]; news: NewsArticle[]; areas: Area[] };
  onClose: () => void;
  onEditProperty: (id: string) => void;
  onEditNews: (id: string) => void;
  onEditArea: (id: string) => void;
}) {
  const title = kind === 'properties' ? 'Tin BĐS cần bổ sung' : kind === 'news' ? 'Bài viết cần tối ưu' : 'Khu vực cần làm dày';
  const rows: { id: string; name: string; missing: string[]; onEdit: () => void }[] =
    kind === 'properties'
      ? audit.properties.map(p => ({ id: p.id, name: p.title || p.slug || p.id, missing: missingFields(p, PROP_CHECKS), onEdit: () => onEditProperty(p.id) }))
      : kind === 'news'
      ? audit.news.map(n => ({ id: n.id, name: n.title || n.slug || n.id, missing: missingFields(n, NEWS_CHECKS), onEdit: () => onEditNews(n.id) }))
      : audit.areas.map(a => ({ id: a.id, name: a.name || a.slug || a.id, missing: missingFields(a, AREA_CHECKS), onEdit: () => onEditArea(a.id) }));

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-black text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">{rows.length} mục đang thiếu dữ liệu · bấm “Sửa” để chỉnh trực tiếp.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Không còn mục nào thiếu.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map(r => (
                <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 p-3 hover:border-amber-200">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">{r.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.missing.map(m => (
                        <span key={m} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Thiếu {m}</span>
                      ))}
                    </div>
                  </div>
                  <button onClick={r.onEdit} className="flex-shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">Sửa</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
