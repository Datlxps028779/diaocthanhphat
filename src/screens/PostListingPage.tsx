'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Home, MapPin, Phone,
  CheckCircle, ArrowLeft, Info, Image as ImageIcon, Search, AlertCircle, Plus, X, Zap, Eye
} from 'lucide-react';
import { type ListingType } from '../lib/supabase';
import { submitUserListing, updateMyListing, getMyListing } from '../lib/api';
import { listingToFormState, formToProperty } from '../lib/listingForm';
import { LocationPicker, type GeocodeTarget } from '../components/LocationPicker';
import { PropertyDetailPage } from './PropertyDetailPage';
import { buildPropertyFaq, type FaqItem } from '../lib/propertyFaq';
import { extractErrorMessage } from '../lib/errorMessage';
import { useAreas, usePropertyTypes, useDistricts, useWards } from '../lib/hooks/useTaxonomy';
import Link from 'next/link';
import { type Page, pageToHref, scrollTop } from '../lib/router';
import { useAuth } from '../lib/auth';
import { requestAuth } from '../lib/authModal';
import { LEGAL_OPTIONS } from '../lib/legalOptions';
import { clearIncompatibleSpecValues, getCompatibleSpecFields, type SpecFieldKey } from '../lib/propertySpecs';
import { ImageUpload, ImageUrlInput } from '../components/ImageUpload';
import { AiDescriptionHelper } from '../components/AiDescriptionHelper';
import { useSEOAutofill, SEOPreview, generateSlug } from '../lib/useSEOAutofill';

interface PostListingPageProps {
  onNavigate: (p: Page) => void;
  editId?: string;   // có id = chế độ sửa: nạp tin cũ, submit sẽ update
}

const STEPS = ['Loại tin & Giá', 'Vị trí & Diện tích', 'Hình ảnh & Mô tả', 'Thông tin liên hệ', 'Cấu hình SEO', 'Xem trước'];
const DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Nam', 'Đông Bắc', 'Tây Nam', 'Tây Bắc'];
const AMENITIES_OPTIONS = [
  'Điện nước đầy đủ', 'Đường nhựa', 'An ninh 24/7', 'Gần trường học',
  'Gần bệnh viện', 'Gần chợ', 'Gần KCN', 'View sông', 'Gần cao tốc',
];

const LISTING_TYPE_OPTIONS: { value: ListingType; label: string; desc: string; color: string }[] = [
  { value: 'mua_ban', label: 'Bán', desc: 'Đăng tin bán bất động sản', color: 'red' },
  { value: 'cho_thue', label: 'Cho thuê', desc: 'Đăng tin cho thuê', color: 'blue' },
];

const isRental = (t: ListingType) => t === 'cho_thue';

const SPEC_LABELS: Record<SpecFieldKey, string> = {
  area_sqm: 'Diện tích (m²)',
  bedrooms: 'Số phòng ngủ',
  bathrooms: 'Số phòng tắm',
  legal_status: 'Pháp lý',
  direction: 'Hướng nhà',
  frontage: 'Mặt tiền (m)',
  road_width: 'Đường rộng (m)',
  floor_count: 'Số tầng',
  floor_number: 'Tầng căn hộ',
};

const SPEC_PLACEHOLDERS: Partial<Record<SpecFieldKey, string>> = {
  area_sqm: 'VD: 120',
  bedrooms: 'VD: 3',
  bathrooms: 'VD: 2',
};

