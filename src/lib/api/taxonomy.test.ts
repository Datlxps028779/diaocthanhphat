import { beforeEach, describe, expect, it, vi } from 'vitest';

// Query builder giả lập tối thiểu cho bảng `areas`. Mục đích: đo đúng câu lệnh
// (select field nào, update payload gì) và điều khiển được kết quả update/readback
// để test các nhánh lỗi. Hoàn toàn cục bộ — không mạng, không Supabase thật.
type Result = { data: unknown; error: unknown };

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  // Kết quả update().eq().select('id'): data rỗng = 0 row (bị chặn/xoá).
  updateSelectResult: { data: [{ id: 'area-1' }], error: null } as Result,
  updateError: null as unknown,
  readbackError: null as unknown,
  // Khi true, readback trả về giá trị cũ (mô phỏng trigger/RLS ghi đè).
  readbackOverride: undefined as Record<string, unknown> | undefined,
  calls: {
    from: [] as string[],
    select: [] as string[],
    update: [] as unknown[],
    eq: [] as Array<[string, unknown]>,
  },
  revalidateAreaContent: vi.fn(async () => [] as string[]),
  areaRevalidationSnapshot: vi.fn((area: unknown) => area),
}));

function pickedColumns(columns: string): string[] {
  return columns.split(',').map(c => c.trim()).filter(Boolean);
}

function buildQuery(): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  let columns = '';
  let isUpdate = false;
  // eq của RIÊNG builder này — state.calls.eq là log toàn cục, không dùng để tra id.
  const localEq: Array<[string, unknown]> = [];

  const currentId = () => {
    const entry = localEq.find(([column]) => column === 'id');
    return typeof entry?.[1] === 'string' ? entry[1] : undefined;
  };

  query.select = (value: string) => {
    columns = value;
    state.calls.select.push(value);
    if (isUpdate) {
      // update().eq().select() → trả row ids để kiểm tra 0-row.
      const result = state.updateError ? { data: null, error: state.updateError } : state.updateSelectResult;
      return { then: (resolve: (v: Result) => unknown) => resolve(result) };
    }
    return query;
  };

  query.update = (payload: Record<string, unknown>) => {
    isUpdate = true;
    state.calls.update.push(payload);
    return query;
  };

  query.eq = (column: string, value: unknown) => {
    localEq.push([column, value]);
    state.calls.eq.push([column, value]);
    // Update store ở đây (không phải trong update()) vì chuỗi thật là
    // .update(payload).eq('id', id) — lúc update() chưa biết id.
    if (isUpdate) {
      const id = currentId();
      const payload = state.calls.update[state.calls.update.length - 1] as Record<string, unknown>;
      if (id && state.rows.has(id) && !state.updateError) {
        state.rows.set(id, { ...state.rows.get(id), ...payload });
      }
    }
    return query;
  };

  query.maybeSingle = async () => {
    if (isUpdate) return { data: null, error: null };
    const id = currentId();
    const row = id ? state.rows.get(id) : undefined;
    if (!row) return { data: null, error: null };
    // readbackError chỉ áp cho lần đọc LẠI sau khi ghi (select có field thay đổi),
    // không áp cho lần đọc trước/sau chỉ lấy 'id,slug'.
    const isReadback = pickedColumns(columns).some(key => key !== 'id' && key !== 'slug');
    if (state.readbackError && isReadback) return { data: row, error: state.readbackError };
    const picked: Record<string, unknown> = {};
    for (const key of pickedColumns(columns)) {
      // Dùng kiểm tra key tồn tại, không dùng `??` — override null là giá trị hợp lệ
      // (mô phỏng DB/trigger trả về rỗng) và không được rơi về row[key].
      const overridden = state.readbackOverride && key in state.readbackOverride;
      picked[key] = overridden ? state.readbackOverride?.[key] : row[key] ?? null;
    }
    return { data: picked, error: null };
  };

  // `await supabase.from('areas').select(...).eq(...)` (không maybeSingle): dùng cho
  // các test cần kết quả trực tiếp — ở đây chỉ cần trả rỗng thành công.
  query.then = (resolve: (value: Result) => unknown) => resolve({ data: [], error: null });

  return query;
}

vi.mock('../supabase', () => ({
  supabase: { from: (table: string) => { state.calls.from.push(table); return buildQuery(); } },
}));

