-- Seed footer quick links + editable static/legal pages rendered at /trang/<slug>.
-- Nội dung mẫu dùng placeholder để admin thay bằng dữ liệu pháp lý/doanh nghiệp thật.

insert into site_settings (key, value, label, group_name, type)
values (
  'footer_quick_links',
  '[{"label":"Trang chủ","href":"/"},{"label":"Mua bán BĐS","href":"/mua-ban"},{"label":"BĐS Cho thuê","href":"/cho-thue"},{"label":"Dự án","href":"/du-an"},{"label":"Đầu tư","href":"/dau-tu"},{"label":"Khu vực","href":"/khu-vuc"},{"label":"Tin tức","href":"/tin-tuc"},{"label":"Về chúng tôi","href":"/ve-chung-toi"},{"label":"Liên hệ","href":"/trang/lien-he"},{"label":"Điều khoản sử dụng","href":"/trang/dieu-khoan-su-dung"},{"label":"Chính sách bảo mật","href":"/trang/chinh-sach-bao-mat"},{"label":"Chính sách đăng tin","href":"/trang/chinh-sach-dang-tin"}]',
  'Liên kết nhanh footer',
  'footer',
  'textarea'
)
on conflict (key) do update set
  value = case
    when site_settings.value is null or trim(site_settings.value) = '' then excluded.value
    else site_settings.value
  end,
  label = excluded.label,
  group_name = excluded.group_name,
  type = excluded.type,
  updated_at = now();

with pages(slug, title, description, order_index) as (
  values
    ('lien-he', 'Liên hệ', 'Thông tin liên hệ và kênh hỗ trợ khách hàng.', 100),
    ('quy-che-hoat-dong', 'Quy chế hoạt động', 'Quy chế hoạt động của nền tảng đăng tin bất động sản.', 101),
    ('dieu-khoan-su-dung', 'Điều khoản sử dụng', 'Điều khoản sử dụng website và dịch vụ.', 102),
    ('chinh-sach-bao-mat', 'Chính sách bảo mật', 'Chính sách thu thập, sử dụng và bảo vệ dữ liệu cá nhân.', 103),
    ('chinh-sach-dang-tin', 'Chính sách đăng tin', 'Quy định về nội dung, hình ảnh và trách nhiệm khi đăng tin.', 104),
    ('quy-trinh-kiem-duyet', 'Quy trình kiểm duyệt tin đăng', 'Các bước tiếp nhận, kiểm tra và hiển thị tin đăng.', 105),
    ('quy-trinh-khieu-nai', 'Quy trình giải quyết khiếu nại', 'Quy trình tiếp nhận và xử lý phản ánh, khiếu nại.', 106),
    ('danh-sach-moi-gioi', 'Danh sách môi giới/đối tác', 'Thông tin môi giới, cộng tác viên và đối tác được công bố.', 107),
    ('phap-ly-doanh-nghiep', 'Thông tin pháp lý doanh nghiệp', 'Thông tin pháp lý, đăng ký kinh doanh và đầu mối liên hệ.', 108)
)
insert into managed_pages (slug, title, description, hero_image, is_active, is_system, order_index)
select slug, title, description, null, true, false, order_index from pages
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  updated_at = now();

