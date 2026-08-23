export type ContentCollectionItem = Record<string, string | string[]>;

export type ContentCollection = {
  version: 1;
  items: ContentCollectionItem[];
};

export type CollectionField = {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'image' | 'list';
  required?: boolean;
  placeholder?: string;
};

export type CollectionDefinition = {
  pageSlug: string;
  section: string;
  key: string;
  label: string;
  description: string;
  itemLabel: string;
  fields: CollectionField[];
};

const collectionDefinitions: CollectionDefinition[] = [
  {
    pageSlug: 'about', section: 'stats', key: 'items', label: 'Các số liệu nổi bật',
    description: 'Mỗi mục là một số liệu có thể kiểm chứng. Không nhập số liệu minh hoạ hoặc chưa được xác nhận.',
    itemLabel: 'Số liệu',
    fields: [
      { key: 'value', label: 'Số liệu', kind: 'text', required: true, placeholder: 'Ví dụ: 7+' },
      { key: 'label', label: 'Diễn giải', kind: 'text', required: true, placeholder: 'Ví dụ: Năm kinh nghiệm' },
      { key: 'icon', label: 'Biểu tượng', kind: 'text', placeholder: 'Award, Building2, Users hoặc Star' },
    ],
  },
  {
    pageSlug: 'about', section: 'mission', key: 'items', label: 'Các cam kết sứ mệnh',
    description: 'Mỗi dòng là một cam kết đã được phê duyệt để công bố.',
    itemLabel: 'Cam kết',
    fields: [{ key: 'text', label: 'Nội dung cam kết', kind: 'text', required: true }],
  },
  {
    pageSlug: 'about', section: 'awards', key: 'items', label: 'Giải thưởng và chứng nhận',
    description: 'Chỉ nhập giải thưởng hoặc chứng nhận có thể kiểm tra nguồn.',
    itemLabel: 'Giải thưởng',
    fields: [{ key: 'text', label: 'Tên giải thưởng / chứng nhận', kind: 'text', required: true }],
  },
  {
    pageSlug: 'about', section: 'values', key: 'items', label: 'Giá trị cốt lõi',
    description: 'Mỗi giá trị gồm tiêu đề, diễn giải ngắn và biểu tượng tùy chọn.',
    itemLabel: 'Giá trị',
    fields: [
      { key: 'title', label: 'Tiêu đề', kind: 'text', required: true },
      { key: 'description', label: 'Diễn giải', kind: 'textarea', required: true },
      { key: 'icon', label: 'Biểu tượng', kind: 'text', placeholder: 'Shield, Heart, Target hoặc TrendingUp' },
    ],
  },
  {
    pageSlug: 'about', section: 'timeline', key: 'items', label: 'Hành trình phát triển',
    description: 'Mỗi dòng thời gian hiển thị theo thứ tự bên dưới. Nhập từng ô riêng, không cần dùng dấu | hay mã kỹ thuật.',
    itemLabel: 'Mốc phát triển',
    fields: [
      { key: 'year', label: 'Năm / mốc thời gian', kind: 'text', required: true, placeholder: 'Ví dụ: 2024' },
      { key: 'title', label: 'Tiêu đề sự kiện', kind: 'text', required: true },
      { key: 'description', label: 'Nội dung', kind: 'textarea', required: true },
    ],
  },
  {
    pageSlug: 'about', section: 'team', key: 'items', label: 'Đội ngũ',
    description: 'Chỉ công bố thông tin và ảnh đã được người liên quan đồng ý.',
    itemLabel: 'Thành viên',
    fields: [
      { key: 'name', label: 'Họ tên', kind: 'text', required: true },
      { key: 'role', label: 'Vai trò', kind: 'text', required: true },
      { key: 'experience', label: 'Kinh nghiệm / giới thiệu ngắn', kind: 'text' },
      { key: 'image', label: 'Ảnh đại diện', kind: 'image' },
    ],
  },
  {
    pageSlug: 'invest', section: 'calculator', key: 'labels', label: 'Nhãn công cụ tính ROI',
    description: 'Các nhãn hiển thị trong công cụ chỉ mô tả phép tính; không nhập cam kết lợi nhuận.',
    itemLabel: 'Cấu hình',
    fields: [
      { key: 'heading', label: 'Tiêu đề', kind: 'text', required: true },
      { key: 'subtitle', label: 'Mô tả', kind: 'text' },
      { key: 'capital', label: 'Nhãn vốn', kind: 'text', required: true },
      { key: 'capital_unit', label: 'Đơn vị vốn', kind: 'text', required: true },
      { key: 'yield_rate', label: 'Nhãn tỷ suất', kind: 'text', required: true },
      { key: 'years', label: 'Nhãn thời gian', kind: 'text', required: true },
      { key: 'action', label: 'Nút hành động', kind: 'text', required: true },
      { key: 'result_heading', label: 'Tiêu đề kết quả', kind: 'text', required: true },
      { key: 'initial_capital', label: 'Nhãn vốn ban đầu', kind: 'text', required: true },
      { key: 'projected_value', label: 'Nhãn giá trị dự kiến', kind: 'text', required: true },
      { key: 'profit', label: 'Nhãn lợi nhuận', kind: 'text', required: true },
      { key: 'total_return', label: 'Nhãn tổng lợi nhuận', kind: 'text', required: true },
      { key: 'disclaimer', label: 'Lưu ý / giới hạn', kind: 'textarea' },
    ],
  },
  {
    pageSlug: 'invest', section: 'opportunities', key: 'items', label: 'Cơ hội đầu tư',
    description: 'Chỉ dùng dữ liệu và nhận định có nguồn nội bộ/đã kiểm tra. Nếu không có cơ sở, để trống các trường lợi nhuận và vốn.',
    itemLabel: 'Cơ hội',
    fields: [
      { key: 'title', label: 'Tên cơ hội', kind: 'text', required: true },
      { key: 'location', label: 'Khu vực', kind: 'text' },
      { key: 'tag', label: 'Nhãn', kind: 'text' },
      { key: 'description', label: 'Diễn giải', kind: 'textarea', required: true },
      { key: 'features', label: 'Điểm nổi bật (mỗi dòng một ý)', kind: 'list' },
      { key: 'return_label', label: 'Thông tin lợi nhuận có nguồn', kind: 'text' },
      { key: 'minimum_capital', label: 'Vốn tham khảo', kind: 'text' },
    ],
  },
  {
    pageSlug: 'invest', section: 'process', key: 'items', label: 'Quy trình đầu tư',
    description: 'Các bước hiển thị theo đúng thứ tự trong danh sách.',
    itemLabel: 'Bước',
    fields: [
      { key: 'number', label: 'Số bước', kind: 'text', required: true, placeholder: '01' },
      { key: 'title', label: 'Tên bước', kind: 'text', required: true },
      { key: 'description', label: 'Diễn giải', kind: 'textarea', required: true },
    ],
  },
  {
    pageSlug: 'invest', section: 'benefits', key: 'items', label: 'Lý do lựa chọn',
    description: 'Các cam kết phải phản ánh đúng chính sách và năng lực thực tế.',
    itemLabel: 'Lý do',
    fields: [
      { key: 'title', label: 'Tiêu đề', kind: 'text', required: true },
      { key: 'description', label: 'Diễn giải', kind: 'textarea', required: true },
      { key: 'icon', label: 'Biểu tượng', kind: 'text', placeholder: 'Shield, TrendingUp, Users hoặc Calculator' },
    ],
  },
];

