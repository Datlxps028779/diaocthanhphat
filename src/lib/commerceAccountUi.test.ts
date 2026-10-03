import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const accountHub = readFileSync(resolve(process.cwd(), 'src/screens/AccountHubPage.tsx'), 'utf8');
const commerceAccount = readFileSync(resolve(process.cwd(), 'src/screens/CommerceAccountTab.tsx'), 'utf8');
const adminPanel = readFileSync(resolve(process.cwd(), 'src/components/AdminPanel.tsx'), 'utf8');
const operationsTab = readFileSync(resolve(process.cwd(), 'src/components/admin/tabs/CommerceOperationsTab.tsx'), 'utf8');
const operationsBell = readFileSync(resolve(process.cwd(), 'src/components/admin/shared/CommerceOperationsBell.tsx'), 'utf8');
const permissions = readFileSync(resolve(process.cwd(), 'src/lib/staffPermissions.ts'), 'utf8');

describe('commerce account UI contract', () => {
  it('adds a stable account tab and opens it after payment redirect', () => {
    expect(accountHub).toContain("'commerce'");
    expect(accountHub).toContain("label: 'Ví & thanh toán'");
    expect(accountHub).toContain("if (payment) setTab('commerce')");
    expect(accountHub).toContain("tab === 'commerce' && <CommerceAccountTab />");
  });

  it('shows backend-owned wallet balances, fee catalog, ledger and internal receipts', () => {
    expect(commerceAccount).toContain('getMyCommerceWallet');
    expect(commerceAccount).toContain('getCommerceWalletCatalog');
    expect(commerceAccount).toContain('Số dư khả dụng');
    expect(commerceAccount).toContain('Đang giữ chỗ');
    expect(commerceAccount).toContain('Mệnh giá nạp dự kiến');
    expect(commerceAccount).toContain('Phí tin đăng');
    expect(commerceAccount).toContain('Lịch sử số dư');
    expect(commerceAccount).toContain('Biên nhận nội bộ');
    expect(commerceAccount).toContain('không phải hóa đơn thuế');
    expect(commerceAccount).toContain('Nạp tiền chưa mở');
    expect(commerceAccount).not.toContain('startCommerceCheckout');
    expect(commerceAccount).not.toContain('Tiếp tục thanh toán');
    expect(commerceAccount).not.toContain('amountMinor:');
    expect(commerceAccount).not.toContain('is_hot');
    expect(commerceAccount).not.toContain('is_featured');
  });

  it('gates the operations tab and edit controls by granular permissions', () => {
    expect(permissions).toContain("module: 'commerce-operations'");
    expect(adminPanel).toContain("id: 'commerce-operations'");
    expect(adminPanel).toContain("canUseStaffPermission(permissions, 'commerce-operations', 'edit')");
    expect(operationsTab).toContain('getCommerceOperationsAlerts');
    expect(operationsTab).toContain('getCommerceOperationsQueueHealth');
    expect(operationsTab).toContain('Outbox queue');
    expect(operationsTab).toContain('Email delivery queue');
    expect(operationsTab).toContain('oldest_actionable_at');
    expect(operationsTab).toContain('Chỉ đọc');
    expect(operationsTab).toContain('không retry hoặc dispatch queue');
    expect(operationsTab).toContain('Xem chuỗi');
    expect(operationsTab).toContain('Payment events');
    expect(operationsTab).toContain('Quota cycles');
    expect(operationsTab).toContain('Email deliveries');
    expect(operationsTab).toContain('provider_message_id');
    expect(operationsTab).toContain('updateCommerceOperationsAlertStatus');
    expect(operationsTab).toContain('canEdit');
    expect(operationsBell).toContain('getCommerceOperationsAlertCount');
    expect(operationsBell).toContain('30_000');
    expect(adminPanel).toContain('<CommerceOperationsBell');
    expect(operationsTab).not.toContain("from('commerce_operations_alerts')");
  });
});
