'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Home, MapPin, Phone,
  CheckCircle, ArrowLeft, Info, Image as ImageIcon, Search, AlertCircle, Plus, X, Zap, Eye
} from 'lucide-react';
import { type ListingType } from '../lib/supabase';
import { submitUserListing, updateMyListing, getMyListing, adminUpdatePendingUserListing } from '../lib/api';
import { listingToFormState, formToProperty } from '../lib/listingForm';
import { LocationPicker, type GeocodeTarget, type TaxonomyScope } from '../components/LocationPicker';
import { PropertyDetailPage } from './PropertyDetailPage';
import { buildPropertyFaq, type FaqItem } from '../lib/propertyFaq';
import { extractErrorMessage } from '../lib/errorMessage';
import { useAreas, usePropertyTypes, useDistricts, useWards, useNeighborhoods, useTaxonomyGeo } from '../lib/hooks/useTaxonomy';
import Link from 'next/link';
import { type Page, pageToHref, scrollTop } from '../lib/router';
import { useAuth } from '../lib/auth';
import { requestAuth } from '../lib/authModal';
import { LEGAL_OPTIONS } from '../lib/legalOptions';
import { isValidVnPhone } from '../lib/phone';
import { clearIncompatibleSpecValues, getCompatibleSpecFields, type SpecFieldKey } from '../lib/propertySpecs';
import { applyAreaSelection, applyDistrictSelection, resolveUniqueDistrict } from '../lib/locationSelection';
import { ImageUpload, ImageUrlInput } from '../components/ImageUpload';
import { AiDescriptionHelper } from '../components/AiDescriptionHelper';
import { RichTextEditor } from '../components/admin/shared/RichTextEditor';
import { useSEOAutofill, SEOPreview, generateSlug } from '../lib/useSEOAutofill';
import { formatFinancingAmount, formatListingPrice, formatPriceInput, parsePriceInput, subtractListingPriceValues } from '../lib/listingPrice';
import { PriceField } from '../components/PriceField';
import { coordinatePairFromUnknown, validateCoordinatePair } from '../lib/locationCoordinates';
import { pickTaxonomyGeo, taxonomyGeoLabel, isValidTaxonomyCenter } from '../lib/taxonomyGeo';
import { findExactTaxonomyGeo, validatePointForWard } from '../lib/taxonomyPoint';
import { normalizeListingTitle } from '../lib/listingTitle';
import { validateListingForm, parseOptionalPositiveDecimal, parseOptionalNonNegativeInteger, plainTextDescription, DESCRIPTION_MIN, LISTING_TITLE_MAX, countListingImages } from '../lib/listingValidation';
import { clearListingDraft, hasListingDraftContent, readListingDraft, writeListingDraft, type ListingDraft } from '../lib/listingDraft';

interface PostListingPageProps {
  onNavigate: (p: Page) => void;
  editId?: string;   // có id = chế độ sửa: nạp tin cũ, submit sẽ update
  adminMode?: boolean;
  onAdminSaved?: () => void;
}

const STEPS = ['Thông tin & Giá', 'Vị trí & Thông số', 'Ảnh & Mô tả', 'Liên hệ & Kiểm tra', 'Nâng cao', 'Xem trước'];
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

