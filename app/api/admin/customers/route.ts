import { NextRequest, NextResponse } from 'next/server';
import { callerClient, requireAdminOrStaff } from '@/lib/server/requireAdmin';

export const runtime = 'nodejs';

const PAGE_SIZE_MAX = 100;

type CustomerRecord = {
  user_id: string;
  status: 'new' | 'active' | 'qualified' | 'inactive' | 'blocked';
  tags: string[];
  updated_at: string;
  created_at: string;
};
type Profile = { id: string; role: 'user' | 'staff' | 'admin'; display_name: string | null; phone: string | null; created_at: string };
type Assignment = {
  id: string;
  user_id: string;
  staff_user_id: string;
  assignment_kind: 'primary' | 'co_assignee';
  assigned_by: string | null;
  started_at: string;
  ended_at: string | null;
};
type LinkedLead = {
  id: string;
  full_name: string;
  phone: string;
  status: string;
  source: string | null;
  property_id: string | null;
  created_at: string;
};
type LinkedChat = {
  id: string;
  status: string;
  visitor_name: string | null;
  need_summary: string | null;
  lead_id: string | null;
  property_id: string | null;
  admin_attention: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function rpcError(error: { message: string; code?: string }) {
  const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400;
  return jsonError(error.message, status);
}

async function loadProfiles(client: ReturnType<typeof callerClient>, ids: string[]) {
  if (ids.length === 0) return [] as Profile[];
  const { data, error } = await client
    .from('profiles')
    .select('id, role, display_name, phone, created_at')
    .in('id', ids);
  if (error) throw error;
  return (data ?? []) as Profile[];
}

async function getWorkspace(client: ReturnType<typeof callerClient>, req: NextRequest) {
  const url = new URL(req.url);
  const { data: callerIsAdmin } = await client.rpc('is_admin');
  const canManageAssignments = callerIsAdmin === true;

  if (url.searchParams.get('staff') === '1') {
    const [{ data, error }, { data: settings, error: settingsError }] = await Promise.all([
      client
        .from('profiles')
        .select('id, role, display_name, phone, created_at')
        .eq('role', 'staff')
        .order('created_at', { ascending: true }),
      client.from('staff_customer_settings').select('user_id, is_available, max_active_customers'),
    ]);
    if (error) return jsonError(error.message, 500);
    if (settingsError) return jsonError(settingsError.message, 500);
    const settingsById = new Map((settings ?? []).map(setting => [setting.user_id, setting]));
    return NextResponse.json({
      staff: (data ?? []).map(profile => ({
        ...profile,
        is_available: settingsById.get(profile.id)?.is_available ?? true,
        max_active_customers: settingsById.get(profile.id)?.max_active_customers ?? 50,
      })),
      canManageAssignments,
    });
  }

  if (url.searchParams.get('linkCandidates') === '1') {
    if (!canManageAssignments) return jsonError('Chỉ admin được xem danh sách liên kết.', 403);
    const [{ data: leads, error: leadsError }, { data: chats, error: chatsError }] = await Promise.all([
      client.from('leads').select('id, full_name, phone, status, source, property_id, created_at, user_id').order('created_at', { ascending: false }).limit(200),
      client.from('chat_sessions').select('id, status, visitor_name, need_summary, lead_id, property_id, admin_attention, created_at, updated_at, last_message_at, user_id').order('last_message_at', { ascending: false }).limit(200),
    ]);
    if (leadsError) return jsonError(leadsError.message, 500);
    if (chatsError) return jsonError(chatsError.message, 500);
    return NextResponse.json({ leads: leads ?? [], chats: chats ?? [] });
  }

  const userId = url.searchParams.get('userId');

  if (userId) {
    const [{ data: record, error: recordError }, { data: profile, error: profileError }, { data: assignments, error: assignmentError }, { data: activities, error: activityError }, { data: listings, error: listingError }, { data: media, error: mediaError }, { data: linkedLeads, error: linkedLeadsError }, { data: linkedChats, error: linkedChatsError }] = await Promise.all([
      client.from('user_customer_records').select('*').eq('user_id', userId).maybeSingle(),
      client.from('profiles').select('id, display_name, phone, created_at').eq('id', userId).maybeSingle(),
      client.from('user_customer_assignments').select('*').eq('user_id', userId).order('started_at', { ascending: false }),
      client.from('user_customer_activities').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
      client.from('user_listings').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      client.from('user_media').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      client.rpc('get_customer_linked_leads', { p_user_id: userId }),
      client.rpc('get_customer_linked_chats', { p_user_id: userId }),
    ]);
    const errors = [recordError, profileError, assignmentError, activityError, listingError, mediaError, linkedLeadsError, linkedChatsError].filter(Boolean);
    if (errors.length > 0) return jsonError(errors[0]!.message, 500);
    if (!record) return jsonError('Không tìm thấy customer.', 404);
    if ((profile as Profile | null)?.role !== 'user') return jsonError('Tài khoản không còn là customer.', 404);

    const assignmentRows = (assignments ?? []) as Assignment[];
    let staffProfiles: Profile[] = [];
    try {
      staffProfiles = await loadProfiles(client, assignmentRows.map(a => a.staff_user_id));
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Không tải được nhân viên phụ trách.', 500);
    }
    const staffById = new Map(staffProfiles.map(profile => [profile.id, profile]));
    const primaryAssignment = assignmentRows.find(a => a.assignment_kind === 'primary' && !a.ended_at);
    return NextResponse.json({
      ...(record as CustomerRecord),
      display_name: (profile as Profile | null)?.display_name ?? null,
      phone: (profile as Profile | null)?.phone ?? null,
      primary_staff_id: primaryAssignment?.staff_user_id ?? null,
      primary_staff_name: primaryAssignment ? staffById.get(primaryAssignment.staff_user_id)?.display_name ?? null : null,
      active_assignment_count: assignmentRows.filter(a => !a.ended_at).length,
      assignments: assignmentRows.map(assignment => ({
        ...assignment,
        staff_display_name: staffById.get(assignment.staff_user_id)?.display_name ?? null,
      })),
      activities: activities ?? [],
      listings: listings ?? [],
      media: media ?? [],
      linkedLeads: (linkedLeads ?? []) as LinkedLead[],
      linkedChats: (linkedChats ?? []) as LinkedChat[],
    });
  }

  const status = url.searchParams.get('status');
  const staffId = url.searchParams.get('staffId');
  const assignmentFilter = url.searchParams.get('assignment') ?? 'all';
  const search = (url.searchParams.get('search') ?? '').trim().toLocaleLowerCase('vi-VN');
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') ?? '25', 10) || 25));

  const [{ data: records, error: recordsError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    client.from('user_customer_records').select('*').order('updated_at', { ascending: false }),
    client.from('user_customer_assignments').select('*').is('ended_at', null),
  ]);
  if (recordsError) return jsonError(recordsError.message, 500);
  if (assignmentsError) return jsonError(assignmentsError.message, 500);

  const recordRows = (records ?? []) as CustomerRecord[];
  const assignmentRows = (assignments ?? []) as Assignment[];
  const profileIds = recordRows.map(record => record.user_id);
  let profiles: Profile[];
  try {
    profiles = await loadProfiles(client, profileIds);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Không tải được hồ sơ customer.', 500);
  }
  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  const activeByUser = new Map<string, Assignment[]>();
  for (const assignment of assignmentRows) {
    const current = activeByUser.get(assignment.user_id) ?? [];
    current.push(assignment);
    activeByUser.set(assignment.user_id, current);
  }

  const filtered = recordRows.filter(record => {
    const profile = profileById.get(record.user_id);
    const active = activeByUser.get(record.user_id) ?? [];
    if (profile?.role !== 'user') return false;
    if (status && status !== 'all' && record.status !== status) return false;
    if (staffId && !active.some(assignment => assignment.staff_user_id === staffId)) return false;
    if (assignmentFilter === 'assigned' && active.length === 0) return false;
    if (assignmentFilter === 'unassigned' && active.length > 0) return false;
    if (search) {
      const haystack = `${profile?.display_name ?? ''} ${profile?.phone ?? ''}`.toLocaleLowerCase('vi-VN');
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const total = filtered.length;
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const staffIds = [...new Set(visible.flatMap(record => (activeByUser.get(record.user_id) ?? []).map(a => a.staff_user_id)))];
  let staffProfiles: Profile[];
  try {
    staffProfiles = await loadProfiles(client, staffIds);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Không tải được nhân viên phụ trách.', 500);
  }
  const staffById = new Map(staffProfiles.map(profile => [profile.id, profile]));
  const customers = visible.map(record => {
    const profile = profileById.get(record.user_id);
    const active = activeByUser.get(record.user_id) ?? [];
    const primary = active.find(assignment => assignment.assignment_kind === 'primary');
    return {
      ...record,
      display_name: profile?.display_name ?? null,
      phone: profile?.phone ?? null,
      primary_staff_id: primary?.staff_user_id ?? null,
      primary_staff_name: primary ? staffById.get(primary.staff_user_id)?.display_name ?? null : null,
      active_assignment_count: active.length,
    };
  });

  return NextResponse.json({ customers, total, page, pageSize });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminOrStaff(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });
  try {
    return await getWorkspace(callerClient(auth.token), req);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Không tải được workspace customer.', 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminOrStaff(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== 'string') return jsonError('Yêu cầu không hợp lệ.');

  const client = callerClient(auth.token);
  let rpcName: string;
  let args: Record<string, unknown>;
  switch (body.action) {
    case 'add_note':
      if (typeof body.userId !== 'string' || typeof body.body !== 'string') return jsonError('Thiếu customer hoặc nội dung ghi chú.');
      rpcName = 'add_customer_note';
      args = { p_user_id: body.userId, p_body: body.body };
      break;
    case 'update_status_tags':
      if (typeof body.userId !== 'string' || typeof body.status !== 'string' || (body.tags !== undefined && !Array.isArray(body.tags))) return jsonError('Dữ liệu trạng thái customer không hợp lệ.');
      rpcName = 'update_customer_status_tags';
      args = { p_user_id: body.userId, p_status: body.status, p_tags: body.tags ?? [] };
      break;
    case 'assign_primary':
      if (typeof body.userId !== 'string' || typeof body.staffUserId !== 'string') return jsonError('Thiếu customer hoặc nhân viên.');
      rpcName = 'assign_customer_primary';
      args = { p_user_id: body.userId, p_staff_user_id: body.staffUserId };
      break;
    case 'add_co_assignee':
      if (typeof body.userId !== 'string' || typeof body.staffUserId !== 'string') return jsonError('Thiếu customer hoặc nhân viên.');
      rpcName = 'add_customer_co_assignee';
      args = { p_user_id: body.userId, p_staff_user_id: body.staffUserId };
      break;
    case 'end_assignment':
      if (typeof body.assignmentId !== 'string') return jsonError('Thiếu phân công.');
      rpcName = 'end_customer_assignment';
      args = { p_assignment_id: body.assignmentId };
      break;
    case 'staff_settings':
      if (typeof body.staffUserId !== 'string' || typeof body.isAvailable !== 'boolean' || typeof body.maxActiveCustomers !== 'number') return jsonError('Cấu hình nhân viên không hợp lệ.');
      rpcName = 'admin_upsert_staff_customer_settings';
      args = { p_staff_user_id: body.staffUserId, p_is_available: body.isAvailable, p_max_active_customers: body.maxActiveCustomers };
      break;
    case 'link_lead':
      if (typeof body.userId !== 'string' || typeof body.leadId !== 'string') return jsonError('Thiếu customer hoặc lead.');
      rpcName = 'admin_link_customer_lead';
      args = { p_user_id: body.userId, p_lead_id: body.leadId };
      break;
    case 'unlink_lead':
      if (typeof body.userId !== 'string' || typeof body.leadId !== 'string') return jsonError('Thiếu customer hoặc lead.');
      rpcName = 'admin_unlink_customer_lead';
      args = { p_user_id: body.userId, p_lead_id: body.leadId };
      break;
    case 'link_chat':
      if (typeof body.userId !== 'string' || typeof body.sessionId !== 'string') return jsonError('Thiếu customer hoặc phiên chat.');
      rpcName = 'admin_link_customer_chat';
      args = { p_user_id: body.userId, p_session_id: body.sessionId };
      break;
    case 'unlink_chat':
      if (typeof body.userId !== 'string' || typeof body.sessionId !== 'string') return jsonError('Thiếu customer hoặc phiên chat.');
      rpcName = 'admin_unlink_customer_chat';
      args = { p_user_id: body.userId, p_session_id: body.sessionId };
      break;
    default:
      return jsonError('Thao tác customer không hợp lệ.');
  }

  const { error } = await client.rpc(rpcName, args);
  if (error) return rpcError(error);
  return NextResponse.json({ ok: true });
}