vi.mock('./contentRevalidation', () => ({
  revalidateAreaContent: state.revalidateAreaContent,
  areaRevalidationSnapshot: state.areaRevalidationSnapshot,
}));

import { updateArea } from './taxonomy';

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = new Map([['area-1', { id: 'area-1', slug: 'binh-duong', description: null, meta_title: null, admin_note: null }]]);
  state.updateSelectResult = { data: [{ id: 'area-1' }], error: null };
  state.updateError = null;
  state.readbackError = null;
  state.readbackOverride = undefined;
  state.calls = { from: [], select: [], update: [], eq: [] };
});

describe('updateArea — patch hẹp', () => {
  it('chỉ gửi đúng field admin sửa, không gửi toàn bộ object khu vực', async () => {

    await updateArea('area-1', { description: 'Mô tả công khai mới' });

    expect(state.calls.from).toContain('areas');
    expect(state.calls.update).toHaveLength(1);
    expect(state.calls.update[0]).toEqual({ description: 'Mô tả công khai mới' });
  });

  it('loại bỏ schema_markup khỏi payload như hành vi cũ', async () => {
    // schema_markup bị Omit khỏi kiểu; ép qua unknown để mô phỏng call site cũ còn gửi field này.
    const legacyPatch = { meta_title: 'Tiêu đề', schema_markup: { '@type': 'X' } } as unknown as Parameters<typeof updateArea>[1];

    await updateArea('area-1', legacyPatch);

    expect(state.calls.update[0]).toEqual({ meta_title: 'Tiêu đề' });
  });

  it('truyền được admin_note (ghi chú công khai) như một field thường', async () => {

    await updateArea('area-1', { admin_note: 'Từ 01/07/2025, Bình Dương thuộc TP.HCM.' });

    expect(state.calls.update[0]).toEqual({ admin_note: 'Từ 01/07/2025, Bình Dương thuộc TP.HCM.' });
  });
});

describe('updateArea — không báo thành công giả', () => {
  it('payload rỗng thì không gọi update và không revalidate', async () => {

    await updateArea('area-1', {});

    expect(state.calls.update).toHaveLength(0);
    expect(state.revalidateAreaContent).not.toHaveBeenCalled();
  });

  it('update khớp 0 row thì báo lỗi rõ, không im lặng thành công', async () => {
    state.updateSelectResult = { data: [], error: null };

    await expect(updateArea('area-1', { description: 'x' })).rejects.toThrow(/không có dòng|quyền/i);
    expect(state.revalidateAreaContent).not.toHaveBeenCalled();
  });

  it('lỗi update từ DB được bọc lại nhưng giữ nguyên nguyên nhân và không revalidate', async () => {
    const dbError = new Error('permission denied');
    state.updateError = dbError;

    await expect(updateArea('area-1', { description: 'x' })).rejects.toThrow(/Không lưu được khu vực/);
    expect(state.revalidateAreaContent).not.toHaveBeenCalled();

    const failure = await updateArea('area-1', { description: 'x' }).catch((e: unknown) => e as { cause?: unknown; persisted?: boolean }) as { cause?: unknown; persisted?: boolean };
    expect((failure as { cause?: unknown })?.cause).toBe(dbError);
    expect((failure as { persisted?: boolean })?.persisted).toBe(false);
  });

  it('row không tồn tại ở read trước vẫn ghi được, nhưng readback phải xác nhận lại', async () => {
    // Row không có ở read trước → previous = null; update vẫn đi (RLS quyết định thật),
    // nhưng đọc lại không thấy row nên KHÔNG được coi là thành công.
    state.rows.clear();

    const failure = await updateArea('area-1', { description: 'x' }).catch((e: unknown) => e as Error & { persisted?: boolean }) as Error & { persisted?: boolean };
    expect(state.calls.update).toHaveLength(1);
    expect(failure?.message).toMatch(/Đã ghi/);
    expect(failure?.persisted).toBe(true);
  });
});