export function getCollectionDefinitions(pageSlug: string): CollectionDefinition[] {
  return collectionDefinitions.filter(definition => definition.pageSlug === pageSlug);
}

export function getCollectionDefinition(pageSlug: string, section: string, key: string): CollectionDefinition | undefined {
  return collectionDefinitions.find(definition => (
    definition.pageSlug === pageSlug && definition.section === section && definition.key === key
  ));
}

function normalizeItem(value: unknown, definition?: CollectionDefinition): ContentCollectionItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const item: ContentCollectionItem = {};
  for (const [key, fieldValue] of Object.entries(raw)) {
    if (typeof fieldValue === 'string') item[key] = fieldValue.trim();
    else if (Array.isArray(fieldValue) && fieldValue.every(entry => typeof entry === 'string')) item[key] = fieldValue.map(entry => entry.trim()).filter(Boolean);
  }
  if (definition?.fields.some(field => field.required && !String(item[field.key] ?? '').trim())) return null;
  return Object.keys(item).length ? item : null;
}

function parseLegacyCollection(value: string, definition: CollectionDefinition): ContentCollectionItem[] {
  const keys = definition.fields.map(field => field.key);
  return value.split(/\\r?\\n/).map(line => {
    const parts = line.split('|').map(part => part.trim());
    if (parts.length < keys.length) return null;
    const item: ContentCollectionItem = {};
    keys.forEach((key, index) => { item[key] = parts[index] ?? ''; });
    return normalizeItem(item, definition);
  }).filter((item): item is ContentCollectionItem => item !== null);
}

export function parseContentCollection(value: string | null | undefined, definition?: CollectionDefinition): ContentCollectionItem[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    const rawItems = Array.isArray(parsed) ? parsed : (
      parsed && typeof parsed === 'object' && Array.isArray((parsed as ContentCollection).items)
        ? (parsed as ContentCollection).items
        : []
    );
    return rawItems.map(item => normalizeItem(item, definition)).filter((item): item is ContentCollectionItem => item !== null);
  } catch {
    return definition ? parseLegacyCollection(value, definition) : [];
  }
}

export function serializeContentCollection(items: ContentCollectionItem[], definition?: CollectionDefinition): string {
  const validItems = items.map(item => normalizeItem(item, definition)).filter((item): item is ContentCollectionItem => item !== null);
  return JSON.stringify({ version: 1, items: validItems } satisfies ContentCollection);
}

export function collectionItemIsComplete(item: ContentCollectionItem, definition: CollectionDefinition): boolean {
  return definition.fields.every(field => !field.required || Boolean(String(item[field.key] ?? '').trim()));
}
