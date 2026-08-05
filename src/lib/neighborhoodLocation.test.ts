import { describe, it, expect } from 'vitest';
import { resolveNeighborhoodLocation, formatLocationLabel, filterNeighborhoods } from './neighborhoodLocation';

const areas = [
  { id: 'bd', name: 'Bình Dương', slug: 'binh-duong' },
  { id: 'hcm', name: 'TP. Hồ Chí Minh', slug: 'tp-hcm' },
  { id: 'bp', name: 'Bình Phước', slug: 'binh-phuoc' },
];
const districts = [
  { id: 'ta', area_id: 'bd', name: 'Thuận An', slug: 'binh-duong-thuan-an' },
  { id: 'td', area_id: 'hcm', name: 'Thủ Đức', slug: 'tp-hcm-thu-duc' },
  { id: 'dx', area_id: 'bp', name: 'Đồng Xoài', slug: 'dong-xoai' },
];
const wards = [
  { id: 'ap-bd', district_id: 'ta', name: 'An Phú', slug: 'binh-duong-thuan-an-an-phu' },
  { id: 'ap-hcm', district_id: 'td', name: 'An Phú', slug: 'tp-hcm-thu-duc-an-phu' },
];
const tax = { areas, districts, wards };

describe('resolveNeighborhoodLocation — suy đủ 3 cấp', () => {
  it('dùng cột mới khi có đủ area_id + district_id + ward_id', () => {
    const loc = resolveNeighborhoodLocation({ area_id: 'bd', district_id: 'ta', ward_id: 'ap-bd' }, tax);
    expect(loc.area?.name).toBe('Bình Dương');
    expect(loc.district?.name).toBe('Thuận An');
    expect(loc.ward?.name).toBe('An Phú');
  });

  // Dữ liệu cũ chỉ có ward_id (bảng trước đây không có cột tỉnh/huyện).
  it('suy ngược lên huyện và tỉnh khi chỉ có ward_id', () => {
    const loc = resolveNeighborhoodLocation({ ward_id: 'ap-hcm' }, tax);
    expect(loc.ward?.name).toBe('An Phú');
    expect(loc.district?.name).toBe('Thủ Đức');
    expect(loc.area?.name).toBe('TP. Hồ Chí Minh');
  });

  // Tỉnh chưa có dữ liệu cấp xã (Bình Phước) — khu chỉ gắn tới huyện.
  it('chấp nhận chỉ có tỉnh + huyện, không có xã', () => {
    const loc = resolveNeighborhoodLocation({ area_id: 'bp', district_id: 'dx' }, tax);
    expect(loc.area?.name).toBe('Bình Phước');
    expect(loc.district?.name).toBe('Đồng Xoài');
    expect(loc.ward).toBeNull();
  });

  it('chấp nhận chỉ có tỉnh (khu trải rộng nhiều huyện)', () => {
    const loc = resolveNeighborhoodLocation({ area_id: 'bp' }, tax);
    expect(loc.area?.name).toBe('Bình Phước');
    expect(loc.district).toBeNull();
    expect(loc.ward).toBeNull();
  });

  it('trả null hết khi không có cấp nào', () => {
    expect(resolveNeighborhoodLocation({}, tax)).toEqual({ area: null, district: null, ward: null });
  });

  it('bỏ qua id không tồn tại trong taxonomy, không văng lỗi', () => {
    const loc = resolveNeighborhoodLocation({ area_id: 'khong-co', ward_id: 'cung-khong-co' }, tax);
    expect(loc).toEqual({ area: null, district: null, ward: null });
  });

  // Cột mới thắng: nếu ward_id trỏ sai tỉnh, area_id đã lưu vẫn là nguồn chân lý.
  it('ưu tiên cột mới khi ward_id mâu thuẫn với area_id', () => {
    const loc = resolveNeighborhoodLocation({ area_id: 'bd', district_id: 'ta', ward_id: 'ap-hcm' }, tax);
    expect(loc.area?.name).toBe('Bình Dương');
    expect(loc.district?.name).toBe('Thuận An');
  });
});

describe('formatLocationLabel — nhãn vị trí đọc được', () => {
  it('ghép đủ 3 cấp từ nhỏ đến lớn', () => {
    expect(formatLocationLabel(resolveNeighborhoodLocation({ ward_id: 'ap-bd' }, tax)))
      .toBe('An Phú, Thuận An, Bình Dương');
  });

  it('bỏ cấp thiếu, không để dấu phẩy lơ lửng', () => {
    expect(formatLocationLabel(resolveNeighborhoodLocation({ area_id: 'bp', district_id: 'dx' }, tax)))
      .toBe('Đồng Xoài, Bình Phước');
    expect(formatLocationLabel(resolveNeighborhoodLocation({ area_id: 'bp' }, tax))).toBe('Bình Phước');
  });

  it('trả chuỗi rỗng khi không có cấp nào (UI tự ẩn)', () => {
    expect(formatLocationLabel({ area: null, district: null, ward: null })).toBe('');
  });
});

describe('filterNeighborhoods — bộ lọc dùng chung admin + trang công khai', () => {
  const items = [
    { id: '1', name: 'Phú Hồng Thịnh 8', ward_id: 'ap-bd' },
    { id: '2', name: 'Việt Sing', area_id: 'hcm', district_id: 'td', ward_id: 'ap-hcm' },
    { id: '3', name: 'Khu Công Nghiệp Minh Hưng', area_id: 'bp' },
    { id: '4', name: 'Chưa gán vị trí' },
  ];

  it('không có điều kiện thì trả nguyên danh sách', () => {
    expect(filterNeighborhoods(items, {}, tax)).toHaveLength(4);
  });

  it('lọc theo tỉnh, kể cả khu chỉ có ward_id', () => {
    expect(filterNeighborhoods(items, { areaId: 'bd' }, tax).map(x => x.id)).toEqual(['1']);
    expect(filterNeighborhoods(items, { areaId: 'bp' }, tax).map(x => x.id)).toEqual(['3']);
  });

  it('lọc theo huyện', () => {
    expect(filterNeighborhoods(items, { districtId: 'td' }, tax).map(x => x.id)).toEqual(['2']);
  });

  it('lọc theo từ khoá không phân biệt dấu và hoa thường', () => {
    expect(filterNeighborhoods(items, { keyword: 'viet sing' }, tax).map(x => x.id)).toEqual(['2']);
    expect(filterNeighborhoods(items, { keyword: 'PHÚ HỒNG' }, tax).map(x => x.id)).toEqual(['1']);
  });

  it('tìm được cả theo tên khu vực trong nhãn vị trí', () => {
    expect(filterNeighborhoods(items, { keyword: 'thuan an' }, tax).map(x => x.id)).toEqual(['1']);
  });

  it('kết hợp nhiều điều kiện', () => {
    expect(filterNeighborhoods(items, { areaId: 'hcm', keyword: 'sing' }, tax).map(x => x.id)).toEqual(['2']);
    expect(filterNeighborhoods(items, { areaId: 'bd', keyword: 'sing' }, tax)).toEqual([]);
  });

  it('khu chưa gán vị trí bị loại khi lọc theo tỉnh, nhưng còn khi lọc từ khoá', () => {
    expect(filterNeighborhoods(items, { areaId: 'bd' }, tax).map(x => x.id)).not.toContain('4');
    expect(filterNeighborhoods(items, { keyword: 'chưa gán' }, tax).map(x => x.id)).toEqual(['4']);
  });
});
