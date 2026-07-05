import { supabase, type Property, type Area, type District, type PropertyType, type Testimonial, type Lead, type NewsArticle, type Project, type Profile, type UserListing, type SiteSetting, type SiteContent, type Banner, type FeaturedSection, type FeaturedSectionItem, type PropertyFavorite, type UserFavorite, type Subscriber, type PageSection, type ManagedPage, type PageBlock, type UserMedia } from './supabase';

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export async function signUp(email: string, password: string, displayName: string, phone: string) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
  if (error) throw error;
  if (data.user) {
    await supabase.from('profiles').upsert({ id: data.user.id, display_name: displayName, phone }).single();
  }
  return data;
}
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signOut() { await supabase.auth.signOut(); }
export async function getProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data as Profile | null;
}
export async function getAdminRole(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return (data as { role: string } | null)?.role === 'admin';
}
export async function updateProfile(updates: Partial<Profile>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase.from('profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', user.id);
  if (error) throw error;
}

// ─── Properties (public) ──────────────────────────────────────────────────────
export async function getAllProperties(filters?: {
  listingType?: string; areaId?: string; typeId?: string; city?: string; keyword?: string;
  district?: string;
  minPrice?: number; maxPrice?: number; minArea?: number; maxArea?: number;
  bedrooms?: string; direction?: string; legal?: string;
  isFeatured?: boolean; isHot?: boolean;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'views';
  page?: number; limit?: number;
}): Promise<{ data: Property[]; total: number }> {
  let q = supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)', { count: 'exact' })
    .eq('is_active', true);

  if (filters?.listingType && filters.listingType !== 'all') q = q.eq('listing_type', filters.listingType);
  if (filters?.areaId) q = q.eq('area_id', filters.areaId);
  if (filters?.typeId) q = q.eq('property_type_id', filters.typeId);
  if (filters?.city) q = q.eq('city', filters.city);
  if (filters?.district) q = q.eq('district', filters.district);
  if (filters?.keyword) q = q.or(`title.ilike.%${filters.keyword}%,address.ilike.%${filters.keyword}%,city.ilike.%${filters.keyword}%,district.ilike.%${filters.keyword}%`);
  if (filters?.minPrice !== undefined) q = q.gte('price', filters.minPrice);
  if (filters?.maxPrice !== undefined) q = q.lte('price', filters.maxPrice);
  if (filters?.minArea !== undefined) q = q.gte('area_sqm', filters.minArea);
  if (filters?.maxArea !== undefined) q = q.lte('area_sqm', filters.maxArea);
  if (filters?.bedrooms && filters.bedrooms !== 'all') q = q.gte('bedrooms', parseInt(filters.bedrooms));
  if (filters?.direction) q = q.eq('direction', filters.direction);
  if (filters?.legal) q = q.eq('legal_status', filters.legal);
  if (filters?.isFeatured) q = q.eq('is_featured', true);
  if (filters?.isHot) q = q.eq('is_hot', true);

  if (filters?.sort === 'price_asc') q = q.order('price', { ascending: true });
  else if (filters?.sort === 'price_desc') q = q.order('price', { ascending: false });
  else if (filters?.sort === 'views') q = q.order('views', { ascending: false });
  else q = q.order('created_at', { ascending: false });

  const limit = filters?.limit ?? 20;
  const page = filters?.page ?? 1;
  q = q.range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  return { data: (data ?? []) as Property[], total: count ?? 0 };
}

export async function getAllPropertiesForMap(filters?: { areaId?: string; typeId?: string }): Promise<Property[]> {
  let q = supabase
    .from('properties')
    .select('id, title, price, price_label, price_unit, city, district, latitude, longitude, image_url, is_featured, is_hot, area_id, property_type_id')
    .eq('is_active', true)
    .not('latitude', 'is', null);
  if (filters?.areaId) q = q.eq('area_id', filters.areaId);
  if (filters?.typeId) q = q.eq('property_type_id', filters.typeId);
  const { data } = await q.limit(200);
  return (data ?? []) as Property[];
}

export async function getFeaturedProperties(): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true).eq('is_featured', true)
    .order('created_at', { ascending: false }).limit(12);
  return (data ?? []) as Property[];
}

export async function getHotProperties(): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true).eq('is_hot', true)
    .order('views', { ascending: false }).limit(8);
  return (data ?? []) as Property[];
}

export async function getRecentProperties(limit = 8): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true)
    .order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as Property[];
}

export async function getPropertyById(id: string): Promise<Property | null> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('id', id).maybeSingle();
  if (data) await supabase.from('properties').update({ views: (data.views ?? 0) + 1 }).eq('id', id);
  return data as Property | null;
}

