const SOURCE_LABELS: Record<string, string> = {
  property_detail_form: 'Form chi tiết',
  phone_reveal: 'Bấm hiện số',
  contact_modal: 'Popup liên hệ',
  invest_page: 'Trang đầu tư',
  about_page: 'Trang liên hệ',
  valuation_page: 'Trang định giá',
  admin_manual: 'Nhập tay',
  ai_advisor: 'AI Advisor',
};

const SOURCE_ORIGIN: Record<string, string> = {
  property_detail_form: 'form trang chi tiết',
  phone_reveal: 'bấm hiện số',
  contact_modal: 'popup liên hệ',
  invest_page: 'trang đầu tư',
  about_page: 'trang liên hệ',
  valuation_page: 'trang định giá',
  admin_manual: 'nhập tay',
  ai_advisor: 'AI Advisor',
};

export function leadSourceLabel(source: string | null | undefined): string {
  if (!source) return 'Không rõ';
  return SOURCE_LABELS[source] ?? source;
}

export function leadOriginLabel(source: string | null | undefined): string {
  if (!source) return 'Phát sinh khách mới';
  return `Phát sinh từ ${SOURCE_ORIGIN[source] ?? source}`;
}
