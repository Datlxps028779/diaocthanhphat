'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Home, MapPin, Phone,
  CheckCircle, ArrowLeft, Info, Image as ImageIcon, Search
} from 'lucide-react';
import { type ListingType } from '../lib/supabase';
import { submitUserListing } from '../lib/api';
import { useAreas, usePropertyTypes, useDistricts } from '../lib/hooks/useTaxonomy';
import { type Page, scrollTop } from '../lib/router';
import { ImageUpload, ImageUrlInput } from '../components/ImageUpload';
import { AiDescriptionHelper } from '../components/AiDescriptionHelper';
import { useSEOAutofill, SEOPreview, generateSlug } from '../lib/useSEOAutofill';

interface PostListingPageProps {
  onNavigate: (p: Page) => void;
}

const STEPS = ['Loại tin & Giá', 'Vị trí & Diện tích', 'Hình ảnh & Mô tả', 'Thông tin liên hệ', 'Cấu hình SEO'];
const DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Nam', 'Đông Bắc', 'Tây Nam', 'Tây Bắc'];
const LEGAL_OPTIONS = ['Sổ đỏ/sổ hồng', 'Hợp đồng mua bán', 'Giấy tay', 'Chưa có sổ'];
const AMENITIES_OPTIONS = [
  'Điện nước đầy đủ', 'Đường nhựa', 'An ninh 24/7', 'Gần trường học',
  'Gần bệnh viện', 'Gần chợ', 'Gần KCN', 'View sông', 'Gần cao tốc',
];

const LISTING_TYPE_OPTIONS: { value: ListingType; label: string; desc: string; color: string }[] = [
  { value: 'mua_ban', label: 'Bán', desc: 'Đăng tin bán bất động sản', color: 'red' },
  { value: 'cho_thue', label: 'Cho thuê', desc: 'Đăng tin cho thuê', color: 'blue' },
];

const isRental = (t: ListingType) => t === 'cho_thue';