with blocks(page_slug, label, html) as (
  values
    ('lien-he', 'Nội dung liên hệ', '<h2>Liên hệ với chúng tôi</h2><p>Quý khách có thể liên hệ với [Tên doanh nghiệp] qua các kênh dưới đây để được hỗ trợ về đăng tin, tìm kiếm bất động sản hoặc hợp tác kinh doanh.</p><ul><li>Hotline: [Số điện thoại]</li><li>Email: [Email liên hệ]</li><li>Địa chỉ: [Địa chỉ doanh nghiệp]</li><li>Thời gian hỗ trợ: [Thời gian làm việc]</li></ul><p>Thông tin trong trang này cần được admin cập nhật theo dữ liệu doanh nghiệp thực tế trước khi công bố chính thức.</p>'),
    ('quy-che-hoat-dong', 'Nội dung quy chế hoạt động', '<h2>Quy chế hoạt động</h2><p>Quy chế này mô tả nguyên tắc vận hành nền tảng [Tên website], quyền và trách nhiệm của người dùng, người đăng tin, môi giới/đối tác và đơn vị quản lý website.</p><h3>1. Nguyên tắc chung</h3><p>Người dùng cam kết cung cấp thông tin trung thực, không đăng tải nội dung vi phạm pháp luật, không xâm phạm quyền và lợi ích hợp pháp của bên thứ ba.</p><h3>2. Trách nhiệm của người đăng tin</h3><p>Người đăng tin chịu trách nhiệm về tính chính xác của thông tin bất động sản, hình ảnh, giá bán/giá thuê, tình trạng pháp lý và khả năng giao dịch.</p><h3>3. Trách nhiệm của đơn vị vận hành</h3><p>[Tên doanh nghiệp] tiếp nhận, kiểm duyệt và xử lý phản ánh theo quy trình công bố trên website. Admin cần cập nhật nội dung này theo quy chế nội bộ chính thức.</p>'),
    ('dieu-khoan-su-dung', 'Nội dung điều khoản sử dụng', '<h2>Điều khoản sử dụng</h2><p>Khi truy cập và sử dụng [Tên website], người dùng đồng ý tuân thủ các điều khoản được công bố tại trang này.</p><h3>1. Phạm vi sử dụng</h3><p>Website cung cấp thông tin, công cụ tìm kiếm, đăng tin và kết nối nhu cầu bất động sản. Nội dung trên website không thay thế tư vấn pháp lý, tài chính hoặc thẩm định độc lập.</p><h3>2. Tài khoản và bảo mật</h3><p>Người dùng chịu trách nhiệm bảo mật thông tin đăng nhập và các hoạt động phát sinh từ tài khoản của mình.</p><h3>3. Thay đổi điều khoản</h3><p>[Tên doanh nghiệp] có thể cập nhật điều khoản khi cần thiết. Phiên bản mới có hiệu lực từ thời điểm được đăng tải trên website.</p>'),
    ('chinh-sach-bao-mat', 'Nội dung chính sách bảo mật', '<h2>Chính sách bảo mật</h2><p>Chính sách này giải thích cách [Tên doanh nghiệp] thu thập, sử dụng, lưu trữ và bảo vệ thông tin cá nhân của người dùng.</p><h3>1. Thông tin thu thập</h3><p>Thông tin có thể bao gồm họ tên, số điện thoại, email, nhu cầu bất động sản, nội dung liên hệ và dữ liệu kỹ thuật phục vụ vận hành website.</p><h3>2. Mục đích sử dụng</h3><p>Dữ liệu được dùng để hỗ trợ người dùng, xử lý đăng tin, tư vấn, cải thiện dịch vụ và thực hiện nghĩa vụ pháp lý khi có yêu cầu hợp lệ.</p><h3>3. Bảo vệ dữ liệu</h3><p>Admin cần cập nhật chính sách này theo quy trình bảo mật, thời hạn lưu trữ và đầu mối xử lý dữ liệu thực tế của doanh nghiệp.</p>'),
    ('chinh-sach-dang-tin', 'Nội dung chính sách đăng tin', '<h2>Chính sách đăng tin</h2><p>Người đăng tin cần đảm bảo nội dung, hình ảnh và thông tin giao dịch là chính xác, rõ ràng, không gây hiểu nhầm.</p><h3>1. Nội dung được phép đăng</h3><p>Tin đăng phải liên quan đến bất động sản, có vị trí, loại hình, giá, diện tích và thông tin liên hệ phù hợp.</p><h3>2. Nội dung không được phép</h3><p>Không đăng tin giả, trùng lặp gây spam, hình ảnh không liên quan, thông tin sai lệch, nội dung vi phạm pháp luật hoặc quyền của bên thứ ba.</p><h3>3. Quyền xử lý</h3><p>[Tên doanh nghiệp] có quyền từ chối, ẩn, chỉnh sửa hoặc yêu cầu bổ sung thông tin với các tin không đạt tiêu chuẩn kiểm duyệt.</p>'),
    ('quy-trinh-kiem-duyet', 'Nội dung quy trình kiểm duyệt', '<h2>Quy trình kiểm duyệt tin đăng</h2><p>Quy trình này giúp đảm bảo tin đăng hiển thị trên website có nội dung phù hợp, rõ ràng và hạn chế rủi ro cho người xem.</p><ol><li>Người dùng gửi tin đăng và thông tin liên quan.</li><li>Hệ thống/admin kiểm tra nội dung, hình ảnh, thông tin liên hệ và trạng thái pháp lý được khai báo.</li><li>Admin phê duyệt, yêu cầu chỉnh sửa hoặc từ chối tin đăng.</li><li>Tin được duyệt sẽ hiển thị công khai theo quy định của website.</li></ol><p>Admin cần cập nhật thời gian xử lý và tiêu chí chi tiết theo quy trình vận hành thực tế.</p>'),
    ('quy-trinh-khieu-nai', 'Nội dung quy trình khiếu nại', '<h2>Quy trình giải quyết khiếu nại</h2><p>Người dùng có thể gửi phản ánh khi phát hiện tin đăng sai lệch, tranh chấp thông tin hoặc vấn đề phát sinh trong quá trình sử dụng dịch vụ.</p><ol><li>Tiếp nhận khiếu nại qua [Email/Số điện thoại/Biểu mẫu].</li><li>Xác minh thông tin và yêu cầu các bên cung cấp tài liệu liên quan nếu cần.</li><li>Đưa ra hướng xử lý, chỉnh sửa, ẩn tin hoặc thông báo kết quả cho các bên.</li><li>Lưu hồ sơ xử lý theo quy định nội bộ.</li></ol><p>Admin cần điền thời hạn xử lý, đầu mối phụ trách và chính sách lưu trữ khiếu nại thực tế.</p>'),
    ('danh-sach-moi-gioi', 'Nội dung danh sách môi giới/đối tác', '<h2>Danh sách môi giới/đối tác</h2><p>Trang này dùng để công bố danh sách môi giới, cộng tác viên hoặc đối tác được [Tên doanh nghiệp] xác nhận.</p><p>Admin có thể thay nội dung này bằng bảng danh sách gồm: họ tên/đơn vị, khu vực phụ trách, số điện thoại, email, trạng thái xác minh và ghi chú.</p><table><thead><tr><th>Tên/Đơn vị</th><th>Khu vực</th><th>Liên hệ</th><th>Trạng thái</th></tr></thead><tbody><tr><td>[Tên môi giới/đối tác]</td><td>[Khu vực]</td><td>[SĐT/Email]</td><td>[Đã xác minh]</td></tr></tbody></table>'),
    ('phap-ly-doanh-nghiep', 'Nội dung pháp lý doanh nghiệp', '<h2>Thông tin pháp lý doanh nghiệp</h2><p>Trang này công bố thông tin pháp lý chính thức của đơn vị vận hành website. Admin cần thay toàn bộ placeholder bằng dữ liệu thật trước khi dùng chính thức.</p><table><tbody><tr><th>Tên doanh nghiệp</th><td>[Tên doanh nghiệp]</td></tr><tr><th>Mã số thuế/ĐKKD</th><td>[Mã số thuế]</td></tr><tr><th>Địa chỉ trụ sở</th><td>[Địa chỉ]</td></tr><tr><th>Người đại diện</th><td>[Người đại diện pháp luật]</td></tr><tr><th>Email liên hệ</th><td>[Email]</td></tr><tr><th>Hotline</th><td>[Số điện thoại]</td></tr></tbody></table><p>Nội dung này không được coi là hoàn tất cho đến khi admin đối chiếu với hồ sơ pháp lý doanh nghiệp.</p>')
)
insert into page_blocks (page_slug, section, key, label, type, value, order_index)
select page_slug, 'body', 'content', label, 'html', html, 1 from blocks
on conflict (page_slug, section, key) do update set
  label = excluded.label,
  type = excluded.type,
  updated_at = now()
where page_blocks.value is null or trim(page_blocks.value) = '';
