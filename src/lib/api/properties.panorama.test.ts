import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    query,
    from: vi.fn(() => query),
    uploadPanoramaObject: vi.fn(),
    deletePanoramaObject: vi.fn(),
  };
});

vi.mock('../supabase', () => ({
  supabase: {
    from: mocks.from,
    storage: { from: vi.fn() },
  },
}));

vi.mock('./media', async importOriginal => {
  const actual = await importOriginal<typeof import('./media')>();
  return {
    ...actual,
    uploadPanoramaObject: mocks.uploadPanoramaObject,
    deletePanoramaObject: mocks.deletePanoramaObject,
  };
});

import { replacePropertyPanorama } from './properties';

describe('replacePropertyPanorama', () => {
  const propertyId = '123e4567-e89b-12d3-a456-426614174000';
  const panoramaId = '987e6543-e21b-12d3-a456-426614174000';
  const file = new File([new Uint8Array([1])], 'new-room.jpg', { type: 'image/jpeg' });
  const current = {
    id: panoramaId,
    property_id: propertyId,
    storage_path: `${propertyId}/old.jpg`,
    original_filename: 'old-room.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 100,
    width: 4000,
    height: 2000,
    label: 'Phòng khách',
    sort_order: 4,
    is_active: false,
  };
  const uploaded = {
    format: 'jpeg' as const,
    mime_type: 'image/jpeg' as const,
    size_bytes: file.size,
    width: 6000,
    height: 3000,
    storage_path: `${propertyId}/new.jpg`,
    original_filename: file.name,
  };

  beforeEach(() => {
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.update.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.single.mockReset();
    mocks.uploadPanoramaObject.mockReset();
    mocks.deletePanoramaObject.mockReset();
    mocks.from.mockClear();
    mocks.uploadPanoramaObject.mockResolvedValue(uploaded);
  });

  afterEach(() => vi.clearAllMocks());

  it('updates the existing row and preserves its identity and admin metadata', async () => {
    const updated = { ...current, ...uploaded };
    mocks.query.single
      .mockResolvedValueOnce({ data: current, error: null })
      .mockResolvedValueOnce({ data: updated, error: null });

    const result = await replacePropertyPanorama(propertyId, panoramaId, file, true);

    expect(result).toMatchObject({
      id: panoramaId,
      property_id: propertyId,
      storage_path: uploaded.storage_path,
      label: 'Phòng khách',
      sort_order: 4,
      is_active: false,
    });
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.query.update).toHaveBeenCalledWith({
      storage_path: uploaded.storage_path,
      original_filename: uploaded.original_filename,
      mime_type: uploaded.mime_type,
      size_bytes: uploaded.size_bytes,
      width: uploaded.width,
      height: uploaded.height,
    });
    expect(mocks.deletePanoramaObject).toHaveBeenCalledWith(current.storage_path);
  });

  it('removes the new object when row metadata update fails', async () => {
    mocks.query.single
      .mockResolvedValueOnce({ data: current, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('update failed') });

    await expect(replacePropertyPanorama(propertyId, panoramaId, file, true)).rejects.toThrow('update failed');
    expect(mocks.deletePanoramaObject).toHaveBeenCalledWith(uploaded.storage_path);
    expect(mocks.deletePanoramaObject).not.toHaveBeenCalledWith(current.storage_path);
  });

  it('requires admin authorization before reading or uploading anything', async () => {
    await expect(replacePropertyPanorama(propertyId, panoramaId, file, false)).rejects.toThrow('không có quyền');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.uploadPanoramaObject).not.toHaveBeenCalled();
  });
});
