import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const adminClientMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/requireAdmin', () => ({
  adminClient: adminClientMock,
}));

import { POST } from './route';

const VALID_KEY = 'make-secret-at-least-20-chars';
const ORIGINAL_KEY = process.env.MAKE_API_KEY;

type Row = Record<string, unknown>;
type DbResult = { data: Row | null; error: { code?: string; message: string } | null };

type AdminOptions = {
  categories?: string[];
  categoryError?: { code?: string; message: string } | null;
  externalRows?: Array<Row | null>;
  insertResults?: DbResult[];
};

function makeAdmin(options: AdminOptions = {}) {
  const inserts: Row[] = [];
  let externalLookup = 0;
  let insertCall = 0;
  const externalRows = options.externalRows ?? [null];
  const insertResults = options.insertResults ?? [
    { data: { id: 'news-1', slug: 'bai-moi', is_published: false }, error: null },
  ];

  const admin = {
    from: vi.fn((table: string) => {
      if (table === 'news_categories') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(async () => ({
              data: (options.categories ?? ['Thị trường', 'Đầu tư', 'Hướng dẫn']).map(label => ({ label })),
              error: options.categoryError ?? null,
            })),
          })),
        };
      }

      if (table !== 'news') throw new Error(`Unexpected table: ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              const row = externalRows[Math.min(externalLookup, externalRows.length - 1)] ?? null;
              externalLookup += 1;
              return { data: row, error: null };
            }),
          })),
        })),
        insert: vi.fn((row: Row) => {
          inserts.push(row);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                const result = insertResults[Math.min(insertCall, insertResults.length - 1)];
                insertCall += 1;
                return result;
              }),
            })),
          };
        }),
      };
    }),
  };

  return { admin, inserts };
}

function request(body: string | Record<string, unknown>, key = VALID_KEY): NextRequest {
  return new NextRequest('http://localhost/api/public/articles', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  process.env.MAKE_API_KEY = VALID_KEY;
  adminClientMock.mockReset();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.MAKE_API_KEY;
  else process.env.MAKE_API_KEY = ORIGINAL_KEY;
});

describe('POST /api/public/articles', () => {
  it('từ chối khóa API sai trước khi truy cập DB', async () => {
    const response = await POST(request({ title: 'Bài', content: 'Nội dung' }, 'wrong-key'));
    expect(response.status).toBe(401);
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it('trả 400 cho JSON lỗi', async () => {
    const response = await POST(request('{not-json'));
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: 'Body không phải JSON hợp lệ.' });
  });

  it('đo giới hạn 512KB theo byte UTF-8, không theo số ký tự JavaScript', async () => {
    const response = await POST(request({ title: 'á'.repeat(270_000), content: 'Nội dung' }));
    expect(response.status).toBe(413);
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it('trả 400 khi payload thiếu title hoặc content', async () => {
    const response = await POST(request({ title: 'Thiếu nội dung' }));
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: 'Dữ liệu không hợp lệ.' });
  });

  it('trả 503 khi thiếu Supabase service-role client', async () => {
    adminClientMock.mockReturnValue(null);
    const response = await POST(request({ title: 'Bài', content: 'Nội dung' }));
    expect(response.status).toBe(503);
  });

  it('trả bài cũ khi external_id đã tồn tại', async () => {
    const { admin, inserts } = makeAdmin({
      externalRows: [{ id: 'old-1', slug: 'bai-cu', is_published: false }],
    });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request({ title: 'Bài', content: 'Nội dung', external_id: 'make-1' }));
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ id: 'old-1', duplicate: true, is_published: false });
    expect(inserts).toHaveLength(0);
  });

  it('trả 503 khi không đọc được danh mục động', async () => {
    const { admin } = makeAdmin({ categoryError: { message: 'database unavailable' } });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request({ title: 'Bài', content: 'Nội dung' }));
    expect(response.status).toBe(503);
    expect(await json(response)).toMatchObject({ error: 'Không kiểm tra được danh mục tin tức.' });
  });

  it('từ chối danh mục không tồn tại và trả danh sách được phép', async () => {
    const { admin, inserts } = makeAdmin({ categories: ['Thị trường', 'Đầu tư', 'Hướng dẫn'] });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request({ title: 'Bài', content: 'Nội dung', category: 'Pháp lý' }));
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({
      error: 'Danh mục tin tức không tồn tại.',
      allowed_categories: ['Thị trường', 'Đầu tư', 'Hướng dẫn'],
    });
    expect(inserts).toHaveLength(0);
  });

  it('lưu bài mới dưới dạng nháp và bỏ qua field do caller tự đặt', async () => {
    const { admin, inserts } = makeAdmin();
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request({
      title: 'Bài mới',
      content: '<p>Nội dung</p>',
      category: 'Đầu tư',
      external_id: 'make-2',
      is_published: true,
      slug: 'slug-tu-caller',
      views: 99_999,
    }));

    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({ is_published: false, duplicate: false });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      title: 'Bài mới',
      category: 'Đầu tư',
      external_id: 'make-2',
      is_published: false,
      slug: 'bai-moi',
    });
    expect(inserts[0]).not.toHaveProperty('views');
  });

  it('khép race external_id: unique conflict được đọc lại thành duplicate 200', async () => {
    const { admin } = makeAdmin({
      externalRows: [null, { id: 'race-1', slug: 'bai-race', is_published: false }],
      insertResults: [{ data: null, error: { code: '23505', message: 'duplicate key' } }],
    });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request({
      title: 'Bài race',
      content: 'Nội dung',
      external_id: 'make-race',
    }));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ id: 'race-1', duplicate: true });
  });

  it('thử slug kế tiếp khi một request khác vừa chiếm slug', async () => {
    const { admin, inserts } = makeAdmin({
      insertResults: [
        { data: null, error: { code: '23505', message: 'duplicate slug' } },
        { data: { id: 'news-2', slug: 'bai-trung-2', is_published: false }, error: null },
      ],
    });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request({ title: 'Bài trùng', content: 'Nội dung' }));
    expect(response.status).toBe(201);
    expect(inserts.map(row => row.slug)).toEqual(['bai-trung', 'bai-trung-2']);
  });
});