export async function getRelatedProperties(property: Property, limit = 6): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true).neq('id', property.id)
    .or(`area_id.eq.${property.area_id},property_type_id.eq.${property.property_type_id}`)
    .order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as Property[];
}

// ─── Properties (admin) ───────────────────────────────────────────────────────
export async function adminGetAllProperties(): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .order('created_at', { ascending: false });
  return (data ?? []) as Property[];
}

export async function createProperty(p: Omit<Property, 'id' | 'created_at' | 'updated_at' | 'views' | 'areas' | 'property_types'>): Promise<Property> {
  const { data, error } = await supabase.from('properties').insert(p).select().single();
  if (error) throw error;
  return data as Property;
}
export async function updateProperty(id: string, p: Partial<Property>): Promise<void> {
  const { error } = await supabase.from('properties').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function deleteProperty(id: string): Promise<void> {
  const { error } = await supabase.from('properties').delete().eq('id', id);
  if (error) throw error;
}

// ─── Areas ────────────────────────────────────────────────────────────────────
export async function getAreas(): Promise<Area[]> {
  const { data } = await supabase.from('areas').select('*').order('order_index');
  return data ?? [];
}

// ─── Districts ─────────────────────────────────────────────────────────────────
export async function getDistricts(areaId?: string): Promise<District[]> {
  let q = supabase.from('districts').select('*').order('order_index');
  if (areaId) q = q.eq('area_id', areaId);
  const { data } = await q;
  return (data ?? []) as District[];
}
export async function adminCreateDistrict(d: Omit<District, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('districts').insert(d);
  if (error) throw error;
}
export async function adminUpdateDistrict(id: string, d: Partial<District>): Promise<void> {
  const { error } = await supabase.from('districts').update(d).eq('id', id);
  if (error) throw error;
}
export async function adminDeleteDistrict(id: string): Promise<void> {
  const { error } = await supabase.from('districts').delete().eq('id', id);
  if (error) throw error;
}
export async function updateArea(id: string, a: Partial<Area>): Promise<void> {
  const { error } = await supabase.from('areas').update(a).eq('id', id);
  if (error) throw error;
}

// ─── Property Types ───────────────────────────────────────────────────────────
export async function getPropertyTypes(): Promise<PropertyType[]> {
  const { data } = await supabase.from('property_types').select('*').order('name');
  return data ?? [];
}

// ─── Testimonials ─────────────────────────────────────────────────────────────
export async function getTestimonials(): Promise<Testimonial[]> {
  const { data } = await supabase.from('testimonials').select('*').eq('is_active', true).order('created_at');
  return data ?? [];
}
export async function adminGetTestimonials(): Promise<Testimonial[]> {
  const { data } = await supabase.from('testimonials').select('*').order('created_at');
  return data ?? [];
}
export async function createTestimonial(t: Omit<Testimonial, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('testimonials').insert(t);
  if (error) throw error;
}
export async function updateTestimonial(id: string, t: Partial<Testimonial>): Promise<void> {
  const { error } = await supabase.from('testimonials').update(t).eq('id', id);
  if (error) throw error;
}
export async function deleteTestimonial(id: string): Promise<void> {
  const { error } = await supabase.from('testimonials').delete().eq('id', id);
  if (error) throw error;
}

// ─── Leads ────────────────────────────────────────────────────────────────────
export async function submitLead(lead: { full_name: string; phone: string; area_interest?: string; message?: string; property_id?: string; property_title?: string; budget?: string }): Promise<void> {
  const { error } = await supabase.from('leads').insert({
    full_name: lead.full_name, phone: lead.phone,
    area_interest: lead.area_interest, message: lead.message, property_id: lead.property_id,
  });
  if (error) throw error;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  fetch(`${supabaseUrl}/functions/v1/crm-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify({
      full_name: lead.full_name, phone: lead.phone,
      property_id: lead.property_id, property_title: lead.property_title,
      message: lead.message, budget: lead.budget,
    }),
  }).catch(() => {});
}
export async function getLeads(status?: string): Promise<Lead[]> {
  let q = supabase.from('leads').select('*, properties(id,title)').order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []) as Lead[];
}
export async function updateLeadStatus(id: string, status: Lead['status']): Promise<void> {
  const { error } = await supabase.from('leads').update({ status }).eq('id', id);
  if (error) throw error;
}
export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

// ─── News ─────────────────────────────────────────────────────────────────────
export async function getNews(category?: string, limit = 20): Promise<NewsArticle[]> {
  let q = supabase.from('news').select('*').eq('is_published', true).order('created_at', { ascending: false }).limit(limit);
  if (category && category !== 'Tất cả') q = q.eq('category', category);
  const { data } = await q;
  return (data ?? []) as NewsArticle[];
}
export async function getNewsById(id: string): Promise<NewsArticle | null> {
  const { data } = await supabase.from('news').select('*').eq('id', id).maybeSingle();
  if (data) await supabase.from('news').update({ views: (data.views ?? 0) + 1 }).eq('id', id);
  return data as NewsArticle | null;
}
export async function adminGetAllNews(): Promise<NewsArticle[]> {
  const { data } = await supabase.from('news').select('*').order('created_at', { ascending: false });
  return (data ?? []) as NewsArticle[];
}
export async function createNews(n: Omit<NewsArticle, 'id' | 'created_at' | 'updated_at' | 'views'>): Promise<void> {
  const { error } = await supabase.from('news').insert(n);
  if (error) throw error;
}
export async function updateNews(id: string, n: Partial<NewsArticle>): Promise<void> {
  const { error } = await supabase.from('news').update({ ...n, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function deleteNews(id: string): Promise<void> {
  const { error } = await supabase.from('news').delete().eq('id', id);
  if (error) throw error;
}

// ─── Projects ─────────────────────────────────────────────────────────────────
export async function getProjects(filters?: { areaId?: string; phase?: string }): Promise<Project[]> {
  let q = supabase.from('projects').select('*, areas(id,name,slug)').eq('is_active', true).order('created_at', { ascending: false });
  if (filters?.areaId) q = q.eq('area_id', filters.areaId);
  if (filters?.phase && filters.phase !== 'Tất cả') q = q.eq('phase', filters.phase);
  const { data } = await q;
  return (data ?? []) as Project[];
}
export async function adminGetAllProjects(): Promise<Project[]> {
  const { data } = await supabase.from('projects').select('*, areas(id,name,slug)').order('created_at', { ascending: false });
  return (data ?? []) as Project[];
}
export async function createProject(p: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'areas'>): Promise<void> {
  const { error } = await supabase.from('projects').insert(p);
  if (error) throw error;
}
export async function updateProject(id: string, p: Partial<Project>): Promise<void> {
  const { error } = await supabase.from('projects').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

// ─── User Listings ────────────────────────────────────────────────────────────
export async function submitUserListing(listing: Omit<UserListing, 'id' | 'user_id' | 'status' | 'reject_reason' | 'created_at' | 'updated_at' | 'areas' | 'property_types' | 'profiles'>): Promise<void> {
  const { error } = await supabase.from('user_listings').insert(listing);
  if (error) throw error;
}
export async function getMyListings(): Promise<UserListing[]> {
  const { data } = await supabase
    .from('user_listings')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .order('created_at', { ascending: false });
  return (data ?? []) as UserListing[];
}
export async function deleteMyListing(id: string): Promise<void> {
  const { error } = await supabase.from('user_listings').delete().eq('id', id);
  if (error) throw error;
}
export async function adminGetUserListings(status?: string): Promise<UserListing[]> {
  let q = supabase
    .from('user_listings')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []) as UserListing[];
}
export async function approveUserListing(id: string): Promise<void> {
  const { data: listing, error: fetchErr } = await supabase.from('user_listings').select('*').eq('id', id).single();
  if (fetchErr || !listing) throw new Error('Listing not found');
  const { data: inserted, error: propErr } = await supabase.from('properties').insert({
    title: listing.title, description: listing.description,
    price: listing.price, price_unit: listing.price_unit, price_label: listing.price_label,
    listing_type: listing.listing_type ?? 'mua_ban',
    area_sqm: listing.area_sqm, address: listing.address, city: listing.city, district: listing.district,
    area_id: listing.area_id, property_type_id: listing.property_type_id,
    image_url: listing.image_url, images: listing.images, legal_status: listing.legal_status,
    bedrooms: listing.bedrooms, bathrooms: listing.bathrooms, direction: listing.direction,
    contact_name: listing.contact_name, contact_phone: listing.contact_phone,
    amenities: listing.amenities, is_active: true, is_featured: false, is_hot: false,
    latitude: listing.latitude, longitude: listing.longitude,
    vr_tour_url: listing.vr_tour_url, video_url: listing.video_url,
    formatted_address: listing.formatted_address, contact_zalo: listing.contact_zalo,
  }).select('id').single();
  if (propErr) throw propErr;
  await supabase.from('user_listings').update({ status: 'approved' }).eq('id', id);

  // Fire-and-forget AI auto-tagging
  if (inserted?.id) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    fetch(`${supabaseUrl}/functions/v1/ai-autotag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({
        propertyId: inserted.id,
        title: listing.title,
        description: listing.description,
        city: listing.city,
        district: listing.district,
        listingType: listing.listing_type,
        price: listing.price,
        priceUnit: listing.price_unit,
        areaSqm: listing.area_sqm,
      }),
    }).catch(() => {});
  }
}
export async function rejectUserListing(id: string, reason: string): Promise<void> {
  const { error } = await supabase.from('user_listings').update({ status: 'rejected', reject_reason: reason }).eq('id', id);
  if (error) throw error;
}

