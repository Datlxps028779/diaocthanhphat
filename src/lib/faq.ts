// FAQ trang chủ — câu hỏi thường gặp. Vừa hiển thị (accordion) vừa sinh schema
// FAQPage cho SEO (Google hiện FAQ rich result → tăng CTR + chiếm chỗ SERP).
// Giữ dạng danh sách tĩnh curated: đủ cho quick win SEO, không cần bảng CMS riêng.

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'Mua bán, cho thuê bất động sản trên website có mất phí không?',
    a: 'Xem tin và liên hệ chủ nhà/môi giới hoàn toàn miễn phí. Bạn chỉ cần để lại thông tin để được tư vấn chi tiết về pháp lý, giá và thủ tục.',
  },
  {
    q: 'Làm sao để đăng tin bán hoặc cho thuê bất động sản?',
    a: 'Bạn đăng ký tài khoản, vào mục "Đăng tin", điền thông tin và tải nhiều hình ảnh. Tin sẽ được đội ngũ kiểm duyệt trước khi hiển thị công khai để đảm bảo chất lượng.',
  },
  {
    q: 'Thông tin pháp lý của bất động sản có được kiểm tra không?',
    a: 'Mỗi tin đăng hiển thị tình trạng pháp lý theo thông tin được cung cấp trong hồ sơ tin. Bạn nên yêu cầu xem và tự kiểm tra giấy tờ, điều khoản trước khi giao dịch.',
  },
  {
    q: 'Tôi có được hỗ trợ vay ngân hàng khi mua nhà đất không?',
    a: 'Bạn có thể sử dụng các công cụ tham khảo trên website và để lại thông tin nếu cần được tư vấn thêm. Điều kiện vay và quyết định tín dụng phụ thuộc vào ngân hàng, hồ sơ và khả năng tài chính của bạn.',
  },
  {
    q: 'Khu vực nào tại Bình Dương đang được quan tâm nhiều nhất?',
    a: 'Bạn có thể lọc theo khu vực để xem các tin đang hoạt động tại Dĩ An, Thuận An, Thủ Dầu Một và những khu vực khác có dữ liệu phù hợp.',
  },
  {
    q: 'Website có công cụ định giá bất động sản không?',
    a: 'Có. Mục "Định giá" giúp bạn ước lượng giá trị nhà đất dựa trên vị trí, diện tích và loại hình, làm cơ sở tham khảo trước khi mua bán.',
  },
];

// FAQPage JSON-LD. Render qua <script type="application/ld+json"> ở trang chủ.
export function buildFaqJsonLd(items: FaqItem[] = FAQ_ITEMS): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
