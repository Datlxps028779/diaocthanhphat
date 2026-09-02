import { supabase } from '../supabase';

export type CustomerStatus = 'new' | 'active' | 'qualified' | 'inactive' | 'blocked';
export type CustomerAssignmentKind = 'primary' | 'co_assignee';

export interface CustomerListRow {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  created_at: string;
  status: CustomerStatus;
  tags: string[];
  updated_at: string;
  primary_staff_id: string | null;
  primary_staff_name: string | null;
  active_assignment_count: number;
}

export interface CustomerAssignment {
  id: string;
  user_id: string;
  staff_user_id: string;
  assignment_kind: CustomerAssignmentKind;
  assigned_by: string | null;
  started_at: string;
  ended_at: string | null;
  staff_display_name?: string | null;
}

export interface CustomerActivity {
  id: string;
  user_id: string;
  kind: 'note' | 'status_change' | 'assignment_change' | 'system';
  body: string;
  author_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CustomerDetail extends CustomerListRow {
  activities: CustomerActivity[];
  assignments: CustomerAssignment[];
  listings: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
}

export interface CustomerListResult {
  customers: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
}

async function authHeader(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
  };
}

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Không tải được dữ liệu customer.');
  return json as T;
}

export async function getCustomerWorkspace(params: {
  search?: string;
  status?: CustomerStatus | 'all';
  staffId?: string;
  assignment?: 'all' | 'assigned' | 'unassigned';
  page?: number;
  pageSize?: number;
} = {}): Promise<CustomerListResult> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== 'all') query.set(key, String(value));
  }
  const res = await fetch(`/api/admin/customers?${query}`, { headers: await authHeader() });
  return parseResponse<CustomerListResult>(res);
}

export async function getCustomerStaff(): Promise<{ staff: Array<{ id: string; display_name: string | null; phone: string | null; created_at: string; is_available: boolean; max_active_customers: number }>; canManageAssignments: boolean }> {
  const res = await fetch('/api/admin/customers?staff=1', { headers: await authHeader() });
  return parseResponse(res);
}

export async function getCustomerDetail(userId: string): Promise<CustomerDetail> {
  const res = await fetch(`/api/admin/customers?userId=${encodeURIComponent(userId)}`, { headers: await authHeader() });
  return parseResponse<CustomerDetail>(res);
}

async function postCustomerAction(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/admin/customers', {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify(body),
  });
  await parseResponse<{ ok: true }>(res);
}

export function addCustomerNote(userId: string, body: string): Promise<void> {
  return postCustomerAction({ action: 'add_note', userId, body });
}

export function updateCustomerStatusTags(userId: string, status: CustomerStatus, tags: string[]): Promise<void> {
  return postCustomerAction({ action: 'update_status_tags', userId, status, tags });
}

export function assignCustomerPrimary(userId: string, staffUserId: string): Promise<void> {
  return postCustomerAction({ action: 'assign_primary', userId, staffUserId });
}

export function addCustomerCoAssignee(userId: string, staffUserId: string): Promise<void> {
  return postCustomerAction({ action: 'add_co_assignee', userId, staffUserId });
}

export function endCustomerAssignment(assignmentId: string): Promise<void> {
  return postCustomerAction({ action: 'end_assignment', assignmentId });
}

export interface MyAccountSummary {
  listingCounts: Record<string, number>;
  savedSearchCount: number;
  support: Array<{ staff_display_name: string | null; assignment_kind: CustomerAssignmentKind }>;
  supportAvailable: boolean;
}

export async function getMyAccountSummary(): Promise<MyAccountSummary> {
  const [listingsResult, savedSearchResult, supportResult] = await Promise.all([
    supabase.from('user_listings').select('status'),
    supabase.from('user_saved_searches').select('id', { count: 'exact', head: true }),
    supabase.rpc('get_my_customer_support'),
  ]);
  if (listingsResult.error) throw listingsResult.error;
  if (savedSearchResult.error) throw savedSearchResult.error;
  const listingCounts: Record<string, number> = {};
  for (const row of (listingsResult.data ?? []) as Array<{ status: string }>) {
    listingCounts[row.status] = (listingCounts[row.status] ?? 0) + 1;
  }
  return {
    listingCounts,
    savedSearchCount: savedSearchResult.count ?? 0,
    support: (supportResult.data ?? []) as Array<{ staff_display_name: string | null; assignment_kind: CustomerAssignmentKind }>,
    supportAvailable: !supportResult.error,
  };
}

export interface StaffCustomerSetting {
  user_id: string;
  is_available: boolean;
  max_active_customers: number;
}

export async function upsertStaffCustomerSettings(input: {
  staffUserId: string;
  isAvailable: boolean;
  maxActiveCustomers: number;
}): Promise<void> {
  return postCustomerAction({
    action: 'staff_settings',
    staffUserId: input.staffUserId,
    isAvailable: input.isAvailable,
    maxActiveCustomers: input.maxActiveCustomers,
  });
}
