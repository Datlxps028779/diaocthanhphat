// Định giá BĐS đơn giản: ước tính khoảng giá từ trung vị giá/m² của các BĐS
// tương đương (cùng khu vực/loại). KHÔNG phải thẩm định chính thức — chỉ tham
// khảo nhanh để hút lead. Mọi giá quy về đơn vị "triệu" cho nhất quán.

interface PriceLike {
  price: number;
  price_unit: string;
  area_sqm: number | null;
}

// Quy giá về triệu. 'tỷ' → ×1000. Giá <= 0 coi như không hợp lệ.
export function normalizeToTrieu(price: number, unit: string): number | null {
  if (!price || price <= 0) return null;
  if (unit === 'tỷ') return price * 1000;
  return price; // mặc định coi là triệu
}

// Giá mỗi m² (triệu/m²). Null nếu thiếu diện tích hoặc giá không hợp lệ.
export function pricePerSqm(p: PriceLike): number | null {
  if (!p.area_sqm || p.area_sqm <= 0) return null;
  const trieu = normalizeToTrieu(p.price, p.price_unit);
  if (trieu === null) return null;
  return trieu / p.area_sqm;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface Valuation {
  lowTrieu: number;
  midTrieu: number;
  highTrieu: number;
  pricePerSqmMedian: number;
  sampleSize: number;
}

// Ước tính giá trị (triệu) cho BĐS diện tích targetArea, dựa trên trung vị giá/m²
// của các comps hợp lệ. Cần tối thiểu 2 mẫu để trung vị có ý nghĩa.
const BAND = 0.12; // ±12% quanh giá trị giữa

export function estimateValuation(comps: PriceLike[], targetArea: number): Valuation | null {
  if (!targetArea || targetArea <= 0) return null;
  const perSqm = comps.map(pricePerSqm).filter((v): v is number => v !== null);
  if (perSqm.length < 2) return null;

  const ppsMedian = median(perSqm);
  const mid = ppsMedian * targetArea;
  return {
    lowTrieu: Math.round(mid * (1 - BAND)),
    midTrieu: Math.round(mid),
    highTrieu: Math.round(mid * (1 + BAND)),
    pricePerSqmMedian: ppsMedian,
    sampleSize: perSqm.length,
  };
}
