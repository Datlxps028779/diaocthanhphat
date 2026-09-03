import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { parsePublicLeadPayload } from '@/lib/publicLead';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 32 * 1024;

type DbError = { code?: string; message?: string };

function createLeadClient(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) return null;

  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: values => {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Cookie writes can be unavailable after the request context becomes immutable.
        }
      },
    },
    global: {
      headers: {
        ...(req.headers.get('x-forwarded-for') ? { 'x-forwarded-for': req.headers.get('x-forwarded-for')! } : {}),
        ...(req.headers.get('user-agent') ? { 'user-agent': req.headers.get('user-agent')! } : {}),
      },
    },
  });
}

async function notifyCrmWebhook(input: {
  full_name: string;
  phone: string;
  property_id?: string;
  property_title?: string;
  message?: string;
  budget?: string;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`${url}/functions/v1/crm-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch {
    // Lead persistence must not fail when the notification path is unavailable.
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Body quá lớn.' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }

  const parsed = parsePublicLeadPayload(body, crypto.randomUUID());
  if (!parsed.ok) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ.', details: parsed.errors }, { status: 400 });
  }

  const client = createLeadClient(req);
  if (!client) {
    return NextResponse.json({ error: 'Dịch vụ lead chưa được cấu hình.' }, { status: 503 });
  }

  const { error } = await client.rpc('public_submit_lead', {
    p_id: parsed.insert.id,
    p_full_name: parsed.insert.full_name,
    p_phone: parsed.insert.phone,
    p_area_interest: parsed.insert.area_interest,
    p_message: parsed.insert.message,
    p_property_id: parsed.insert.property_id,
    p_source: parsed.insert.source,
    p_budget: parsed.insert.budget,
    p_follow_up_at: parsed.insert.follow_up_at,
  });

  if (error) {
    const dbError = error as DbError;
    if (dbError.code === '23505') {
      return NextResponse.json({ error: 'Yêu cầu này đã được ghi nhận.' }, { status: 409 });
    }
    if (dbError.code?.startsWith('22')) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }
    console.error('[api/public/leads] RPC lỗi:', dbError.code ?? 'unknown');
    return NextResponse.json({ error: 'Chưa gửi được thông tin.' }, { status: 503 });
  }

  await notifyCrmWebhook({
    full_name: parsed.insert.full_name,
    phone: parsed.insert.phone,
    ...(parsed.input.property_id ? { property_id: parsed.input.property_id } : {}),
    ...(parsed.input.property_title ? { property_title: parsed.input.property_title } : {}),
    ...(parsed.input.message ? { message: parsed.input.message } : {}),
    ...(parsed.input.budget ? { budget: parsed.input.budget } : {}),
  });

  return NextResponse.json({ id: parsed.insert.id }, { status: 201 });
}