export function PostListingPage({ onNavigate }: PostListingPageProps) {
  const [step, setStep] = useState(0);
  const { data: areas = [] } = useAreas();
  const { data: types = [] } = usePropertyTypes();
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mapSearchQuery, setMapSearchQuery] = useState('');

  const [form, setForm] = useState({
    listing_type: 'mua_ban' as ListingType,
    title: '', description: '',
    price: '', price_unit: 'tỷ', price_label: '',
    price_per_month: '',
    area_sqm: '', address: '', city: '', district: '',
    area_id: '', property_type_id: '',
    image_url: '', images: [] as string[],
    video_url: '',
    legal_status: '', bedrooms: '', bathrooms: '', direction: '',
    contact_name: '', contact_phone: '', amenities: [] as string[],
    latitude: '', longitude: '',
    meta_title: '', meta_description: '', focus_keywords: '', schema_markup: '',
  });

  const set = (k: string, v: string | string[] | ListingType) => setForm(f => ({ ...f, [k]: v }));

  // Quận/huyện theo khu vực đã chọn — tự fetch/cache qua React Query
  const { data: districts = [] } = useDistricts(form.area_id || undefined);

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

  // districts tự fetch/cache qua useDistricts(form.area_id); ở đây chỉ cập nhật
  // form + reset district đã chọn + đồng bộ map search.
  const setArea = useCallback((areaId: string, areaName: string) => {
    setForm(f => ({ ...f, area_id: areaId, city: areaName, district: '' }));
    if (areaName) setMapSearchQuery(areaName);
  }, []);

  const setDistrict = useCallback((district: string) => {
    setForm(f => {
      const query = [district, f.city].filter(Boolean).join(', ');
      if (query) setMapSearchQuery(query);
      return { ...f, district };
    });
  }, []);

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
      const cleanImages = form.images.filter((url): url is string => !!url);
      const coverId = cleanImages[0] ?? (form.image_url || null);
      await submitUserListing({
        listing_type: form.listing_type,
        title: form.title,
        description: form.description || null,
        price: form.price ? parseFloat(form.price) : 0,
        price_unit: form.price_unit,
        price_label: form.price_label || null,
        price_per_month: form.price_per_month ? parseFloat(form.price_per_month) : null,
        area_sqm: form.area_sqm ? parseFloat(form.area_sqm) : null,
        address: form.address || null,
        city: form.city,
        district: form.district || null,
        area_id: form.area_id || null,
        property_type_id: form.property_type_id || null,
        image_url: coverId,
        images: cleanImages.length > 0 ? cleanImages : null,
        slug: null,
        meta_title: form.meta_title || null,
        meta_description: form.meta_description || null,
        focus_keywords: form.focus_keywords || null,
        schema_markup: form.schema_markup ? JSON.parse(form.schema_markup) : null,
        legal_status: form.legal_status || null,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms) : null,
        bathrooms: form.bathrooms ? parseInt(form.bathrooms) : null,
        direction: form.direction || null,
        contact_name: form.contact_name,
        contact_phone: form.contact_phone,
        amenities: form.amenities.length ? form.amenities : null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        formatted_address: null,
        vr_tour_url: null,
        video_url: form.video_url || null,
        contact_zalo: null,
      });
    },
    onSuccess: () => setSubmitted(true),
    onError: (err) => setErrors({ submit: err instanceof Error ? err.message : 'Có lỗi xảy ra' }),
  });
  const submitting = submitMutation.isPending;

  const handleSubmit = () => {
    if (!validateStep()) return;
    submitMutation.mutate();
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center mx-4">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="font-black text-2xl text-gray-900 mb-2">Đã gửi thành công!</h2>
          <p className="text-gray-500 text-sm mb-2">Tin đăng của bạn đang chờ quản trị viên duyệt.</p>
          <p className="text-gray-400 text-xs mb-6">Thông thường trong vòng 1–2 giờ làm việc.</p>
          <div className="flex gap-3">
            <button onClick={() => onNavigate({ name: 'my-listings' })}
              className="flex-1 border border-red-500 text-red-600 font-semibold py-2.5 rounded-xl text-sm hover:bg-red-50 transition-colors">
              Tin của tôi
            </button>
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
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => { onNavigate({ name: 'home' }); scrollTop(); }}
              className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" />Trang chủ
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-medium text-sm">Đăng tin</span>
          </div>
          <h1 className="font-black text-2xl text-gray-900">Đăng tin bất động sản</h1>
          <p className="text-gray-500 text-sm mt-0.5">Tin sẽ được kiểm duyệt trước khi hiển thị công khai</p>
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
                  <select value={form.property_type_id} onChange={e => set('property_type_id', e.target.value)} className={selectCls(errors.property_type_id)}>
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
              </div>
              <FormField label="Địa chỉ chi tiết">
                <input value={form.address} onChange={e => set('address', e.target.value)}
                  placeholder="Số nhà, tên đường..." className={inputCls()} />
              </FormField>

              {/* Pin-drop map */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Xác định vị trí trên bản đồ
                  <span className="font-normal text-gray-400 ml-1">(click để thả ghim)</span>
                </label>
                <PinDropMap
                  lat={form.latitude}
                  lng={form.longitude}
                  searchQuery={mapSearchQuery}
                  onChange={setCoords}
                />
                <p className="text-gray-400 text-xs mt-1.5 flex items-start gap-1.5">
                  <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  Chọn Tỉnh/Huyện để bản đồ tự zoom. Click trực tiếp lên bản đồ để đặt ghim và lấy tọa độ tự động.
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
                <FormField label="Diện tích (m²)">
                  <input type="number" value={form.area_sqm} onChange={e => set('area_sqm', e.target.value)}
                    placeholder="VD: 120" className={inputCls()} />
                </FormField>
                <FormField label="Số phòng ngủ">
                  <input type="number" value={form.bedrooms} onChange={e => set('bedrooms', e.target.value)}
                    placeholder="VD: 3" className={inputCls()} />
                </FormField>
                <FormField label="Số phòng tắm">
                  <input type="number" value={form.bathrooms} onChange={e => set('bathrooms', e.target.value)}
                    placeholder="VD: 2" className={inputCls()} />
                </FormField>
              </div>
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
                  rows={5}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              </FormField>

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

              {errors.submit && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2.5">
                  {errors.submit}
                </div>
              )}
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
                  Slug (URL thân thiện) sẽ tự tạo khi đăng. Schema Markup (JSON-LD) giúp Google hiểu rõ loại tin BĐS.
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

              <FormField label="Schema Markup (JSON-LD - RealEstateListing)">
                <textarea
                  value={seo.schemaMarkup}
                  onChange={e => seo.setSchemaMarkup(e.target.value)}
                  rows={8}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
              </FormField>

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
                {submitting ? 'Đang gửi...' : 'Gửi duyệt tin'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
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
const inputCls = (err?: string) => `w-full border ${err ? 'border-red-400' : 'border-gray-200'} rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400`;
const selectCls = (err?: string) => `w-full border ${err ? 'border-red-400' : 'border-gray-200'} rounded-xl px-4 py-3 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-red-400`;

interface PinDropMapProps {
  lat: string;
  lng: string;
  searchQuery: string;
  onChange: (lat: string, lng: string) => void;
}

function PinDropMap({ lat, lng, searchQuery, onChange }: PinDropMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);
  const searchRef = useRef('');

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: import('leaflet').Map;

    import('leaflet').then(module => {
      const L = module.default;
      import('leaflet/dist/leaflet.css');

      map = L.map(containerRef.current!, {
        center: [10.9804, 106.6519],
        zoom: 10,
        zoomControl: true,
        attributionControl: false,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(map);

      const pinIcon = L.divIcon({
        className: '',
        html: `<div style="width:28px;height:36px;position:relative;">
          <svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="#dc2626"/>
            <circle cx="12" cy="12" r="5" fill="white"/>
          </svg>
        </div>`,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
      });

      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
          markerRef.current.on('dragend', () => {
            if (!markerRef.current) return;
            const pos = markerRef.current.getLatLng();
            onChangeRef.current(pos.lat.toFixed(6), pos.lng.toFixed(6));
          });
        }
        onChangeRef.current(lat.toFixed(6), lng.toFixed(6));
      });
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external lat/lng changes to marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lat || !lng) return;
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) return;
    import('leaflet').then(module => {
      const L = module.default;
      if (markerRef.current) {
        markerRef.current.setLatLng([latN, lngN]);
      } else {
        const pinIcon = L.divIcon({
          className: '',
          html: `<div style="width:28px;height:36px;">
            <svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="#dc2626"/>
              <circle cx="12" cy="12" r="5" fill="white"/>
            </svg>
          </div>`,
          iconSize: [28, 36],
          iconAnchor: [14, 36],
        });
        markerRef.current = L.marker([latN, lngN], { icon: pinIcon, draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => {
          if (!markerRef.current) return;
          const pos = markerRef.current.getLatLng();
          onChangeRef.current(pos.lat.toFixed(6), pos.lng.toFixed(6));
        });
      }
      map.setView([latN, lngN], Math.max(map.getZoom(), 14));
    });
  }, [lat, lng]);

  // Geocode and fly to area when searchQuery changes
  useEffect(() => {
    if (!searchQuery || searchQuery === searchRef.current) return;
    searchRef.current = searchQuery;
    const map = mapRef.current;
    if (!map) return;

    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery + ', Vietnam')}&format=json&limit=1`)
      .then(r => r.json())
      .then((results: Array<{ lat: string; lon: string }>) => {
        if (results.length > 0) {
          map.flyTo([parseFloat(results[0].lat), parseFloat(results[0].lon)], 13, { duration: 1.2 });
        }
      })
      .catch(() => {});
  }, [searchQuery]);

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: '280px' }}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}