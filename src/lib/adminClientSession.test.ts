import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const adminClient = readFileSync(
  resolve(process.cwd(), 'app/_clients/AdminClient.tsx'),
  'utf8',
);
const staffTab = readFileSync(
  resolve(process.cwd(), 'src/components/admin/tabs/StaffTab.tsx'),
  'utf8',
);

describe('admin session state preservation contract', () => {
  it('keys permission loading by stable user identity instead of refreshed User objects', () => {
    expect(adminClient).toContain('const userId = user?.id;');
    expect(adminClient).toContain('if (!userId) {');
    expect(adminClient).toContain('}, [userId]);');
    expect(adminClient).not.toContain('}, [user]);');
    expect(adminClient).toContain('Supabase tạo object User mới khi refresh token');
  });

  it('does not persist or auto-open the permission editor', () => {
    expect(staffTab).toContain('const [permissionEditor, setPermissionEditor] = useState<AdminUserRow | null>(null);');
    expect(staffTab).toContain('onClick={() => setPermissionEditor(u)}');
    expect(staffTab).toContain('onClose={() => setPermissionEditor(null)}');
    expect(staffTab).not.toMatch(/permissionEditor[\s\S]{0,500}(localStorage|sessionStorage)/);
  });
});
