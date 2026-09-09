import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canUseStaffPermission,
  permissionKey,
  visibleTabsFromPermissions,
  type StaffPermission,
} from './staffPermissions';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260907000000_staff_account_permissions.sql'),
  'utf8',
);

const enforcementMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930050000_staff_permission_enforcement.sql'),
  'utf8',
);

const itemAliasFixMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930080000_staff_permission_item_alias_fix.sql'),
  'utf8',
);

const staffTab = readFileSync(
  resolve(process.cwd(), 'src/components/admin/tabs/StaffTab.tsx'),
  'utf8',
);

const requireAdmin = readFileSync(
  resolve(process.cwd(), 'src/lib/server/requireAdmin.ts'),
  'utf8',
);

const generateArticleRoute = readFileSync(
  resolve(process.cwd(), 'app/api/admin/generate-article/route.ts'),
  'utf8',
);

describe('staff permissions contract', () => {
  it('removes the ambiguous item variable and SQL alias in the replacement RPC', () => {
    expect(itemAliasFixMigration).toContain('v_item jsonb;');
    expect(itemAliasFixMigration).toContain('FOR v_item IN');
    expect(itemAliasFixMigration).toContain('AS permission_json(value)');
    expect(itemAliasFixMigration).toContain('permission_json.value->>\'module\'');
    expect(itemAliasFixMigration).not.toMatch(/FROM jsonb_array_elements\(p_permissions\) item/);
    expect(itemAliasFixMigration).toContain('IF NOT public.is_admin() THEN');
    expect(itemAliasFixMigration).toContain('DELETE FROM public.staff_permission_assignments AS assignment');
    expect(itemAliasFixMigration).toContain('INSERT INTO public.staff_permission_audit');
    expect(itemAliasFixMigration).toContain('SECURITY DEFINER');
    expect(itemAliasFixMigration).toContain('SET search_path = public, pg_temp');
  });

  it('matches actions and projects visible tabs from view permissions', () => {
    const permissions: StaffPermission[] = [
      { module: 'news', action: 'view', scope_kind: 'global', scope_id: null },
      { module: 'news', action: 'publish', scope_kind: 'area', scope_id: 'area-1' },
    ];

    expect(canUseStaffPermission(permissions, 'news', 'publish')).toBe(true);
    expect(canUseStaffPermission(permissions, 'properties', 'view')).toBe(false);
    expect(visibleTabsFromPermissions(permissions)).toEqual(['news']);
    expect(permissionKey(permissions[1])).toBe('news:publish:area:area-1');
  });

  it('defines account-level assignments with deny-by-default constraints', () => {
    expect(migration).toContain('staff_user_id uuid NOT NULL REFERENCES public.profiles(id)');
    expect(migration).toContain("p.role = 'staff'");
    expect(migration).toContain("IF NOT public.is_admin() THEN");
    expect(migration).toContain("RAISE EXCEPTION 'Chỉ tài khoản staff mới được cấp quyền'");
    expect(migration).toContain("DELETE FROM public.staff_permission_assignments WHERE staff_user_id = p_staff_user_id");
  });

  it('uses secure definer configuration and restricted function ACL', () => {
    expect(migration).toMatch(/SECURITY DEFINER\s+SET search_path = public, pg_temp/);
    expect(migration).toContain('REVOKE ALL ON TABLE public.staff_permission_catalog, public.staff_permission_assignments, public.staff_permission_audit FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.replace_staff_permissions(uuid, jsonb) FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.replace_staff_permissions(uuid, jsonb) TO authenticated;');
  });

  it('validates catalog actions and taxonomy scope IDs before replacement', () => {
    expect(migration).toContain('REFERENCES public.staff_permission_catalog(module, action)');
    expect(migration).toContain("v_scope_kind NOT IN ('global', 'area', 'district', 'ward', 'neighborhood')");
    expect(migration).toContain("FROM public.areas WHERE id = v_scope_id");
    expect(migration).toContain("FROM public.districts WHERE id = v_scope_id");
    expect(migration).toContain("FROM public.wards WHERE id = v_scope_id");
    expect(migration).toContain("FROM public.neighborhoods WHERE id = v_scope_id");
  });

  it('supports inherited geographic scope from parent taxonomy nodes', () => {
    expect(migration).toContain('d.area_id = p_scope_id');
    expect(migration).toContain('w.district_id = p_scope_id');
    expect(migration).toContain('n.ward_id = p_scope_id');
    expect(migration).toContain('FROM public.neighborhoods n');
  });

  it('records atomic replacement audit without exposing service-role credentials', () => {
    expect(migration).toContain("INSERT INTO public.staff_permission_audit(staff_user_id, actor_id, operation, permission_snapshot)");
    expect(migration).toContain("VALUES (p_staff_user_id, auth.uid(), 'replace', v_snapshot)");
    expect(migration).not.toMatch(/service[_ -]?role|password|access[_ -]?token/i);
  });

  it('keeps listing moderation and scope boundaries separate from specialized edits', () => {
    expect(enforcementMigration).toContain('CREATE OR REPLACE FUNCTION public.enforce_staff_content_permission()');
    expect(enforcementMigration).toContain('v_module := TG_ARGV[0];');
    expect(enforcementMigration).not.toContain('enforce_staff_content_permission(p_module text)');
    expect(enforcementMigration).toContain('REVOKE ALL ON FUNCTION public.enforce_staff_content_permission()');
    expect(enforcementMigration).toContain("NEW.status = 'approved'");
    expect(enforcementMigration).toContain("NEW.status = 'rejected'");
    expect(enforcementMigration).toContain('Staff không được đổi khu vực khi duyệt hoặc từ chối tin đăng');
    expect(enforcementMigration).toContain("has_staff_permission('user-listings', 'edit', NEW.area_id");
    expect(enforcementMigration).toContain('Không có quyền chỉnh trường dữ liệu này trong phạm vi này');
    expect(enforcementMigration).toContain("has_staff_permission('user-listings', 'manage_media'");
    expect(enforcementMigration).toContain("has_staff_permission('user-listings', 'manage_seo'");
    expect(enforcementMigration).toContain('Tin đăng ngoài phạm vi customer được phân công');
    expect(enforcementMigration).toContain("IF auth.uid() = OLD.user_id");
    expect(enforcementMigration).toContain("public.is_customer_member(user_id)");
    expect(enforcementMigration).toContain("NOT public.is_customer_member(v_listing.user_id)");
  });

  it('resets child selectors when an admin changes a geographic parent', () => {
    expect(staffTab).toContain("changeScopeParent = (module: string, level: 'area' | 'district' | 'ward' | 'neighborhood'");
    expect(staffTab).toMatch(/level === 'area'[\s\S]*scope_district_id: ''[\s\S]*scope_ward_id: ''[\s\S]*scope_id:/);
    expect(staffTab).toMatch(/level === 'district'[\s\S]*scope_ward_id: ''[\s\S]*scope_id:/);
    expect(staffTab).toContain('districts.filter(district => district.area_id === value.scope_area_id)');
    expect(staffTab).toContain('wards.filter(ward => ward.district_id === value.scope_district_id)');
    expect(staffTab).toContain('neighborhood.ward_id !== value.scope_ward_id');
  });

  it('checks and persists the structured location used to generate an article', () => {
    expect(requireAdmin).toContain('p_area_id: scope?.areaId ?? null');
    expect(requireAdmin).toContain('p_district_id: scope?.districtId ?? null');
    expect(requireAdmin).toContain('p_ward_id: scope?.wardId ?? null');
    expect(requireAdmin).toContain('p_neighborhood_id: scope?.neighborhoodId ?? null');
    expect(generateArticleRoute).toContain("requireStaffPermission(req, 'news', 'create', location)");
    expect(generateArticleRoute).toContain("client.from('districts').select('id,name,area_id')");
    expect(generateArticleRoute).toContain("client.from('wards').select('id,name,district_id')");
    expect(generateArticleRoute).toContain("client.from('neighborhoods').select('id,name,area_id,district_id,ward_id')");
    expect(generateArticleRoute).toContain('area_id: location.areaId');
    expect(generateArticleRoute).toContain('district_id: location.districtId');
    expect(generateArticleRoute).toContain('ward_id: location.wardId');
    expect(generateArticleRoute).toContain('neighborhood_id: location.neighborhoodId');
  });
});
