import { NextRequest, NextResponse } from 'next/server';
import { adminClient, callerClient } from '@/lib/server/requireAdmin';
import { assertPanoramaUuid, inspectPanoramaBytes } from '@/lib/server/panoramaValidation';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function bearerToken(req: NextRequest): string | null {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

async function authenticate(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return { error: errorResponse('Chưa đăng nhập.', 401) } as const;
  const client = callerClient(token);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: errorResponse('Phiên đăng nhập không hợp lệ.', 401) } as const;
  return { client, user } as const;
}

function formString(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function inspectUpload(form: FormData) {
  const file = form.get('file');
  const draftId = formString(form, 'draft_id');
  if (!(file instanceof File) || !draftId) throw new Error('Thiếu file hoặc mã bản nháp.');
  assertPanoramaUuid(draftId, 'Mã bản nháp');
  if (file.size > 30 * 1024 * 1024) throw new Error('Ảnh 360 tối đa 30MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { file, draftId, bytes, inspection: inspectPanoramaBytes(bytes, file.name, file.type) };
}

async function signedRow(client: SupabaseClient, row: Record<string, unknown>) {
  const { data: signed } = await client.storage.from('property-360').createSignedUrl(String(row.storage_path), 600);
  return { ...row, preview_url: signed?.signedUrl };
}

function storageClientOrError() {
  const client = adminClient();
  return client ? { client } as const : { error: errorResponse('Máy chủ chưa cấu hình lưu trữ ảnh 360.', 503) } as const;
}

async function isAdmin(client: ReturnType<typeof callerClient>): Promise<boolean> {
  const { data } = await client.rpc('is_admin');
  return data === true;
}

async function canEditAttachedPanorama(
  client: ReturnType<typeof callerClient>,
  userId: string,
  row: { user_listing_id: string | null },
): Promise<boolean> {
  if (!row.user_listing_id) return true;
  const { data: listing, error } = await client
    .from('user_listings')
    .select('user_id,status')
    .eq('id', row.user_listing_id)
    .maybeSingle();
  return !error && listing?.user_id === userId && ['pending', 'rejected', 'expired'].includes(listing.status);
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if ('error' in auth) return auth.error;
  let upload: Awaited<ReturnType<typeof inspectUpload>>;
  let form: FormData;
  try {
    form = await req.formData();
    upload = await inspectUpload(form);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'File ảnh 360 không hợp lệ.');
  }

  const storage = storageClientOrError();
  if ('error' in storage) return storage.error;
  const storagePath = `user-listings/${auth.user.id}/${upload.draftId}/${crypto.randomUUID()}.${upload.inspection.format === 'jpeg' ? 'jpg' : 'webp'}`;
  const body = new Blob([upload.bytes], { type: upload.inspection.mime_type });
  const { error: uploadError } = await storage.client.storage.from('property-360').upload(storagePath, body, {
    upsert: false,
    contentType: upload.inspection.mime_type,
    cacheControl: '31536000',
  });
  if (uploadError) return errorResponse(uploadError.message, 400);

  const label = (formString(form, 'label') ?? '').replace(/\s+/g, ' ').slice(0, 120);
  const { data: row, error: insertError } = await storage.client
    .from('user_listing_panoramas')
    .insert({
      owner_user_id: auth.user.id,
      draft_id: upload.draftId,
      storage_path: storagePath,
      original_filename: upload.file.name.slice(0, 255),
      mime_type: upload.inspection.mime_type,
      size_bytes: upload.inspection.size_bytes,
      width: upload.inspection.width,
      height: upload.inspection.height,
      label,
    })
    .select('*')
    .single();
  if (insertError || !row) {
    await storage.client.storage.from('property-360').remove([storagePath]);
    return errorResponse(insertError?.message ?? 'Không thể lưu thông tin ảnh 360.', 400);
  }
  return NextResponse.json(await signedRow(storage.client, row as Record<string, unknown>));
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticate(req);
  if ('error' in auth) return auth.error;
  const form = await req.formData();
  const id = formString(form, 'id');
  if (!id) return errorResponse('Thiếu mã ảnh 360.');
  try {
    assertPanoramaUuid(id, 'Mã ảnh 360');
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Mã ảnh 360 không hợp lệ.');
  }

  const { data: existing, error: readError } = await auth.client
    .from('user_listing_panoramas')
    .select('*')
    .eq('id', id)
    .single();
  if (readError || !existing) return errorResponse('Không tìm thấy ảnh 360.', 404);

  const isCallerAdmin = await isAdmin(auth.client);
  if (!isCallerAdmin && (existing.owner_user_id !== auth.user.id
    || !(await canEditAttachedPanorama(auth.client, auth.user.id, existing)))) {
    return errorResponse('Tin đăng hiện không thể chỉnh sửa ảnh 360.', 403);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    const label = form.has('label') ? (formString(form, 'label') ?? '') : null;
    const sortOrderValue = formString(form, 'sort_order');
    const isActiveValue = formString(form, 'is_active');
    const sortOrder = sortOrderValue === null ? null : Number(sortOrderValue);
    const isActive = isActiveValue === null ? null : isActiveValue === 'true' ? true : isActiveValue === 'false' ? false : undefined;
    if (isActive === undefined || (sortOrder !== null && !Number.isInteger(sortOrder))) {
      return errorResponse('Thông tin cập nhật ảnh 360 không hợp lệ.');
    }
    const { data: row, error: updateError } = await auth.client.rpc('update_user_listing_panorama', {
      p_panorama_id: id,
      p_label: label,
      p_sort_order: sortOrder,
      p_is_active: isActive,
    });
    if (updateError || !row?.[0]) return errorResponse(updateError?.message ?? 'Không thể cập nhật ảnh 360.', 400);
    const storage = storageClientOrError();
    if ('error' in storage) return storage.error;
    return NextResponse.json(await signedRow(storage.client, row[0] as Record<string, unknown>));
  }

  const draftId = formString(form, 'draft_id');
  if (!draftId) return errorResponse('Thiếu mã bản nháp.');
  let upload: Awaited<ReturnType<typeof inspectUpload>>;
  try {
    upload = await inspectUpload(form);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'File ảnh 360 không hợp lệ.');
  }
  if (upload.draftId !== existing.draft_id) return errorResponse('Mã bản nháp không khớp với ảnh 360.', 403);

  const storage = storageClientOrError();
  if ('error' in storage) return storage.error;
  const storagePath = `user-listings/${existing.owner_user_id}/${upload.draftId}/${crypto.randomUUID()}.${upload.inspection.format === 'jpeg' ? 'jpg' : 'webp'}`;
  const body = new Blob([upload.bytes], { type: upload.inspection.mime_type });
  const { error: uploadError } = await storage.client.storage.from('property-360').upload(storagePath, body, {
    upsert: false,
    contentType: upload.inspection.mime_type,
    cacheControl: '31536000',
  });
  if (uploadError) return errorResponse(uploadError.message, 400);

  const { data: row, error: updateError } = await storage.client
    .from('user_listing_panoramas')
    .update({
      storage_path: storagePath,
      original_filename: upload.file.name.slice(0, 255),
      mime_type: upload.inspection.mime_type,
      size_bytes: upload.inspection.size_bytes,
      width: upload.inspection.width,
      height: upload.inspection.height,
    })
    .eq('id', id)
    .eq('owner_user_id', existing.owner_user_id)
    .select('*')
    .single();
  if (updateError || !row) {
    await storage.client.storage.from('property-360').remove([storagePath]);
    return errorResponse(updateError?.message ?? 'Không thể cập nhật ảnh 360.', 400);
  }
  const { error: removeError } = await storage.client.storage.from('property-360').remove([existing.storage_path]);
  if (removeError) return errorResponse('Đã thay ảnh nhưng chưa dọn được file cũ.', 503);
  return NextResponse.json(await signedRow(storage.client, row as Record<string, unknown>));
}