describe('updateArea — đọc lại để chứng minh giá trị đã lưu', () => {
  it('đọc lại chính các field vừa ghi và trả về giá trị đã lưu', async () => {
    const saved = await updateArea('area-1', { description: 'Mô tả đã lưu' });

    expect(saved).toEqual({ description: 'Mô tả đã lưu' });
    // readback phải select đúng field đã gửi, không select('*')
    expect(state.calls.select).toContain('id,slug,description');
    expect(state.calls.select).not.toContain('*');
  });

  it('trả về giá trị ĐỌC LẠI được, không phải giá trị đã gửi', async () => {
    // DB/trigger chuẩn hoá giá trị đã ghi (đây là giá trị thật trong bảng).
    state.readbackOverride = { description: 'Mô tả đã chuẩn hoá' };

    const saved = await updateArea('area-1', { description: 'Mô tả đã chuẩn hoá' });

    expect(saved).toEqual({ description: 'Mô tả đã chuẩn hoá' });
    expect(state.calls.select).toContain('id,slug,description');
  });

  it('dùng lại id/slug đọc lại để revalidate, không đọc `current` thêm lần nữa', async () => {
    await updateArea('area-1', { description: 'Mô tả đã lưu' });

    // Revalidate phải nhận snapshot current từ lần readback, không phải từ một
    // lần select('id,slug') thứ hai. Đếm số lần select 'id,slug': chỉ 1 (đọc trước).
    const idSlugSelects = state.calls.select.filter(columns => columns === 'id,slug');
    expect(idSlugSelects).toHaveLength(1);
    expect(state.revalidateAreaContent).toHaveBeenCalledTimes(1);
    const [, targets] = state.revalidateAreaContent.mock.calls[0] as unknown as [string, Array<{ previous?: { id: string; slug: string }; current?: { id: string; slug: string } }>];
    expect(targets[0]?.current).toMatchObject({ id: 'area-1', slug: 'binh-duong' });
    expect(targets[0]?.previous).toMatchObject({ id: 'area-1', slug: 'binh-duong' });
  });

  it('chuỗi chỉ có khoảng trắng gửi lên và giá trị rỗng trong DB coi là khớp', async () => {
    // sameAreaValue phải coi '   ' == null, nếu không sẽ báo lệch giả khi admin xoá nội dung.
    state.readbackOverride = { description: null };

    await expect(updateArea('area-1', { description: '   ' })).resolves.toEqual({ description: null });
  });

  it('readback lệch giá trị đã gửi thì báo lỗi thay vì nói đã lưu', async () => {
    // Mô phỏng trigger/RLS ghi đè giá trị: đọc lại thấy giá trị cũ.
    state.readbackOverride = { description: 'Giá trị cũ' };

    await expect(updateArea('area-1', { description: 'Mô tả mới' })).rejects.toThrow(/không khớp/i);
  });

  it('readback trả row rỗng (bị xoá giữa chừng) thì báo đã ghi nhưng không xác nhận được', async () => {
    state.rows.clear();

    const failure = await updateArea('area-1', { description: 'Mô tả đã lưu' }).catch((e: unknown) => e as Error & { persisted?: boolean }) as Error & { persisted?: boolean };
    expect(failure?.message).toMatch(/Đã ghi/);
    expect(failure?.persisted).toBe(true);
  });

  it('ghi đã persisted nhưng revalidate lỗi thì KHÔNG được nói là chưa lưu gì', async () => {
    state.revalidateAreaContent.mockRejectedValueOnce(new Error('revalidate 500'));

    const failure = await updateArea('area-1', { description: 'Mô tả đã lưu' }).catch((e: unknown) => e as Error & { persisted?: boolean; saved?: unknown }) as Error & { persisted?: boolean; saved?: unknown };

    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toMatch(/đã được lưu|đã ghi/i);
    // Phải phân biệt rõ: dữ liệu đã nằm trong DB, chỉ cache chưa làm mới.
    expect(failure?.message).not.toMatch(/thất bại hoàn toàn|chưa lưu/i);
    expect((failure as { persisted?: boolean })?.persisted).toBe(true);
    expect((failure as { saved?: unknown })?.saved).toEqual({ description: 'Mô tả đã lưu' });
  });

  it('lỗi readback cũng phải nói rõ là đã ghi (không phải chưa lưu gì)', async () => {
    state.readbackError = new Error('readback denied');

    const failure = await updateArea('area-1', { description: 'Mô tả đã lưu' }).catch((e: unknown) => e as Error & { persisted?: boolean }) as Error & { persisted?: boolean };

    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toMatch(/đã ghi|đã được lưu/i);
    expect(failure?.persisted).toBe(true);
  });
});
