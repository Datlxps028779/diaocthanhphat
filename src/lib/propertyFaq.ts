import type { Property } from './supabase';

export interface FaqItem {
  question: string;
  answer: string;
}

function priceAnswer(p: Property): string {
  if (p.listing_type === 'cho_thue' && p.price_per_month) return `${p.price_per_month} triệu/tháng`;
  if (p.price) return `${p.price} ${p.price_unit ?? 'tỷ'}`;
  return '';
}

function locationLabel(p: Property): string {
  return [p.ward, p.district, p.city].map(s => s?.trim()).filter(Boolean).join(', ');
}

// FAQ tự-sinh cho chi tiết BĐS — CHỈ từ field thật trong record. Câu nào thiếu dữ
// liệu thì bỏ, không bịa. Trả [] khi không đủ dữ liệu để có FAQ thật.
export function buildPropertyFaq(p: Property): FaqItem[] {
  const items: FaqItem[] = [];
  const name = p.title?.trim() || 'Bất động sản này';
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
  if (p.area_sqm) specs.push(`diện tích ${p.area_sqm}m²`);
  if (p.bedrooms) specs.push(`${p.bedrooms} phòng ngủ`);
  if (p.bathrooms) specs.push(`${p.bathrooms} phòng tắm`);
  if (specs.length > 0) {
    items.push({
      question: `${name} có diện tích và bố trí như thế nào?`,
      answer: `Bất động sản có ${specs.join(', ')}.`,
    });
  }

  if (p.legal_status?.trim()) {
    items.push({
      question: `Tình trạng pháp lý của ${name} ra sao?`,
      answer: `Pháp lý: ${p.legal_status.trim()}.`,
    });
  }

  if (p.direction?.trim()) {
    items.push({
      question: `${name} có hướng nào?`,
      answer: `Hướng ${p.direction.trim()}.`,
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
