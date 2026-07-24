export interface FaqItem {
  question: string;
  answer: string;
}

// Input linh hoạt để dùng chung cho Property record (server render) lẫn form state
// (admin/đăng tin). Chấp nhận string|number vì form giữ số dạng chuỗi.
export interface PropertyFaqInput {
  title?: string | null;
  listing_type?: string | null;
  price?: string | number | null;
  price_unit?: string | null;
  price_per_month?: string | number | null;
  ward?: string | null;
  district?: string | null;
  city?: string | null;
  area_sqm?: string | number | null;
  bedrooms?: string | number | null;
  bathrooms?: string | number | null;
  legal_status?: string | null;
  direction?: string | null;
}

function str(v: string | number | null | undefined): string {
  return v == null ? '' : String(v).trim();
}

function priceAnswer(p: PropertyFaqInput): string {
  if (p.listing_type === 'cho_thue' && str(p.price_per_month)) return `${str(p.price_per_month)} triệu/tháng`;
  if (str(p.price)) return `${str(p.price)} ${str(p.price_unit) || 'tỷ'}`;
  return '';
}

function locationLabel(p: PropertyFaqInput): string {
  return [p.ward, p.district, p.city].map(s => str(s)).filter(Boolean).join(', ');
}

// FAQ tự-sinh cho chi tiết BĐS — CHỈ từ field thật. Sinh cả câu hỏi lẫn câu trả
// lời (an toàn vì đáp lấy trực tiếp từ dữ liệu). Câu nào thiếu dữ liệu thì bỏ,
// không bịa. Trả [] khi không đủ dữ liệu để có FAQ thật.
export function buildPropertyFaq(p: PropertyFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const name = 'Bất động sản này';
  const listingVerb = p.listing_type === 'cho_thue' ? 'cho thuê' : 'bán';

  const price = priceAnswer(p);
  if (price) {
    items.push({
      question: `Giá ${listingVerb} ${name} là bao nhiêu?`,
      answer: `Mức giá ${listingVerb} hiện tại là ${price}. Vui lòng liên hệ để được tư vấn chi tiết và cập nhật mới nhất.`,
    });
  }

  const location = locationLabel(p);
  if (location) {
    items.push({
      question: `${name} nằm ở đâu?`,
      answer: `Bất động sản tọa lạc tại ${location}.`,
    });
  }

  const specs: string[] = [];
  if (str(p.area_sqm)) specs.push(`diện tích ${str(p.area_sqm)}m²`);
  if (str(p.bedrooms)) specs.push(`${str(p.bedrooms)} phòng ngủ`);
  if (str(p.bathrooms)) specs.push(`${str(p.bathrooms)} phòng tắm`);
  if (specs.length > 0) {
    items.push({
      question: `${name} có diện tích và bố trí như thế nào?`,
      answer: `Bất động sản có ${specs.join(', ')}.`,
    });
  }

  if (str(p.legal_status)) {
    items.push({
      question: `Tình trạng pháp lý của ${name} ra sao?`,
      answer: `Pháp lý: ${str(p.legal_status)}.`,
    });
  }

  if (str(p.direction)) {
    items.push({
      question: `${name} có hướng nào?`,
      answer: `Hướng ${str(p.direction)}.`,
    });
  }

  return items;
}

// Gợi ý câu hỏi FAQ cho bài tin tức — chỉ sinh phần CÂU HỎI (answer để trống) từ
// tiêu đề/khu vực/danh mục thật. Admin tự viết đáp án chính xác, tránh AI bịa nội dung.
export function suggestNewsFaq(input: { title?: string; category?: string; geoArea?: string }): FaqItem[] {
  const topic = input.title?.trim();
  const area = input.geoArea?.trim();
  const category = input.category?.trim();
  const questions: string[] = [];
  if (topic) questions.push(`Nội dung chính của "${topic}" là gì?`);
  if (area) questions.push(`Thông tin này tác động thế nào đến bất động sản tại ${area}?`);
  if (category) questions.push(`Nhà đầu tư quan tâm ${category.toLowerCase()} cần lưu ý điều gì?`);
  questions.push('Người mua/bán nên hành động ra sao trước thông tin này?');
  return questions.map(q => ({ question: q, answer: '' }));
}

// FAQPage JSON-LD từ danh sách FAQ. Trả null khi rỗng để caller KHÔNG emit schema
// khi không có FAQ visible (chuẩn Google/AEO: schema phải khớp nội dung hiển thị).
export function buildFaqJsonLd(items: FaqItem[]): Record<string, unknown> | null {
  if (!items || items.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(it => ({
      '@type': 'Question',
      name: it.question,
      acceptedAnswer: { '@type': 'Answer', text: it.answer },
    })),
  };
}