// ─── CMS: Site Settings ───────────────────────────────────────────────────────
export async function getSiteSettings(): Promise<Record<string, string>> {
  const { data } = await supabase.from('site_settings').select('key, value').order('group_name');
  const map: Record<string, string> = {};
  (data ?? []).forEach((row: { key: string; value: string | null }) => { map[row.key] = row.value ?? ''; });
  return map;
}
export async function adminGetAllSiteSettings(): Promise<SiteSetting[]> {
  const { data } = await supabase.from('site_settings').select('*').order('group_name, key');
  return (data ?? []) as SiteSetting[];
}
export async function updateSiteSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase.from('site_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
  if (error) throw error;
}

// ─── CMS: Site Content ────────────────────────────────────────────────────────
export async function getSiteContentBySection(section: string): Promise<Record<string, string>> {
  const { data } = await supabase.from('site_content').select('key, value').eq('section', section).order('order_index');
  const map: Record<string, string> = {};
  (data ?? []).forEach((row: { key: string; value: string | null }) => { map[row.key] = row.value ?? ''; });
  return map;
}
export async function getAllSiteContent(): Promise<Record<string, Record<string, string>>> {
  const { data } = await supabase.from('site_content').select('section, key, value').order('section, order_index');
  const map: Record<string, Record<string, string>> = {};
  (data ?? []).forEach((row: { section: string; key: string; value: string | null }) => {
    if (!map[row.section]) map[row.section] = {};
    map[row.section][row.key] = row.value ?? '';
  });
  return map;
}
export async function adminGetAllSiteContent(): Promise<SiteContent[]> {
  const { data } = await supabase.from('site_content').select('*').order('section, order_index');
  return (data ?? []) as SiteContent[];
}
export async function updateSiteContent(id: string, value: string): Promise<void> {
  const { error } = await supabase.from('site_content').update({ value, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// ─── CMS: Banners ─────────────────────────────────────────────────────────────
export async function getBanners(position: Banner['position']): Promise<Banner[]> {
  const { data } = await supabase.from('banners').select('*').eq('position', position).eq('is_active', true).order('order_index');
  return (data ?? []) as Banner[];
}
export async function trackBannerImpression(id: string): Promise<void> {
  supabase.rpc('increment_counter', { table_name: 'banners', row_id: id, column_name: 'impressions' }).then(undefined, () => {
    supabase.from('banners').select('impressions').eq('id', id).single()
      .then(({ data }) => supabase.from('banners').update({ impressions: (data?.impressions ?? 0) + 1 }).eq('id', id))
      .then(undefined, () => {});
  });
}
export async function trackBannerClick(id: string): Promise<void> {
  supabase.rpc('increment_counter', { table_name: 'banners', row_id: id, column_name: 'clicks' }).then(undefined, () => {
    supabase.from('banners').select('clicks').eq('id', id).single()
      .then(({ data }) => supabase.from('banners').update({ clicks: (data?.clicks ?? 0) + 1 }).eq('id', id))
      .then(undefined, () => {});
  });
}
export async function adminGetAllBanners(): Promise<Banner[]> {
  const { data } = await supabase.from('banners').select('*').order('position, order_index');
  return (data ?? []) as Banner[];
}
export async function createBanner(b: Omit<Banner, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('banners').insert(b);
  if (error) throw error;
}
export async function updateBanner(id: string, b: Partial<Banner>): Promise<void> {
  const { error } = await supabase.from('banners').update({ ...b, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function deleteBanner(id: string): Promise<void> {
  const { error } = await supabase.from('banners').delete().eq('id', id);
  if (error) throw error;
}

// ─── Image Upload ─────────────────────────────────────────────────────────────
// Đọc cấu hình dung lượng file tối đa từ site_settings
export async function getMaxFileSize(): Promise<number> {
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'max_file_size').maybeSingle();
  const maxSize = parseInt((data?.value as string) ?? '3'); // Mặc định 3MB
  return maxSize;
}

// Upload ảnh với bucket phân tách: admin-uploads hoặc user-uploads
export async function uploadImage(file: File, folder = 'properties', isAdmin = false): Promise<string> {
  // Kiểm tra dung lượng file
  const maxSize = await getMaxFileSize();
  const maxSizeBytes = maxSize * 1024 * 1024; // Chuyển MB sang bytes
  if (file.size > maxSizeBytes) {
    throw new Error(`File vượt quá dung lượng cho phép (${maxSize}MB). Vui lòng chọn file nhỏ hơn.`);
  }

  // Chọn bucket phù hợp
  const bucketName = isAdmin ? 'admin-uploads' : 'user-uploads';
  
  // Tạo tên file duy nhất
  const ext = file.name.split('.').pop();
  const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  
  const { error } = await supabase.storage.from(bucketName).upload(filename, file, { upsert: true });
  if (error) throw error;
  
  const { data } = supabase.storage.from(bucketName).getPublicUrl(filename);
  const publicUrl = data.publicUrl;

  // Ghi metadata vào user_media để hỗ trợ thư viện ảnh
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('user_media').insert({
        user_id: user.id,
        url: publicUrl,
        filename: file.name,
        folder,
        mime_type: file.type || 'image/jpeg',
        size_bytes: file.size,
      });
    }
  } catch { /* silent — không chặn upload nếu metadata fail */ }

  return publicUrl;
}

// Upload nhiều ảnh
export async function uploadImages(files: File[], folder = 'properties', isAdmin = false): Promise<string[]> {
  const maxSize = await getMaxFileSize();
  const maxSizeBytes = maxSize * 1024 * 1024;
  
  for (const file of files) {
    if (file.size > maxSizeBytes) {
      throw new Error(`File "${file.name}" vượt quá dung lượng cho phép (${maxSize}MB).`);
    }
  }
  
  const bucketName = isAdmin ? 'admin-uploads' : 'user-uploads';
  const urls: string[] = [];
  const { data: { user } } = await supabase.auth.getUser();
  
  for (const file of files) {
    const ext = file.name.split('.').pop();
    const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(bucketName).upload(filename, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from(bucketName).getPublicUrl(filename);
    const publicUrl = data.publicUrl;
    urls.push(publicUrl);

    // Ghi metadata vào user_media
    try {
      if (user) {
        await supabase.from('user_media').insert({
          user_id: user.id,
          url: publicUrl,
          filename: file.name,
          folder,
          mime_type: file.type || 'image/jpeg',
          size_bytes: file.size,
        });
      }
    } catch { /* silent */ }
  }
  
  return urls;
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────
export async function getDashboardStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  const [propRes, leadsRes, newLeadsRes, viewsRes, pendingRes,
    monthLeads, lastMonthLeads, rentProps, saleProps,
    monthProps, newsTotalRes] = await Promise.all([
    supabase.from('properties').select('id, is_active, is_featured, is_hot, listing_type', { count: 'exact' }),
    supabase.from('leads').select('id', { count: 'exact' }),
    supabase.from('leads').select('id', { count: 'exact' }).eq('status', 'new'),
    supabase.from('properties').select('views').eq('is_active', true),
    supabase.from('user_listings').select('id', { count: 'exact' }).eq('status', 'pending'),
    supabase.from('leads').select('id', { count: 'exact' }).gte('created_at', startOfMonth),
    supabase.from('leads').select('id', { count: 'exact' }).gte('created_at', startOfLastMonth).lte('created_at', endOfLastMonth),
    supabase.from('properties').select('id', { count: 'exact' }).eq('is_active', true).eq('listing_type', 'cho_thue'),
    supabase.from('properties').select('id', { count: 'exact' }).eq('is_active', true).eq('listing_type', 'mua_ban'),
    supabase.from('properties').select('id', { count: 'exact' }).gte('created_at', startOfMonth),
    supabase.from('news').select('id', { count: 'exact' }).eq('is_published', true),
  ]);

  const totalViews = (viewsRes.data ?? []).reduce((s, r) => s + (r.views ?? 0), 0);
  const allProps = propRes.data ?? [];
  const leadGrowth = lastMonthLeads.count && lastMonthLeads.count > 0
    ? Math.round(((monthLeads.count ?? 0) - lastMonthLeads.count) / lastMonthLeads.count * 100)
    : 0;

  return {
    totalProperties: propRes.count ?? 0,
    activeProperties: allProps.filter(p => p.is_active).length,
    featuredProperties: allProps.filter(p => p.is_featured).length,
    hotProperties: allProps.filter(p => p.is_hot).length,
    saleProperties: saleProps.count ?? 0,
    rentProperties: rentProps.count ?? 0,
    totalLeads: leadsRes.count ?? 0,
    newLeads: newLeadsRes.count ?? 0,
    pendingListings: pendingRes.count ?? 0,
    totalViews,
    monthLeads: monthLeads.count ?? 0,
    lastMonthLeads: lastMonthLeads.count ?? 0,
    leadGrowth,
    monthProperties: monthProps.count ?? 0,
    totalNews: newsTotalRes.count ?? 0,
  };
}

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;

// ─── AI Description ──────────────────────────────────────────────────────────
export async function generateAIDescription(params: { keywords: string; listingType?: string; area?: string; price?: string }): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-description`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`AI request failed (${response.status})`);
  const data = await response.json() as { description?: string; error?: string };
  if (!data.description) throw new Error(data.error ?? 'No description returned');
  return data.description;
}

// ─── AI SEO Analysis ──────────────────────────────────────────────────────────
export interface SeoAnalysisResult {
  score: number;
  suggestions: string[];
  keywordDensity: Record<string, number>;
}

export async function analyzeSeo(params: {
  title: string;
  description: string;
  imageUrl?: string;
  areaName?: string;
  price?: string;
}): Promise<SeoAnalysisResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-analytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify({
      action: 'analyze-seo',
      ...params,
    }),
  });
  
  if (!response.ok) throw new Error(`AI SEO Analysis failed (${response.status})`);
  const data = await response.json() as { 
    analysis?: string; 
    score?: number; 
    suggestions?: string[];
    error?: string;
  };
  
  // Tính điểm SEO cơ bản nếu AI không trả về
  let score = data.score ?? 0;
  const suggestions: string[] = data.suggestions ?? [];
  
  // Phân tích mật độ từ khóa cơ bản
  const keywordDensity: Record<string, number> = {};
  const words = (params.title + ' ' + params.description).toLowerCase().split(/\s+/);
  const wordCount: Record<string, number> = {};
  words.forEach(w => { wordCount[w] = (wordCount[w] ?? 0) + 1; });
  
  const totalWords = words.length;
  Object.entries(wordCount).forEach(([word, count]) => {
    if (count > 1 && word.length > 2) {
      keywordDensity[word] = Math.round((count / totalWords) * 100 * 100) / 100;
    }
  });
  
  return { score, suggestions, keywordDensity };
}

// ─── Data Export ─────────────────────────────────────────────────────────────
export async function exportTableData(table: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Featured Sections (public) ───────────────────────────────────────────────
export async function getFeaturedSections(): Promise<FeaturedSection[]> {
  const { data } = await supabase
    .from('featured_sections')
    .select('*')
    .eq('is_active', true)
    .order('order_index');
  return (data ?? []) as FeaturedSection[];
}

export async function getPropertiesForSection(section: FeaturedSection): Promise<Property[]> {
  if (section.mode === 'manual') {
    const { data } = await supabase
      .from('featured_section_items')
      .select('order_index, properties(*, areas(id,name,slug), property_types(id,name,slug))')
      .eq('section_id', section.id)
      .order('order_index');
    return ((data ?? []) as unknown as FeaturedSectionItem[])
      .map(item => item.properties)
      .filter((p): p is Property => p != null);
  }

  let q = supabase
    .from('properties')
    .select('*, areas(id,name,slug), property_types(id,name,slug)')
    .eq('is_active', true);

  if (section.filter_area_id) q = q.eq('area_id', section.filter_area_id);
  if (section.filter_listing_type && section.filter_listing_type !== '') q = q.eq('listing_type', section.filter_listing_type);
  if (section.filter_property_type_id) q = q.eq('property_type_id', section.filter_property_type_id);
  if (section.filter_is_hot) q = q.eq('is_hot', true);
  if (section.filter_is_featured) q = q.eq('is_featured', true);

  if (section.auto_sort === 'price_asc') q = q.order('price', { ascending: true });
  else if (section.auto_sort === 'price_desc') q = q.order('price', { ascending: false });
  else if (section.auto_sort === 'views') q = q.order('views', { ascending: false });
  else q = q.order('created_at', { ascending: false });

  q = q.limit(section.display_count);
  const { data } = await q;
  return (data ?? []) as Property[];
}

// ─── Featured Sections (admin) ────────────────────────────────────────────────
export async function adminGetFeaturedSections(): Promise<FeaturedSection[]> {
  const { data } = await supabase.from('featured_sections').select('*').order('order_index');
  return (data ?? []) as FeaturedSection[];
}

export async function adminCreateFeaturedSection(s: Omit<FeaturedSection, 'id' | 'created_at' | 'updated_at'>): Promise<FeaturedSection> {
  const { data, error } = await supabase.from('featured_sections').insert(s).select().single();
  if (error) throw error;
  return data as FeaturedSection;
}

export async function adminUpdateFeaturedSection(id: string, s: Partial<FeaturedSection>): Promise<void> {
  const { error } = await supabase.from('featured_sections').update({ ...s, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function adminDeleteFeaturedSection(id: string): Promise<void> {
  const { error } = await supabase.from('featured_sections').delete().eq('id', id);
  if (error) throw error;
}

export async function adminGetSectionItems(sectionId: string): Promise<FeaturedSectionItem[]> {
  const { data } = await supabase
    .from('featured_section_items')
    .select('*, properties(id, title, image_url, price, price_label, price_unit, city, district)')
    .eq('section_id', sectionId)
    .order('order_index');
  return (data ?? []) as FeaturedSectionItem[];
}

export async function adminSetSectionItems(sectionId: string, propertyIds: string[]): Promise<void> {
  await supabase.from('featured_section_items').delete().eq('section_id', sectionId);
  if (propertyIds.length === 0) return;
  const items = propertyIds.map((property_id, i) => ({ section_id: sectionId, property_id, order_index: i }));
  const { error } = await supabase.from('featured_section_items').insert(items);
  if (error) throw error;
}

// ─── User Favorites (cho người dùng đăng nhập) ──────────────────────────────────
export async function getUserFavoriteIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from('user_favorites').select('property_id').eq('user_id', user.id);
  return (data ?? []).map((r: { property_id: string }) => r.property_id);
}

export async function getUserFavorites(): Promise<UserFavorite[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('user_favorites')
    .select('*, properties(*, areas(id,name,slug), property_types(id,name,slug))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  return (data ?? []) as UserFavorite[];
}

export async function toggleUserFavorite(propertyId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Bạn cần đăng nhập để lưu BĐS yêu thích');
  
  const { data: existing } = await supabase
    .from('user_favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('property_id', propertyId)
    .maybeSingle();
  
  if (existing) {
    await supabase.from('user_favorites').delete()
      .eq('user_id', user.id)
      .eq('property_id', propertyId);
    return false;
  }
  await supabase.from('user_favorites').insert({ 
    user_id: user.id, 
    property_id: propertyId 
  });
  return true;
}

// ─── Property Favorites (cho guest/session storage) ─────────────────────────────────
export async function getFavoriteIds(): Promise<string[]> {
  const { data } = await supabase.from('property_favorites').select('property_id');
  return (data ?? []).map((r: { property_id: string }) => r.property_id);
}

export async function getFavoriteProperties(): Promise<Property[]> {
  const { data } = await supabase
    .from('property_favorites')
    .select('properties(*, areas(id,name,slug), property_types(id,name,slug))')
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown as PropertyFavorite[]).map(r => r.properties).filter((p): p is Property => p != null);
}

export async function toggleFavorite(propertyId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('property_favorites').select('id').eq('property_id', propertyId).maybeSingle();
  if (existing) {
    await supabase.from('property_favorites').delete().eq('property_id', propertyId);
    return false;
  }
  await supabase.from('property_favorites').insert({ property_id: propertyId });
  return true;
}

// ─── Subscribers (Newsletter) ─────────────────────────────────────────────────
export async function subscribe(email: string, name?: string, areaInterest?: string): Promise<void> {
  const { error } = await supabase
    .from('subscribers')
    .upsert({ email: email.trim().toLowerCase(), name: name ?? null, area_interest: areaInterest ?? null, is_active: true },
      { onConflict: 'email' });
  if (error) throw error;
}

export async function adminGetSubscribers(): Promise<Subscriber[]> {
  const { data } = await supabase.from('subscribers').select('*').order('created_at', { ascending: false });
  return (data ?? []) as Subscriber[];
}

// ─── AI Analytics ─────────────────────────────────────────────────────────────
export async function callAiAnalytics(): Promise<{ analysis: string; stats: Record<string, unknown> }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-analytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
  });
  if (!response.ok) throw new Error(`AI Analytics request failed (${response.status})`);
  return response.json();
}

// ─── Managed Pages ────────────────────────────────────────────────────────────
export async function getManagedPages(): Promise<ManagedPage[]> {
  const { data } = await supabase.from('managed_pages').select('*').order('order_index', { ascending: true });
  return (data ?? []) as ManagedPage[];
}

export async function getPageBlocks(slug: string): Promise<PageBlock[]> {
  const { data } = await supabase.from('page_blocks').select('*').eq('page_slug', slug).order('order_index', { ascending: true });
  return (data ?? []) as PageBlock[];
}

export function pageBlocksToMap(blocks: PageBlock[]): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  for (const b of blocks) {
    if (!map[b.section]) map[b.section] = {};
    map[b.section][b.key] = b.value ?? '';
  }
  return map;
}

export async function adminGetAllManagedPages(): Promise<ManagedPage[]> {
  const { data } = await supabase.from('managed_pages').select('*').order('order_index', { ascending: true });
  return (data ?? []) as ManagedPage[];
}

export async function adminCreateManagedPage(page: Omit<ManagedPage, 'id' | 'created_at' | 'updated_at'>): Promise<ManagedPage> {
  const { data, error } = await supabase.from('managed_pages').insert(page).select().single();
  if (error) throw error;
  return data as ManagedPage;
}

export async function adminUpdateManagedPage(id: string, updates: Partial<ManagedPage>): Promise<void> {
  const { error } = await supabase.from('managed_pages').update(updates).eq('id', id);
  if (error) throw error;
}

export async function adminDeleteManagedPage(id: string): Promise<void> {
  const { error } = await supabase.from('managed_pages').delete().eq('id', id);
  if (error) throw error;
}

export async function adminGetPageBlocks(slug: string): Promise<PageBlock[]> {
  const { data } = await supabase.from('page_blocks').select('*').eq('page_slug', slug).order('section').order('order_index');
  return (data ?? []) as PageBlock[];
}

export async function adminSavePageBlock(block: Omit<PageBlock, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('page_blocks')
    .upsert({ ...block }, { onConflict: 'page_slug,section,key' });
  if (error) throw error;
}

export async function adminDeletePageBlock(id: string): Promise<void> {
  const { error } = await supabase.from('page_blocks').delete().eq('id', id);
  if (error) throw error;
}

export async function adminSaveAllPageBlocks(_slug: string, blocks: Omit<PageBlock, 'id' | 'created_at' | 'updated_at'>[]): Promise<void> {
  for (const b of blocks) {
    const { error } = await supabase.from('page_blocks')
      .upsert({ ...b }, { onConflict: 'page_slug,section,key' });
    if (error) throw error;
  }
}

export async function getPageLayout(): Promise<PageSection[]> {
  const { data } = await supabase.from('page_sections').select('*').order('order_index', { ascending: true });
  return (data ?? []) as PageSection[];
}

export async function adminSavePageLayout(sections: Pick<PageSection, 'id' | 'is_visible' | 'order_index' | 'settings'>[]): Promise<void> {
  for (const s of sections) {
    const { error } = await supabase.from('page_sections')
      .update({ is_visible: s.is_visible, order_index: s.order_index, settings: s.settings })
      .eq('id', s.id);
    if (error) throw error;
  }
}

// ─── User Media Library ──────────────────────────────────────────────────────
// Liệt kê ảnh user đã upload. Admin thấy tất cả, user thường chỉ thấy của mình.
export async function getUserMedia(folder?: string): Promise<UserMedia[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let q = supabase
    .from('user_media')
    .select('*')
    .order('created_at', { ascending: false });

  // Kiểm tra role: admin thấy tất cả, user chỉ thấy của mình
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = (profile as { role: string } | null)?.role === 'admin';
  if (!isAdmin) q = q.eq('user_id', user.id);
  if (folder) q = q.eq('folder', folder);

  const { data } = await q;
  return (data ?? []) as UserMedia[];
}

// Xóa ảnh khỏi storage + xóa record metadata
export async function deleteUserMedia(id: string): Promise<void> {
  const { data: media, error: fetchErr } = await supabase
    .from('user_media')
    .select('url, user_id')
    .eq('id', id)
    .single();
  if (fetchErr || !media) throw new Error('Media not found');

  // Xóa file trong storage — thử cả 2 bucket (admin-uploads, user-uploads)
  for (const bucketName of ['user-uploads', 'admin-uploads']) {
    const urlParts = (media as { url: string }).url.split('/');
    const idx = urlParts.indexOf(bucketName);
    if (idx !== -1) {
      const storagePath = urlParts.slice(idx + 1).join('/');
      if (storagePath) {
        try { await supabase.storage.from(bucketName).remove([storagePath]); } catch { /* silent */ }
      }
      break;
    }
  }

  // Xóa record trong database
  const { error } = await supabase.from('user_media').delete().eq('id', id);
  if (error) throw error;
}

// Tính dung lượng đã dùng / tổng quota (mặc định 50MB)
export async function getUserMediaUsage(): Promise<{ used: number; total: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { used: 0, total: 0 };

  const { data } = await supabase
    .from('user_media')
    .select('size_bytes')
    .eq('user_id', user.id);

  const used = (data ?? []).reduce((sum, m) => sum + (m.size_bytes ?? 0), 0);
  const total = 50 * 1024 * 1024; // 50MB mặc định
  return { used, total };
}

