import { supabase, type Property, type PropertyFavorite, type UserFavorite, type UserMedia } from '../supabase';

// ─── Image Upload ─────────────────────────────────────────────────────────────
// Chỉ cho phép ảnh raster an toàn. Chặn SVG/HTML — chúng có thể chứa <script> →
// stored XSS khi mở trực tiếp URL public. Kiểm cả MIME lẫn đuôi file.
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
]);
const ALLOWED_IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);

function assertSafeImage(file: File) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mimeOk = ALLOWED_IMAGE_MIME.has(file.type);
  const extOk = ALLOWED_IMAGE_EXT.has(ext);
  if (!mimeOk || !extOk) {
    throw new Error(`Định dạng "${file.type || ext || 'không rõ'}" không được phép. ` +
      `Chỉ chấp nhận ảnh JPG, PNG, WEBP, GIF, AVIF.`);
  }
}

// Đọc cấu hình dung lượng file tối đa từ site_settings
export async function getMaxFileSize(): Promise<number> {
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'max_file_size').maybeSingle();
  const maxSize = parseInt((data?.value as string) ?? '3'); // Mặc định 3MB
  return maxSize;
}

// Upload ảnh với bucket phân tách: admin-uploads hoặc user-uploads
export async function uploadImage(file: File, folder = 'properties', isAdmin = false): Promise<string> {
  assertSafeImage(file);
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

  // upsert:false — tên đã random nên không đụng độ; tránh ghi đè file người khác.
  const { error } = await supabase.storage.from(bucketName).upload(filename, file, { upsert: false });
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
    assertSafeImage(file);
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
    const { error } = await supabase.storage.from(bucketName).upload(filename, file, { upsert: false });
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