export function PostListingPage({ onNavigate, editId, adminMode = false, onAdminSaved }: PostListingPageProps) {
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(0);
  const { data: areas = [] } = useAreas();
  const { data: types = [] } = usePropertyTypes();
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [geocodeTarget, setGeocodeTarget] = useState<GeocodeTarget | undefined>();
  const [mapResetNonce, setMapResetNonce] = useState(0);
  const geocodeNonce = useRef(0);
  const addressSearchActiveRef = useRef(false);
  const addressEditedRef = useRef(false);
  const flyTo = useCallback((query: string, zoom: number, intent: GeocodeTarget['intent'] = 'taxonomy', bounds?: GeocodeTarget['bounds'], taxonomyLabel?: string, geojson?: GeocodeTarget['geojson'], taxonomyScope?: TaxonomyScope, center?: GeocodeTarget['center']) => {
    if (!query) return;
    if (intent === 'address') addressSearchActiveRef.current = true;
    setGeocodeTarget({ query, zoom, intent, bounds, taxonomyLabel, geojson, taxonomyScope, center, nonce: ++geocodeNonce.current });
  }, []);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [loadError, setLoadError] = useState('');
  const [titleCorrection, setTitleCorrection] = useState('');
  const [draftCandidate, setDraftCandidate] = useState<ListingDraft<Record<string, unknown>> | null>(null);
  const draftReadyRef = useRef(false);

  const [form, setForm] = useState({
    listing_type: 'mua_ban' as ListingType,
    title: '', description: '',
    price: '', price_unit: 'tỷ', price_label: '',
    price_per_month: '',
    loan_support: '',
    area_sqm: '', address: '', city: '', district: '', ward: '', neighborhood_slug: '',
    area_id: '', district_id: '', ward_id: '', property_type_id: '',
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

  const set = (k: string, v: string | string[] | ListingType) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(current => current[k] ? { ...current, [k]: '' } : current);
  };
  const normalizeTitleInput = useCallback(() => {
    const normalized = normalizeListingTitle(form.title, [form.city, form.district, form.ward]);
    if (!normalized.changed) return;
    setForm(current => ({ ...current, title: normalized.value }));
    setTitleCorrection('Đã tự sửa viết hoa, khoảng trắng hoặc lỗi chính tả trong tiêu đề.');
  }, [form.title, form.city, form.district, form.ward]);
  const setPropertyType = (id: string) => {
    const nextType = types.find(t => t.id === id);
    setForm(f => clearIncompatibleSpecValues({ ...f, property_type_id: id }, nextType, 'user_listing'));
  };

  // Quận/huyện theo khu vực đã chọn — tự fetch/cache qua React Query. ID là
  // nguồn chọn chính; fallback unique-name chỉ để mở các tin cũ chưa có district_id.
  const { data: districts = [], isLoading: loadingDistricts } = useDistricts(form.area_id || undefined, { fetchAll: false });
  const selectedDistrictById = districts.find(d => d.id === form.district_id && d.area_id === form.area_id);
  const selectedDistrict = selectedDistrictById
    ?? resolveUniqueDistrict(districts, form.area_id, form.district);
  const selectedDistrictId = selectedDistrict?.id;
  const { data: wards = [], isLoading: loadingWards } = useWards(selectedDistrictId || undefined, { fetchAll: false });
  const selectedWardById = wards.find(w => w.id === form.ward_id && w.district_id === selectedDistrictId);
  const legacyWardMatches = wards.filter(w => w.name === form.ward && w.district_id === selectedDistrictId);
  const selectedWard = selectedWardById ?? (legacyWardMatches.length === 1 ? legacyWardMatches[0] : undefined);
  const selectedWardId = selectedWard?.id;
  const { data: neighborhoods = [] } = useNeighborhoods(selectedWardId || undefined, { fetchAll: false });
  const taxonomyIds = [form.area_id, selectedDistrictId, selectedWardId].filter((id): id is string => Boolean(id));
  const { data: taxonomyGeo = [] } = useTaxonomyGeo(taxonomyIds);
  const selectedTaxonomyGeo = pickTaxonomyGeo(taxonomyGeo, {
    areaId: form.area_id,
    districtId: selectedDistrictId,
    wardId: selectedWardId,
  });
  const selectedWardGeo = findExactTaxonomyGeo(taxonomyGeo, 'ward', selectedWardId);

  useEffect(() => {
    if (!form.area_id || addressSearchActiveRef.current) return;
    const query = [form.ward, form.district, form.city].filter(Boolean).join(', ');
    if (!query) return;
    const taxonomyScope: TaxonomyScope = {
      level: form.ward ? 'ward' : form.district ? 'district' : 'area',
      areaName: form.city,
      districtName: form.district || undefined,
      wardName: form.ward || undefined,
    };
    const zoom = form.ward ? 14 : form.district ? 13 : 11;
    flyTo(query, zoom, 'taxonomy', selectedTaxonomyGeo?.bounds, taxonomyGeoLabel(selectedTaxonomyGeo), selectedTaxonomyGeo?.geojson ?? undefined, taxonomyScope, selectedTaxonomyGeo && isValidTaxonomyCenter(selectedTaxonomyGeo) ? { lat: selectedTaxonomyGeo.center_lat as number, lng: selectedTaxonomyGeo.center_lng as number } : undefined);
  }, [form.area_id, form.city, form.district, form.ward, selectedTaxonomyGeo, flyTo]);

  // Khi mở tin cũ, chỉ nâng cấp state từ text sang ID nếu có đúng một district
  // trong area hiện tại. Không tự chọn khi dữ liệu taxonomy thay đổi/không rõ ràng.
  useEffect(() => {
    if (!form.area_id || !form.district || districts.length === 0 || selectedDistrictById) return;
    const matched = resolveUniqueDistrict(districts, form.area_id, form.district);
    if (matched) {
      setForm(f => ({ ...f, district_id: matched.id, district: matched.name }));
    } else if (form.district_id) {
      setForm(f => ({ ...f, district_id: '' }));
    }
  }, [districts, form.area_id, form.district, form.district_id, selectedDistrictById]);

  useEffect(() => {
    if (!selectedDistrictId || !form.ward || wards.length === 0 || selectedWardById) return;
    if (legacyWardMatches.length === 1) {
      setForm(current => ({ ...current, ward_id: legacyWardMatches[0].id, ward: legacyWardMatches[0].name }));
    } else if (form.ward_id) {
      setForm(current => ({ ...current, ward_id: '' }));
    }
  }, [selectedDistrictId, form.ward, form.ward_id, wards, selectedWardById, legacyWardMatches]);

  // ─── SEO Autofill Hook ───────────────────────────────────────────────────────
  const seo = useSEOAutofill({
    title: form.title,
    description: form.description,
    price: parsePriceInput(form.price) ?? undefined,
    price_unit: form.price_unit,
    price_per_month: parsePriceInput(form.price_per_month) ?? undefined,
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
        addressEditedRef.current = Boolean(listing.address?.trim());
      })
      .catch(() => { if (alive) setLoadError('Không tải được tin đăng để sửa.'); })
      .finally(() => { if (alive) setLoadingEdit(false); });
    return () => { alive = false; };
  }, [editId]);

  useEffect(() => {
    if (authLoading || !user || (editId && loadingEdit)) return;
    const draft = readListingDraft<Record<string, unknown>>(user.id, editId);
    draftReadyRef.current = true;
    if (draft && hasListingDraftContent(draft.form)) setDraftCandidate(draft);
  }, [authLoading, user, editId, loadingEdit]);

  useEffect(() => {
    if (!draftReadyRef.current || !user || !hasListingDraftContent(form)) return;
    const timer = window.setTimeout(() => writeListingDraft(user.id, editId, form, step), 800);
    return () => window.clearTimeout(timer);
  }, [form, step, user, editId]);

  const restoreDraft = () => {
    if (!draftCandidate) return;
    setForm(current => ({ ...current, ...draftCandidate.form, ward_id: String(draftCandidate.form.ward_id ?? '') } as typeof form));
    addressEditedRef.current = Boolean(String(draftCandidate.form.address ?? '').trim());
    setStep(Math.min(Math.max(draftCandidate.step, 0), STEPS.length - 1));
    setDraftCandidate(null);
  };

  const discardDraft = () => {
    if (user) clearListingDraft(user.id, editId);
    setDraftCandidate(null);
  };

  const setArea = useCallback((areaId: string, _areaName: string) => {
    addressSearchActiveRef.current = false;
    addressEditedRef.current = false;
    if (!areaId) {
      setGeocodeTarget(undefined);
      setMapResetNonce(current => current + 1);
    }
    setForm(f => applyAreaSelection(f, areaId, _areaName));
    setErrors(current => ({ ...current, district_id: '', ward_id: '', map_location: '', latitude: '', longitude: '' }));
  }, []);

  const setDistrict = useCallback((districtId: string) => {
    addressSearchActiveRef.current = false;
    addressEditedRef.current = false;
    const district = districts.find(d => d.id === districtId) ?? null;
    setForm(f => applyDistrictSelection(f, district));
    setErrors(current => ({ ...current, district_id: '', ward_id: '', map_location: '', latitude: '', longitude: '' }));
  }, [districts]);

  const setWard = useCallback((wardId: string) => {
    addressSearchActiveRef.current = false;
    addressEditedRef.current = false;
    const ward = wards.find(item => item.id === wardId) ?? null;
    setForm(current => ({
      ...current,
      ward_id: ward?.id ?? '',
      ward: ward?.name ?? '',
      neighborhood_slug: '',
      address: '',
      latitude: '',
      longitude: '',
    }));
    setErrors(current => ({ ...current, ward_id: '', map_location: '', latitude: '', longitude: '' }));
  }, [wards]);

  const setCoords = useCallback((lat: string, lng: string) => {
    setForm(f => ({ ...f, latitude: lat, longitude: lng }));
    setErrors(current => ({ ...current, map_location: '', latitude: '', longitude: '' }));
  }, []);

  const setListingType = (lt: ListingType) => {
    if (lt === form.listing_type) return;
    const hasIncompatiblePrice = Boolean(form.price.trim() || form.price_per_month.trim() || form.loan_support.trim());
    if (hasIncompatiblePrice && typeof window !== 'undefined' && !window.confirm('Đổi loại tin sẽ xóa giá và khoản vay đang nhập để tránh gửi nhầm dữ liệu. Bạn có muốn tiếp tục không?')) return;
    setForm(f => ({
      ...f,
      listing_type: lt,
      price: '',
      price_per_month: '',
      loan_support: '',
      price_unit: isRental(lt) ? 'triệu/tháng' : 'tỷ',
    }));
    setErrors(current => {
      const next = { ...current };
      delete next.price;
      delete next.price_per_month;
      delete next.loan_support;
      return next;
    });
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

  const validateLocation = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.area_id || !areas.some(area => area.id === form.area_id && area.name === form.city)) {
      nextErrors.city = 'Vui lòng chọn tỉnh/thành phố từ danh mục.';
    }
    if (!form.district_id) {
      nextErrors.district_id = 'Vui lòng chọn quận/huyện.';
    } else if (!selectedDistrictById) {
      nextErrors.district_id = 'Quận/huyện không thuộc tỉnh đã chọn. Vui lòng chọn lại.';
    }
    if (!form.ward_id) {
      nextErrors.ward_id = 'Vui lòng chọn xã/phường.';
    } else if (!selectedWardById) {
      nextErrors.ward_id = 'Xã/phường không thuộc quận/huyện đã chọn. Vui lòng chọn lại.';
    }

    const coordinates = validateCoordinatePair(form.latitude, form.longitude);
    if (!coordinates.valid) {
      Object.assign(nextErrors, coordinates.fieldErrors ?? { latitude: coordinates.message, longitude: coordinates.message });
    } else if (coordinates.coordinates.latitude !== null && coordinates.coordinates.longitude !== null) {
      const pointValidation = validatePointForWard(
        { lat: coordinates.coordinates.latitude, lng: coordinates.coordinates.longitude },
        selectedWardId,
        selectedWardGeo,
        form.ward || 'xã/phường đã chọn',
      );
      if (!pointValidation.valid) nextErrors.map_location = pointValidation.message;
    }
    return nextErrors;
  };

  const validateCurrentStep = (targetStep = step) => {
    const all = validateListingForm(form, { includeQualityGate: true });
    const keysByStep: Record<number, string[]> = {
      0: ['title', 'property_type_id', 'price', 'price_per_month', 'loan_support'],
      1: ['city', 'district_id', 'ward_id', 'map_location', 'area_sqm', 'bedrooms', 'bathrooms', 'latitude', 'longitude'],
      2: ['images', 'description'],
      3: ['contact_name', 'contact_phone'],
    };
    const errorsForStep: Record<string, string> = {};
    for (const key of keysByStep[targetStep] ?? []) if (all[key]) errorsForStep[key] = all[key];
    if (targetStep === 3 && form.contact_phone.trim() && !isValidVnPhone(form.contact_phone)) {
      errorsForStep.contact_phone = 'Số điện thoại chưa hợp lệ (VD: 0901234567)';
    }
    if (targetStep === 1) Object.assign(errorsForStep, validateLocation());
    return errorsForStep;
  };

  const validateStep = () => {
    const errs = validateCurrentStep();
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validateStep()) setStep(s => s + 1); };
  const prev = () => setStep(s => s - 1);

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Lọc bỏ các phần tử rỗng/falsy để đảm bảo mảng ảnh chỉ chứa URL hợp lệ
      const specForm = selectedPropertyType ? clearIncompatibleSpecValues(form, selectedPropertyType, 'user_listing') : form;
      const canonicalTitle = normalizeListingTitle(specForm.title, [specForm.city, specForm.district, specForm.ward]).value;
      if (canonicalTitle !== specForm.title) {
        setForm(current => ({ ...current, title: canonicalTitle }));
        setTitleCorrection('Đã tự sửa viết hoa, khoảng trắng hoặc lỗi chính tả trong tiêu đề.');
      }
      const cleanImages = specForm.images.filter((url): url is string => !!url);
      const coverId = cleanImages[0] ?? (specForm.image_url || null);
      const coordinates = coordinatePairFromUnknown(specForm.latitude, specForm.longitude);
      const payload = {
        listing_type: specForm.listing_type,
        title: canonicalTitle,
        description: specForm.description || null,
        price: parsePriceInput(specForm.price) ?? 0,
        price_unit: specForm.price_unit,
        price_label: specForm.price_label || null,
        price_per_month: parsePriceInput(specForm.price_per_month),
        loan_support: parsePriceInput(specForm.loan_support),
        area_sqm: specForm.area_sqm ? parseOptionalPositiveDecimal(specForm.area_sqm) : null,
        address: specForm.address || null,
        city: specForm.city,
        district: specForm.district || null,
        ward: specForm.ward || null,
        neighborhood_slug: specForm.neighborhood_slug || null,
        area_id: specForm.area_id || null,
        district_id: selectedDistrict?.id || null,
        ward_id: selectedWard?.id || null,
        property_type_id: specForm.property_type_id || null,
        image_url: coverId,
        images: cleanImages.length > 0 ? cleanImages : null,
        slug: null,
        meta_title: specForm.meta_title || null,
        meta_description: specForm.meta_description || null,
        focus_keywords: specForm.focus_keywords || null,
        schema_markup: parseSchema(specForm.schema_markup),
        legal_status: specForm.legal_status || null,
        bedrooms: specForm.bedrooms ? parseOptionalNonNegativeInteger(specForm.bedrooms) : null,
        bathrooms: specForm.bathrooms ? parseOptionalNonNegativeInteger(specForm.bathrooms) : null,
        direction: specForm.direction || null,
        contact_name: specForm.contact_name,
        contact_phone: specForm.contact_phone,
        amenities: specForm.amenities.length ? specForm.amenities : null,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
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
      if (editId && adminMode) await adminUpdatePendingUserListing(editId, payload);
      else if (editId) await updateMyListing(editId, payload);
      else await submitUserListing(payload);
    },
    onSuccess: () => {
      if (user) clearListingDraft(user.id, editId);
      if (adminMode) onAdminSaved?.();
      else setSubmitted(true);
    },
    onError: (err) => setErrors({ submit: extractErrorMessage(err, editId ? 'Không lưu được tin' : 'Không gửi được tin') }),
  });
  const submitting = submitMutation.isPending;

  const handleSubmit = () => {
    const allErrors = validateListingForm(form, { includeQualityGate: true });
    if (form.contact_phone.trim() && !isValidVnPhone(form.contact_phone)) {
      allErrors.contact_phone = 'Số điện thoại chưa hợp lệ (VD: 0901234567)';
    }
    Object.assign(allErrors, validateLocation());
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      const firstField = Object.keys(allErrors)[0];
      const firstStep = firstField === 'title' || firstField === 'property_type_id' || firstField === 'price' || firstField === 'price_per_month' || firstField === 'loan_support'
        ? 0
        : firstField === 'city' || firstField === 'area_sqm' || firstField === 'bedrooms' || firstField === 'bathrooms' || firstField === 'latitude' || firstField === 'longitude' || firstField === 'district_id' || firstField === 'ward_id' || firstField === 'map_location'
          ? 1
          : firstField === 'images' || firstField === 'description' ? 2 : 3;
      setStep(firstStep);
      window.setTimeout(() => document.getElementById(firstField)?.focus(), 0);
      return;
    }
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
          <p className="mt-3 text-center text-xs font-semibold text-red-600 sm:hidden" aria-current="step">Bước {step + 1}/{STEPS.length} · {STEPS[step]}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {draftCandidate && (
          <div role="status" className="mb-4 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
            <span>Có bản nháp được lưu từ {new Date(draftCandidate.savedAt).toLocaleString('vi-VN')}. Bạn có muốn khôi phục không?</span>
            <div className="flex gap-2">
              <button type="button" onClick={restoreDraft} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Khôi phục</button>
              <button type="button" onClick={discardDraft} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700">Bỏ bản nháp</button>
            </div>
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

          {/* Step 0: Listing type, basic info, price */}
          {step === 0 && (
            <div className="space-y-5">
              <SectionLabel icon={<Home className="w-4 h-4 text-red-500" />} label="Loại tin & Thông tin cơ bản" />

              {/* Listing type selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Loại tin đăng *</label>
                <div className="grid max-w-xl grid-cols-2 gap-2">
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

              <FormField label="Tiêu đề tin đăng *" error={errors.title} id="title">
                <input id="title" value={form.title} onChange={e => { set('title', e.target.value); setTitleCorrection(''); }}
                  onBlur={normalizeTitleInput}
                  spellCheck
                  autoCapitalize="sentences"
                  maxLength={LISTING_TITLE_MAX}
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={errors.title ? 'title-error' : undefined}
                  placeholder={isRental(form.listing_type)
                    ? 'VD: Cho thuê nhà nguyên căn 3PN tại Dĩ An, 8 triệu/tháng'
                    : 'VD: Bán đất nền khu dân cư Hiệp Thành 3, Thủ Dầu Một, 120m²'}
                  className={inputCls(errors.title)} />
                <p className="mt-1 text-right text-[11px] text-gray-400">{[...form.title].length}/{LISTING_TITLE_MAX}</p>
                {titleCorrection && <p role="status" aria-live="polite" className="mt-1.5 text-xs font-medium text-emerald-600">{titleCorrection}</p>}
              </FormField>

              <section className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-gray-800">Giá bất động sản</h3>
                    <p className="mt-0.5 text-xs text-gray-500">Nhập số tiền thật, hệ thống sẽ tự hiển thị đúng đơn vị.</p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-red-600 ring-1 ring-red-100">Bắt buộc</span>
                </div>
                <FormField label={isRental(form.listing_type) ? 'Giá thuê mỗi tháng *' : 'Giá bán *'} error={isRental(form.listing_type) ? errors.price_per_month : errors.price}>
                  <PriceField
                    mode={isRental(form.listing_type) ? 'rent' : 'sale'}
                    value={isRental(form.listing_type) ? form.price_per_month : form.price}
                    unit={form.price_unit}
                    onChange={value => set(isRental(form.listing_type) ? 'price_per_month' : 'price', value)}
                    onUnitChange={unit => set('price_unit', unit)}
                    error={isRental(form.listing_type) ? errors.price_per_month : errors.price}
                  />
                </FormField>
                {!isRental(form.listing_type) && (
                  <div className="mt-4 rounded-xl border border-white bg-white/80 p-3">
                    <label className="mb-1 block text-xs font-semibold text-gray-700">Chủ hỗ trợ vay ngân hàng ({form.price_unit}, tùy chọn)</label>
                    <input type="text" inputMode="decimal" value={form.loan_support} onChange={e => set('loan_support', formatPriceInput(e.target.value))}
                      placeholder="Ví dụ: 1,500" className={inputCls(errors.loan_support)} />
                    {errors.loan_support && <p className="mt-1 text-xs font-medium text-red-600">{errors.loan_support}</p>}
                    {(() => {
                      const price = parsePriceInput(form.price);
                      const loan = parsePriceInput(form.loan_support);
                      return price && loan && loan > 0 && loan < price ? (
                        <p className="mt-1 text-xs font-medium text-emerald-600">
                          Khách trả trước: {formatFinancingAmount(subtractListingPriceValues(price, loan), form.price_unit)} · Hỗ trợ vay: {formatFinancingAmount(loan, form.price_unit)}
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Step 1: Location & dimensions */}
          {step === 1 && (
            <div className="space-y-4">
              <SectionLabel icon={<MapPin className="w-4 h-4 text-red-500" />} label="Vị trí & Diện tích" />
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Tỉnh/Thành phố *" error={errors.city} id="city">
                  <select id="city" value={form.area_id} onChange={e => {
                    const area = areas.find(a => a.id === e.target.value);
                    setArea(e.target.value, area?.name ?? '');
                  }} className={selectCls(errors.city)}>
                    <option value="">-- Chọn tỉnh/thành --</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Quận/Huyện *" error={errors.district_id} id="district_id">
                  {!form.area_id ? (
                    <select id="district_id" disabled value="" className={selectCls(errors.district_id)}><option value="">-- Chọn tỉnh trước --</option></select>
                  ) : loadingDistricts ? (
                    <select id="district_id" disabled value="" className={selectCls(errors.district_id)}><option value="">Đang tải quận/huyện...</option></select>
                  ) : districts.length > 0 ? (
                    <select id="district_id" value={selectedDistrictId ?? ''} onChange={e => setDistrict(e.target.value)} aria-invalid={Boolean(errors.district_id)} aria-describedby={errors.district_id ? 'district_id-error' : undefined} className={selectCls(errors.district_id)}>
                      <option value="">-- Chọn quận/huyện --</option>
                      {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  ) : (
                    <select id="district_id" disabled value="" className={selectCls(errors.district_id)}><option value="">Chưa có taxonomy quận/huyện</option></select>
                  )}
                </FormField>
                <FormField label="Phường/Xã *" error={errors.ward_id} id="ward_id">
                  {!selectedDistrictId ? (
                    <select id="ward_id" disabled value="" className={selectCls(errors.ward_id)}><option value="">-- Chọn quận/huyện trước --</option></select>
                  ) : loadingWards ? (
                    <select id="ward_id" disabled value="" className={selectCls(errors.ward_id)}><option value="">Đang tải phường/xã...</option></select>
                  ) : wards.length > 0 ? (
                    <select
                      id="ward_id"
                      value={selectedWardId ?? ''}
                      onChange={e => setWard(e.target.value)}
                      aria-invalid={Boolean(errors.ward_id)}
                      aria-describedby={errors.ward_id ? 'ward_id-error' : undefined}
                      className={selectCls(errors.ward_id)}
                    >
                      <option value="">-- Chọn phường/xã --</option>
                      {wards.map(ward => <option key={ward.id} value={ward.id}>{ward.name}</option>)}
                    </select>
                  ) : (
                    <select id="ward_id" disabled value="" className={selectCls(errors.ward_id)}><option value="">Chưa có taxonomy phường/xã</option></select>
                  )}
                </FormField>
                {neighborhoods.length > 0 && (
                  <FormField label="Khu dân cư (tùy chọn)">
                    <select value={form.neighborhood_slug} onChange={e => set('neighborhood_slug', e.target.value)} className={selectCls()}>
                      <option value="">-- Chọn khu dân cư --</option>
                      {neighborhoods.map(n => <option key={n.id} value={n.slug}>{n.name}</option>)}
                    </select>
                  </FormField>
                )}
              </div>
              <FormField label="Địa chỉ chi tiết">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input value={form.address} onChange={e => { addressEditedRef.current = true; set('address', e.target.value); }}
                    placeholder="Số nhà, tên đường..." className={`flex-1 ${inputCls()}`} />
                  <button type="button"
                    onClick={() => flyTo([form.address, form.ward, form.district, form.city].filter(Boolean).join(', '), 16, 'address', undefined, undefined, undefined, {
                      level: form.ward ? 'ward' : form.district ? 'district' : 'area',
                      areaName: form.city,
                      districtName: form.district || undefined,
                      wardName: form.ward || undefined,
                    })}
                    disabled={!form.address.trim() || !selectedWardId}
                    className="flex w-full flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:py-0">
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
                  resetNonce={mapResetNonce}
                  wardId={selectedWardId}
                  wardGeo={selectedWardGeo}
                  wardLabel={form.ward || 'xã/phường đã chọn'}
                  onChange={setCoords}
                  onReverseGeocode={addr => { if (!addressEditedRef.current) set('address', addr); }}
                />
                {errors.map_location && <p id="map_location" tabIndex={-1} role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{errors.map_location}</p>}
                <p className="text-gray-400 text-xs mt-1.5 flex items-start gap-1.5">
                  <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  Chọn đủ Tỉnh/Huyện/Xã để tải polygon chuẩn. Điểm tìm kiếm lệch khu vực sẽ bị khóa; chỉ ghim nằm trong polygon của đúng xã/phường mới được chuyển sang màu đỏ và lưu. Xã chưa có polygon vẫn có thể dùng địa chỉ chi tiết nhưng không lưu tọa độ ước lượng.
                </p>
              </div>

              <details className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-gray-600">Tùy chọn nâng cao: nhập tọa độ thủ công</summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <FormField label="Vĩ độ (Latitude)" id="latitude">
                    <input id="latitude" type="number" step="any" value={form.latitude} onChange={e => set('latitude', e.target.value)}
                      aria-invalid={Boolean(errors.latitude)} aria-describedby={errors.latitude ? 'latitude-error' : undefined}
                      placeholder="Tự động từ bản đồ" className={inputCls(errors.latitude)} />
                    {errors.latitude && <p id="latitude-error" className="mt-1 text-xs text-red-600">{errors.latitude}</p>}
                  </FormField>
                  <FormField label="Kinh độ (Longitude)" id="longitude">
                    <input id="longitude" type="number" step="any" value={form.longitude} onChange={e => set('longitude', e.target.value)}
                      aria-invalid={Boolean(errors.longitude)} aria-describedby={errors.longitude ? 'longitude-error' : undefined}
                      placeholder="Tự động từ bản đồ" className={inputCls(errors.longitude)} />
                    {errors.longitude && <p id="longitude-error" className="mt-1 text-xs text-red-600">{errors.longitude}</p>}
                  </FormField>
                </div>
              </details>
              <div className="grid sm:grid-cols-3 gap-4">
                {(['area_sqm', 'bedrooms', 'bathrooms'] as const).filter(field => showSpec(field)).map(field => (
                  <FormField key={field} label={SPEC_LABELS[field]} error={errors[field]} id={field}>
                    <input id={field} type="number" min={field === 'area_sqm' ? '0.01' : '0'} step={field === 'area_sqm' ? 'any' : '1'} value={String(form[field] ?? '')} onChange={e => set(field, e.target.value)}
                      aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `${field}-error` : undefined}
                      placeholder={SPEC_PLACEHOLDERS[field]} className={inputCls(errors[field])} />
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
                  Ảnh bất động sản <span className="font-normal text-gray-400">({countListingImages(form)}/10 ảnh · bắt buộc ít nhất 1)</span>
                </label>
                <ImageUpload
                  images={form.images}
                  onChange={imgs => setForm(f => ({ ...f, images: imgs, image_url: imgs[0] ?? '' }))}
                  maxImages={10}
                  folder={adminMode && editId ? `listing-review/${editId}` : 'user-listings'}
                  isAdmin={adminMode}
                />
                {errors.images && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{errors.images}</p>}
              </div>

              {form.images.length === 0 && (
                <FormField label="Hoặc dán link ảnh đại diện">
                  <ImageUrlInput
                    value={form.image_url}
                    onChange={url => set('image_url', url)}
                    placeholder="https://..."
                    folder={adminMode && editId ? `listing-review/${editId}` : 'user-listings'}
                    isAdmin={adminMode}
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
                price={isRental(form.listing_type)
                  ? formatListingPrice(parsePriceInput(form.price_per_month), 'triệu/tháng')
                  : formatListingPrice(parsePriceInput(form.price), form.price_unit)}
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

              <FormField label="Mô tả chi tiết" error={errors.description} id="description">
                <RichTextEditor value={form.description} onChange={html => set('description', html)} enableImage={false}
                  placeholder={isRental(form.listing_type)
                    ? 'Mô tả vị trí, nội thất, tiện ích xung quanh, yêu cầu thuê. Dùng thanh công cụ để in đậm, tiêu đề, danh sách, chèn bảng...'
                    : 'Mô tả vị trí, đặc điểm, tiện ích xung quanh, lý do bán. Dùng thanh công cụ để in đậm, tiêu đề, danh sách, chèn bảng...'} />
                <p className={`mt-1 text-xs ${errors.description ? 'text-red-600' : 'text-gray-400'}`}>Nội dung: {plainTextDescription(form.description).length}/{DESCRIPTION_MIN} ký tự tối thiểu</p>
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
                  <FormField label="Họ và tên *" error={errors.contact_name} id="contact_name">
                    <input id="contact_name" value={form.contact_name} onChange={e => set('contact_name', e.target.value)}
                      aria-invalid={Boolean(errors.contact_name)} aria-describedby={errors.contact_name ? 'contact_name-error' : undefined}
                      placeholder="Nguyễn Văn A" className={inputCls(errors.contact_name)} />
                  </FormField>
                  <FormField label="Số điện thoại *" error={errors.contact_phone} id="contact_phone">
                    <input id="contact_phone" type="tel" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)}
                      aria-invalid={Boolean(errors.contact_phone)} aria-describedby={errors.contact_phone ? 'contact_phone-error' : undefined}
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
                      ? formatListingPrice(parsePriceInput(form.price_per_month), 'triệu/tháng')
                      : formatListingPrice(parsePriceInput(form.price), form.price_unit)
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
              <SectionLabel icon={<Search className="w-4 h-4 text-red-500" />} label="Thông tin nâng cao (không bắt buộc)" />

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 flex gap-2.5">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-blue-800 text-xs leading-relaxed">
                  Hệ thống đã tự điền nội dung SEO từ tin đăng. Bạn có thể bấm <strong>Tiếp theo</strong> ngay; chỉ chỉnh các trường này nếu bạn biết rõ SEO.
                </p>
              </div>

              <FormField label="Tiêu đề SEO (tối đa 60 ký tự)">
                <input
                  value={seo.metaTitle}
                  onChange={e => seo.setMetaTitle(e.target.value)}
                  maxLength={60}
                  placeholder="Tự động lấy từ tiêu đề tin..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </FormField>

              <FormField label="Meta Description (tối đa 155 ký tự)">
                <textarea
                  value={seo.metaDescription}
                  onChange={e => seo.setMetaDescription(e.target.value)}
                  maxLength={155}
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

              <FormField label="Slug mô tả URL">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 flex-shrink-0">…/</span>
                  <input
                    value={generateSlug(form.title)}
                    readOnly
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600"
                  />
                </div>
                <p className="text-gray-400 text-xs mt-1">URL chuẩn được tạo sau khi đăng: giao dịch/khu vực/quận-huyện/slug-pr{`{mã}`}.</p>
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

          {Object.keys(errors).some(key => key !== 'submit') && (
            <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-bold">Vui lòng kiểm tra {Object.keys(errors).filter(key => key !== 'submit').length} mục trước khi tiếp tục.</p>
              <button type="button" className="mt-1 text-xs font-semibold underline" onClick={() => {
                const first = Object.keys(errors).find(key => key !== 'submit');
                if (first) document.getElementById(first)?.focus();
              }}>Đi tới trường lỗi đầu tiên</button>
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
            <button type="button" disabled={step === 0} onClick={prev}
              className="flex items-center gap-2 border border-gray-200 text-gray-600 px-5 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-40">
              <ArrowLeft className="w-4 h-4" />Quay lại
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
                Tiếp theo →
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={submitting}
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
function FormField({ label, error, children, className = '', id }: { label: string; error?: string; children: React.ReactNode; className?: string; id?: string }) {
  const errorId = id ? `${id}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
      {error && <p id={errorId} role="alert" className="text-red-500 text-xs mt-1">{error}</p>}
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