export function PostListingPage({ onNavigate, editId }: PostListingPageProps) {
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(0);
  const { data: areas = [] } = useAreas();
  const { data: types = [] } = usePropertyTypes();
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [geocodeTarget, setGeocodeTarget] = useState<GeocodeTarget | undefined>();
  const geocodeNonce = useRef(0);
  const flyTo = useCallback((query: string, zoom: number) => {
    if (!query) return;
    setGeocodeTarget({ query, zoom, nonce: ++geocodeNonce.current });
  }, []);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState({
    listing_type: 'mua_ban' as ListingType,
    title: '', description: '',
    price: '', price_unit: 'tỷ', price_label: '',
    price_per_month: '',
    area_sqm: '', address: '', city: '', district: '', ward: '',
    area_id: '', property_type_id: '',
    image_url: '', images: [] as string[],
    video_url: '',
    legal_status: '', bedrooms: '', bathrooms: '', direction: '',
    contact_name: '', contact_phone: '', amenities: [] as string[],
    latitude: '', longitude: '',
    meta_title: '', meta_description: '', focus_keywords: '', schema_markup: '',
    faq: [] as FaqItem[],
  });

  const selectedPropertyType = types.find(t => t.id === form.property_type_id);
  const visibleSpecFields = getCompatibleSpecFields(selectedPropertyType, 'user_listing');
  const showSpec = (field: SpecFieldKey) => visibleSpecFields.includes(field);

  const set = (k: string, v: string | string[] | ListingType) => setForm(f => ({ ...f, [k]: v }));
  const setPropertyType = (id: string) => {
    const nextType = types.find(t => t.id === id);
    setForm(f => clearIncompatibleSpecValues({ ...f, property_type_id: id }, nextType, 'user_listing'));
  };

  // Quận/huyện theo khu vực đã chọn — tự fetch/cache qua React Query
  const { data: districts = [] } = useDistricts(form.area_id || undefined);
  // Phường/xã theo quận/huyện đã chọn. form.district lưu dạng TÊN nên phải map ra id.
  const selectedDistrictId = districts.find(d => d.name === form.district)?.id;
  const { data: wards = [] } = useWards(selectedDistrictId || undefined);

  // ─── SEO Autofill Hook ───────────────────────────────────────────────────────
  const seo = useSEOAutofill({
    title: form.title,
    description: form.description,
    price: form.price,
    price_unit: form.price_unit,
    price_per_month: form.price_per_month,
    listing_type: form.listing_type,
    city: form.city,
    district: form.district,
    area_sqm: form.area_sqm,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    image_url: form.image_url,
    images: form.images,
    address: form.address,
    latitude: form.latitude,
    longitude: form.longitude,
    contact_name: form.contact_name,
    contact_phone: form.contact_phone,
    property_type_name: types.find(t => t.id === form.property_type_id)?.name ?? '',
  });

  // Sync SEO fields vào form
  useEffect(() => { setForm(f => ({ ...f, meta_title: seo.metaTitle })); }, [seo.metaTitle]);
  useEffect(() => { setForm(f => ({ ...f, meta_description: seo.metaDescription })); }, [seo.metaDescription]);
  useEffect(() => { setForm(f => ({ ...f, focus_keywords: seo.focusKeywords })); }, [seo.focusKeywords]);
  useEffect(() => { setForm(f => ({ ...f, schema_markup: seo.schemaMarkup })); }, [seo.schemaMarkup]);

  // Chế độ sửa: nạp tin cũ vào form. Chỉ chạy 1 lần theo editId.
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    setLoadingEdit(true);
    getMyListing(editId)
      .then(listing => {
        if (!alive) return;
        if (!listing) { setLoadError('Không tìm thấy tin đăng hoặc bạn không có quyền sửa.'); return; }
        setForm(listingToFormState(listing));
        if (!listing.latitude && listing.city) {
          flyTo([listing.ward, listing.district, listing.city].filter(Boolean).join(', '), listing.ward ? 15 : listing.district ? 14 : 13);
        }
      })
      .catch(() => { if (alive) setLoadError('Không tải được tin đăng để sửa.'); })
      .finally(() => { if (alive) setLoadingEdit(false); });
    return () => { alive = false; };
  }, [editId]);

  // districts tự fetch/cache qua useDistricts(form.area_id); ở đây chỉ cập nhật
  // form + reset district đã chọn + đồng bộ map search.
  const setArea = useCallback((areaId: string, areaName: string) => {
    setForm(f => ({ ...f, area_id: areaId, city: areaName, district: '', ward: '' }));
    if (areaName) flyTo(areaName, 13);
  }, [flyTo]);

  const setDistrict = useCallback((district: string) => {
    setForm(f => {
      flyTo([district, f.city].filter(Boolean).join(', '), 14);
      return { ...f, district, ward: '' };
    });
  }, [flyTo]);

  // Chọn xã → zoom sát tới cấp phường/xã (trước đây bản đồ đứng yên).
  const setWard = useCallback((ward: string) => {
    setForm(f => {
      flyTo([ward, f.district, f.city].filter(Boolean).join(', '), 15);
      return { ...f, ward };
    });
  }, [flyTo]);

  const setCoords = useCallback((lat: string, lng: string) => {
    setForm(f => ({ ...f, latitude: lat, longitude: lng }));
  }, []);

  const setListingType = (lt: ListingType) => {
    setForm(f => ({
      ...f,
      listing_type: lt,
      price_unit: isRental(lt) ? 'triệu/tháng' : 'tỷ',
    }));
  };

  const toggleAmenity = (a: string) => {
    setForm(f => ({
      ...f,
      amenities: f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a],
    }));
  };

  const addFaq = () => setForm(f => ({ ...f, faq: [...f.faq, { question: '', answer: '' }] }));
  const removeFaq = (idx: number) => setForm(f => ({ ...f, faq: f.faq.filter((_, i) => i !== idx) }));
  const updateFaq = (idx: number, key: keyof FaqItem, value: string) =>
    setForm(f => ({ ...f, faq: f.faq.map((it, i) => (i === idx ? { ...it, [key]: value } : it)) }));
  const suggestFaq = () => setForm(f => {
    const generated = buildPropertyFaq(f);
    const existing = new Set(f.faq.map(it => it.question.trim()));
    return { ...f, faq: [...f.faq, ...generated.filter(g => !existing.has(g.question.trim()))] };
  });

  const validateStep = () => {
    const errs: Record<string, string> = {};
    if (step === 0) {
      if (!form.title.trim()) errs.title = 'Vui lòng nhập tiêu đề';
      if (!form.property_type_id) errs.property_type_id = 'Vui lòng chọn loại BĐS';
      if (isRental(form.listing_type)) {
        if (!form.price_per_month || parseFloat(form.price_per_month) <= 0)
          errs.price_per_month = 'Vui lòng nhập giá thuê';
      } else {
        if (!form.price || parseFloat(form.price) <= 0) errs.price = 'Vui lòng nhập giá';
      }
    }
    if (step === 1) {
      if (!form.city.trim()) errs.city = 'Vui lòng nhập tỉnh/thành phố';
    }
    if (step === 3) {
      if (!form.contact_name.trim()) errs.contact_name = 'Vui lòng nhập họ tên';
      if (!form.contact_phone.trim()) errs.contact_phone = 'Vui lòng nhập số điện thoại';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validateStep()) setStep(s => s + 1); };
  const prev = () => setStep(s => s - 1);

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Lọc bỏ các phần tử rỗng/falsy để đảm bảo mảng ảnh chỉ chứa URL hợp lệ
      const specForm = selectedPropertyType ? clearIncompatibleSpecValues(form, selectedPropertyType, 'user_listing') : form;
      const cleanImages = specForm.images.filter((url): url is string => !!url);
      const coverId = cleanImages[0] ?? (specForm.image_url || null);
      const payload = {
        listing_type: specForm.listing_type,
        title: specForm.title,
        description: specForm.description || null,
        price: specForm.price ? parseFloat(specForm.price) : 0,
        price_unit: specForm.price_unit,
        price_label: specForm.price_label || null,
        price_per_month: specForm.price_per_month ? parseFloat(specForm.price_per_month) : null,
        area_sqm: specForm.area_sqm ? parseFloat(specForm.area_sqm) : null,
        address: specForm.address || null,
        city: specForm.city,
        district: specForm.district || null,
        ward: specForm.ward || null,
        area_id: specForm.area_id || null,
        property_type_id: specForm.property_type_id || null,
        image_url: coverId,
        images: cleanImages.length > 0 ? cleanImages : null,
        slug: null,
        meta_title: specForm.meta_title || null,
        meta_description: specForm.meta_description || null,
        focus_keywords: specForm.focus_keywords || null,
        schema_markup: parseSchema(specForm.schema_markup),
        legal_status: specForm.legal_status || null,
        bedrooms: specForm.bedrooms ? parseInt(specForm.bedrooms) : null,
        bathrooms: specForm.bathrooms ? parseInt(specForm.bathrooms) : null,
        direction: specForm.direction || null,
        contact_name: specForm.contact_name,
        contact_phone: specForm.contact_phone,
        amenities: specForm.amenities.length ? specForm.amenities : null,
        latitude: specForm.latitude ? parseFloat(specForm.latitude) : null,
        longitude: specForm.longitude ? parseFloat(specForm.longitude) : null,
        formatted_address: null,
        vr_tour_url: null,
        video_url: specForm.video_url || null,
        contact_zalo: null,
        faq: (() => {
          const valid = specForm.faq
            .map(it => ({ question: it.question.trim(), answer: it.answer.trim() }))
            .filter(it => it.question && it.answer);
          return valid.length ? valid : null;
        })(),
      };
      if (editId) await updateMyListing(editId, payload);
      else await submitUserListing(payload);
    },
    onSuccess: () => setSubmitted(true),
    onError: (err) => setErrors({ submit: extractErrorMessage(err, editId ? 'Không lưu được tin' : 'Không gửi được tin') }),
  });
  const submitting = submitMutation.isPending;

  const handleSubmit = () => {
    if (!validateStep()) return;
    submitMutation.mutate();
  };

  // Gate đăng nhập: chưa đăng nhập thì KHÔNG cho vào form (RLS user_listings đòi
  // auth.uid() = user_id → submit sẽ bị chặn). Hiện màn mời đăng nhập thay vì để
  // người dùng điền hết rồi bấm gửi mà không có gì xảy ra.
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Home className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="font-black text-2xl text-gray-900 mb-2">Đăng nhập để đăng tin</h2>
          <p className="text-gray-500 text-sm mb-6">Bạn cần đăng nhập tài khoản trước khi đăng tin bất động sản.</p>
          <div className="flex gap-3">
            <button onClick={() => { onNavigate({ name: 'home' }); scrollTop(); }}
              className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
              Về trang chủ
            </button>
            <button onClick={() => requestAuth('login')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
              Đăng nhập
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Chế độ sửa: đang nạp tin cũ / lỗi nạp.
  if (editId && loadingEdit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
          Đang tải tin đăng để sửa...
        </div>
      </div>
    );
  }
  if (editId && loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="font-black text-2xl text-gray-900 mb-2">Không sửa được tin</h2>
          <p className="text-gray-500 text-sm mb-6">{loadError}</p>
          <button onClick={() => { onNavigate({ name: 'my-listings' }); scrollTop(); }}
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
            Về tin của tôi
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center mx-4">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="font-black text-2xl text-gray-900 mb-2">{editId ? 'Đã cập nhật thành công!' : 'Đã gửi thành công!'}</h2>
          <p className="text-gray-500 text-sm mb-2">{editId ? 'Tin đăng đã sửa và đang chờ duyệt lại.' : 'Tin đăng của bạn đang chờ quản trị viên duyệt.'}</p>
          <p className="text-gray-400 text-xs mb-6">Thông thường trong vòng 1–2 giờ làm việc.</p>
          <div className="flex gap-3">
            <Link href={pageToHref({ name: 'my-listings' })}
              className="flex-1 text-center border border-red-500 text-red-600 font-semibold py-2.5 rounded-xl text-sm hover:bg-red-50 transition-colors">
              Tin của tôi
            </Link>
            <button onClick={() => { onNavigate({ name: 'home' }); scrollTop(); }}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
              Về trang chủ
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => { onNavigate({ name: 'home' }); scrollTop(); }}
              className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" />Trang chủ
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-medium text-sm">{editId ? 'Sửa tin' : 'Đăng tin'}</span>
          </div>
          <h1 className="font-black text-2xl text-gray-900">{editId ? 'Sửa tin đăng' : 'Đăng tin bất động sản'}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{editId ? 'Sau khi lưu, tin sẽ chờ duyệt lại' : 'Tin sẽ được kiểm duyệt trước khi hiển thị công khai'}</p>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="flex items-center">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center flex-1 last:flex-none">
                <div className={`flex items-center gap-2 ${i <= step ? 'text-red-600' : 'text-gray-400'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${i < step ? 'bg-red-600 text-white' : i === step ? 'bg-red-600 text-white ring-4 ring-red-100' : 'bg-gray-200 text-gray-500'}`}>
                    {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className="text-xs font-medium hidden sm:block">{s}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${i < step ? 'bg-red-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

          {/* Step 0: Listing type, basic info, price */}
          {step === 0 && (
            <div className="space-y-5">
              <SectionLabel icon={<Home className="w-4 h-4 text-red-500" />} label="Loại tin & Thông tin cơ bản" />

              {/* Listing type selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Loại tin đăng *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {LISTING_TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setListingType(opt.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        form.listing_type === opt.value
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`font-bold text-sm ${form.listing_type === opt.value ? 'text-red-700' : 'text-gray-800'}`}>
                        {opt.label}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Loại bất động sản *" error={errors.property_type_id}>
                  <select value={form.property_type_id} onChange={e => setPropertyType(e.target.value)} className={selectCls(errors.property_type_id)}>
                    <option value="">-- Chọn loại --</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Pháp lý">
                  <select value={form.legal_status} onChange={e => set('legal_status', e.target.value)} className={selectCls()}>
                    <option value="">-- Chọn pháp lý --</option>
                    {LEGAL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </FormField>
              </div>

              <FormField label="Tiêu đề tin đăng *" error={errors.title}>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  placeholder={isRental(form.listing_type)
                    ? 'VD: Cho thuê nhà nguyên căn 3PN tại Dĩ An, 8 triệu/tháng'
                    : 'VD: Bán đất nền khu dân cư Hiệp Thành 3, Thủ Dầu Một, 120m²'}
                  className={inputCls(errors.title)} />
              </FormField>

              {/* Price fields */}
              {isRental(form.listing_type) ? (
                <FormField label="Giá thuê / tháng *" error={errors.price_per_month}>
                  <div className="flex gap-2">
                    <input type="number" value={form.price_per_month} onChange={e => set('price_per_month', e.target.value)}
                      placeholder="VD: 8" className={`flex-1 ${inputCls(errors.price_per_month)}`} />
                    <div className="flex items-center px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 whitespace-nowrap">
                      triệu/tháng
                    </div>
                  </div>
                </FormField>
              ) : (
                <div className="grid sm:grid-cols-3 gap-4">
                  <FormField label="Giá bán *" error={errors.price} className="sm:col-span-2">
                    <div className="flex gap-2">
                      <input type="number" value={form.price} onChange={e => set('price', e.target.value)}
                        placeholder="Nhập giá" className={`flex-1 ${inputCls(errors.price)}`} />
                      <select value={form.price_unit} onChange={e => set('price_unit', e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                        <option>tỷ</option><option>triệu</option>
                      </select>
                    </div>
                  </FormField>
                  <FormField label="Nhãn giá">
                    <input value={form.price_label} onChange={e => set('price_label', e.target.value)}
                      placeholder="VD: 2.5 tỷ" className={inputCls()} />
                  </FormField>
                </div>
              )}
            </div>
          )}

          {/* Step 1: Location & dimensions */}
          {step === 1 && (
            <div className="space-y-4">
              <SectionLabel icon={<MapPin className="w-4 h-4 text-red-500" />} label="Vị trí & Diện tích" />
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Tỉnh/Thành phố *" error={errors.city}>
                  <select value={form.area_id} onChange={e => {
                    const area = areas.find(a => a.id === e.target.value);
                    setArea(e.target.value, area?.name ?? '');
                  }} className={selectCls(errors.city)}>
                    <option value="">-- Chọn tỉnh/thành --</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Quận/Huyện">
                  {districts.length > 0 ? (
                    <select value={form.district} onChange={e => setDistrict(e.target.value)} className={selectCls()}>
                      <option value="">-- Chọn quận/huyện --</option>
                      {districts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  ) : (
                    <input value={form.district} onChange={e => setDistrict(e.target.value)}
                      placeholder="VD: Dĩ An, Thuận An..." className={inputCls()} />
                  )}
                </FormField>
                <FormField label="Phường/Xã">
                  {wards.length > 0 ? (
                    <select value={form.ward} onChange={e => setWard(e.target.value)} className={selectCls()}>
                      <option value="">-- Chọn phường/xã --</option>
                      {wards.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                    </select>
                  ) : (
                    <input value={form.ward} onChange={e => setWard(e.target.value)}
                      placeholder="VD: Bình Chuẩn, An Phú..." className={inputCls()} />
                  )}
                </FormField>
              </div>
              <FormField label="Địa chỉ chi tiết">
                <div className="flex gap-2">
                  <input value={form.address} onChange={e => set('address', e.target.value)}
                    placeholder="Số nhà, tên đường..." className={`flex-1 ${inputCls()}`} />
                  <button type="button"
                    onClick={() => flyTo([form.address, form.ward, form.district, form.city].filter(Boolean).join(', '), 16)}
                    disabled={!form.address.trim()}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-red-50 text-red-600 font-semibold px-4 rounded-xl text-sm hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    <Search className="w-4 h-4" />Tìm trên bản đồ
                  </button>
                </div>
              </FormField>

              {/* Pin-drop map */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Xác định vị trí trên bản đồ
                  <span className="font-normal text-gray-400 ml-1">(click để thả ghim)</span>
                </label>
                <LocationPicker
                  lat={form.latitude}
                  lng={form.longitude}
                  geocodeTarget={geocodeTarget}
                  onChange={setCoords}
                  onReverseGeocode={addr => set('address', addr)}
                />
                <p className="text-gray-400 text-xs mt-1.5 flex items-start gap-1.5">
                  <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  Chọn Tỉnh/Huyện/Xã để bản đồ tự zoom sát. Bấm "Tìm trên bản đồ" để nhảy tới địa chỉ, hoặc click/kéo ghim để đặt vị trí chính xác — địa chỉ tự cập nhật theo ghim.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Vĩ độ (Latitude)">
                  <input type="number" step="any" value={form.latitude} onChange={e => set('latitude', e.target.value)}
                    placeholder="Tự động từ bản đồ" className={inputCls()} />
                </FormField>
                <FormField label="Kinh độ (Longitude)">
                  <input type="number" step="any" value={form.longitude} onChange={e => set('longitude', e.target.value)}
                    placeholder="Tự động từ bản đồ" className={inputCls()} />
                </FormField>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {(['area_sqm', 'bedrooms', 'bathrooms'] as const).filter(field => showSpec(field)).map(field => (
                  <FormField key={field} label={SPEC_LABELS[field]}>
                    <input type="number" value={String(form[field] ?? '')} onChange={e => set(field, e.target.value)}
                      placeholder={SPEC_PLACEHOLDERS[field]} className={inputCls()} />
                  </FormField>
                ))}
              </div>
              {showSpec('direction') && (
                <FormField label="Hướng nhà">
                  <div className="grid grid-cols-4 gap-2">
                    {DIRECTIONS.map(d => (
                      <button key={d} type="button" onClick={() => set('direction', form.direction === d ? '' : d)}
                        className={`py-2 text-xs rounded-lg border transition-colors ${form.direction === d ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-600 hover:border-red-300'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </FormField>
              )}
            </div>
          )}

          {/* Step 2: Images & description */}
          {step === 2 && (
            <div className="space-y-5">
              <SectionLabel icon={<ImageIcon className="w-4 h-4 text-red-500" />} label="Hình ảnh & Mô tả" />

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Ảnh bất động sản <span className="font-normal text-gray-400">(tối đa 10 ảnh)</span>
                </label>
                <ImageUpload
                  images={form.images}
                  onChange={imgs => setForm(f => ({ ...f, images: imgs, image_url: imgs[0] ?? f.image_url }))}
                  maxImages={10}
                  folder="user-listings"
                />
              </div>

              {form.images.length === 0 && (
                <FormField label="Hoặc dán link ảnh đại diện">
                  <ImageUrlInput
                    value={form.image_url}
                    onChange={url => set('image_url', url)}
                    placeholder="https://..."
                  />
                  <p className="text-gray-400 text-xs mt-1 flex items-center gap-1">
                    <Info className="w-3 h-3" />Dán link ảnh từ Pexels, ImgBB hoặc dịch vụ lưu ảnh
                  </p>
                </FormField>
              )}

              <AiDescriptionHelper
                keywords={form.title}
                listingType={form.listing_type}
                area={areas.find(a => a.id === form.area_id)?.name ?? ''}
                price={isRental(form.listing_type) ? `${form.price_per_month} triệu/tháng` : `${form.price} ${form.price_unit}`}
                onApply={text => set('description', text)}
              />

              <FormField label="Link video thực tế (YouTube hoặc MP4)">
                <input
                  type="url"
                  value={form.video_url}
                  onChange={e => set('video_url', e.target.value)}
                  placeholder="https://youtube.com/watch?v=... hoặc https://..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <p className="text-gray-400 text-xs mt-1">Không bắt buộc. Hỗ trợ YouTube và link MP4 trực tiếp.</p>
              </FormField>

              <FormField label="Mô tả chi tiết">
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder={isRental(form.listing_type)
                    ? 'Mô tả vị trí, nội thất, tiện ích xung quanh, yêu cầu thuê...'
                    : 'Mô tả vị trí, đặc điểm, tiện ích xung quanh, lý do bán...'}
                  rows={12}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-y min-h-[10rem]" />
              </FormField>

              {/* FAQ nhập tay — hiển thị cuối trang chi tiết + sinh schema FAQPage */}
              <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Câu hỏi thường gặp (FAQ)</p>
                    <p className="mt-1 text-[11px] text-violet-700/80">Giúp khách nhanh nắm thông tin và tăng khả năng xuất hiện trên Google/AI. Bấm "Gợi ý hỏi + đáp" để tự sinh từ thông tin tin đăng rồi chỉnh lại. Chỉ câu đủ hỏi + đáp mới được lưu.</p>
                  </div>
                  <button type="button" onClick={suggestFaq}
                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-200">
                    <Zap className="h-3.5 w-3.5" /> Gợi ý hỏi + đáp
                  </button>
                </div>
                <div className="space-y-3">
                  {form.faq.map((item, idx) => (
                    <div key={idx} className="rounded-xl border border-violet-100 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-violet-600">Câu {idx + 1}</span>
                        <button type="button" onClick={() => removeFaq(idx)} className="text-red-500 hover:text-red-700" aria-label="Xóa câu hỏi">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input value={item.question} onChange={e => updateFaq(idx, 'question', e.target.value)} placeholder="Câu hỏi..."
                        className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                      <textarea value={item.answer} onChange={e => updateFaq(idx, 'answer', e.target.value)} rows={2} placeholder="Câu trả lời (bắt buộc để lưu)..."
                        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                    </div>
                  ))}
                  <button type="button" onClick={addFaq}
                    className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">
                    <Plus className="h-3.5 w-3.5" /> Thêm câu hỏi
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">Tiện ích</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AMENITIES_OPTIONS.map(a => (
                    <label key={a} className="flex items-center gap-2 cursor-pointer p-2.5 border border-gray-200 rounded-xl hover:border-red-300 transition-colors">
                      <input type="checkbox" checked={form.amenities.includes(a)}
                        onChange={() => toggleAmenity(a)} className="accent-red-500 flex-shrink-0 w-4 h-4" />
                      <span className="text-xs text-gray-700">{a}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Contact + review */}
          {step === 3 && (
            <div className="space-y-4">
              <SectionLabel icon={<Phone className="w-4 h-4 text-red-500" />} label="Thông tin liên hệ" />
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex gap-2.5">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-amber-800 text-xs leading-relaxed">
                  Thông tin liên hệ sẽ hiển thị cho người mua/thuê. Vui lòng điền chính xác để được liên hệ nhanh chóng.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Họ và tên *" error={errors.contact_name}>
                  <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)}
                    placeholder="Nguyễn Văn A" className={inputCls(errors.contact_name)} />
                </FormField>
                <FormField label="Số điện thoại *" error={errors.contact_phone}>
                  <input type="tel" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)}
                    placeholder="0901 234 567" className={inputCls(errors.contact_phone)} />
                </FormField>
              </div>

              {/* Review summary */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <h4 className="font-bold text-gray-900 text-sm mb-3">Xem lại tin đăng</h4>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Loại tin:</span>
                  <span className="font-medium text-gray-800">
                    {LISTING_TYPE_OPTIONS.find(o => o.value === form.listing_type)?.label}
                  </span>
                </div>
                {[
                  { label: 'Tiêu đề', value: form.title },
                  {
                    label: 'Giá',
                    value: isRental(form.listing_type)
                      ? `${form.price_per_month} triệu/tháng`
                      : `${form.price} ${form.price_unit}`
                  },
                  { label: 'Khu vực', value: areas.find(a => a.id === form.area_id)?.name ?? form.city },
                  { label: 'Diện tích', value: form.area_sqm ? `${form.area_sqm} m²` : '—' },
                  { label: 'Loại BĐS', value: types.find(t => t.id === form.property_type_id)?.name ?? '—' },
                  { label: 'Số ảnh', value: form.images.length > 0 ? `${form.images.length} ảnh` : (form.image_url ? '1 ảnh (URL)' : 'Chưa có') },
                ].map(row => (
                  <div key={row.label} className="flex justify-between text-xs">
                    <span className="text-gray-500">{row.label}:</span>
                    <span className="font-medium text-gray-800">{row.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: SEO Configuration */}
          {step === 4 && (
            <div className="space-y-5">
              <SectionLabel icon={<Search className="w-4 h-4 text-red-500" />} label="Cấu hình SEO" />

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 flex gap-2.5">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-blue-800 text-xs leading-relaxed">
                  Các trường SEO được tự động điền dựa trên thông tin tin đăng. Bạn có thể chỉnh sửa thủ công.
                  Slug (URL thân thiện) sẽ tự tạo khi đăng.
                </p>
              </div>

              <FormField label="Tiêu đề SEO (tối đa 60 ký tự)">
                <input
                  value={seo.metaTitle}
                  onChange={e => seo.setMetaTitle(e.target.value)}
                  maxLength={70}
                  placeholder="Tự động lấy từ tiêu đề tin..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </FormField>

              <FormField label="Meta Description (tối đa 155 ký tự)">
                <textarea
                  value={seo.metaDescription}
                  onChange={e => seo.setMetaDescription(e.target.value)}
                  maxLength={170}
                  rows={3}
                  placeholder="Tự động lấy từ mô tả..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
              </FormField>

              <FormField label="Từ khóa chính (Focus Keywords)">
                <input
                  value={seo.focusKeywords}
                  onChange={e => seo.setFocusKeywords(e.target.value)}
                  placeholder="bất động sản, Bình Dương, ..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </FormField>

              <FormField label="URL thân thiện (Slug)">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 flex-shrink-0">/bat-dong-san/</span>
                  <input
                    value={generateSlug(form.title)}
                    readOnly
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600"
                  />
                </div>
                <p className="text-gray-400 text-xs mt-1">Slug tự động tạo từ tiêu đề. Sẽ duy nhất khi đăng.</p>
              </FormField>

              {/* Schema Markup (JSON-LD) vẫn được tạo tự động ngầm khi submit —
                  ẩn khỏi giao diện vì người dùng không cần chỉnh tay, tránh nhiễu. */}

              <button
                type="button"
                onClick={seo.resetAuto}
                className="text-xs text-red-600 hover:underline"
              >
                ↻ Tự động điền lại từ thông tin tin
              </button>

              <div className="pt-2">
                <p className="text-xs font-semibold text-gray-700 mb-2">Live Preview</p>
                <SEOPreview
                  metaTitle={seo.metaTitle}
                  metaDescription={seo.metaDescription}
                  focusKeywords={seo.focusKeywords}
                />
              </div>
            </div>
          )}

          {/* Step 5: Preview giống hệt trang công khai (bắt buộc trước khi gửi) */}
          {step === 5 && (
            <div className="space-y-4">
              <SectionLabel icon={<Eye className="w-4 h-4 text-red-500" />} label="Xem trước trang tin" />
              <p className="text-sm text-gray-500">
                Đây là bản xem trước đúng như tin sẽ hiển thị công khai. Kiểm tra ảnh, giá, thông tin, mô tả và vị trí bản đồ trước khi gửi duyệt.
              </p>
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <PropertyDetailPage preview initialData={formToProperty(form as unknown as Record<string, unknown>, null, types, form.faq)} onNavigate={() => {}} />
              </div>
            </div>
          )}

          {/* Lỗi khi gửi tin — đặt ngoài các step để luôn hiển thị cạnh nút submit */}
          {errors.submit && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5 mt-6">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{errors.submit}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6 pt-5 border-t border-gray-100">
            <button disabled={step === 0} onClick={prev}
              className="flex items-center gap-2 border border-gray-200 text-gray-600 px-5 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-40">
              <ArrowLeft className="w-4 h-4" />Quay lại
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={next}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
                Tiếp theo →
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2 disabled:opacity-60">
                <CheckCircle className="w-4 h-4" />
                {submitting ? (editId ? 'Đang lưu...' : 'Đang gửi...') : (editId ? 'Lưu thay đổi' : 'Gửi duyệt tin')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {  return (
    <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
      {icon}<h3 className="font-bold text-gray-900">{label}</h3>
    </div>
  );
}
function FormField({ label, error, children, className = '' }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
// Schema JSON-LD tự sinh ẩn — không để JSON hỏng chặn việc gửi tin. Lỗi parse → null.
function parseSchema(raw: string): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
const inputCls = (err?: string) => `w-full border ${err ? 'border-red-400' : 'border-gray-200'} rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400`;
const selectCls = (err?: string) => `w-full border ${err ? 'border-red-400' : 'border-gray-200'} rounded-xl px-4 py-3 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-red-400`;