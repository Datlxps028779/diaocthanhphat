export type CoordinatePair = { latitude: number | null; longitude: number | null };

export type CoordinateValidation =
  | { valid: true; coordinates: CoordinatePair }
  | { valid: false; message: string; fieldErrors?: { latitude?: string; longitude?: string } };

function parseCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateCoordinatePair(latitudeInput: unknown, longitudeInput: unknown): CoordinateValidation {
  const latitudeEmpty = latitudeInput === null || latitudeInput === undefined || (typeof latitudeInput === 'string' && latitudeInput.trim() === '');
  const longitudeEmpty = longitudeInput === null || longitudeInput === undefined || (typeof longitudeInput === 'string' && longitudeInput.trim() === '');
  if (latitudeEmpty && longitudeEmpty) return { valid: true, coordinates: { latitude: null, longitude: null } };
  if (latitudeEmpty || longitudeEmpty) {
    const message = 'Vui lòng nhập đủ cả vĩ độ và kinh độ, hoặc xóa cả hai ô.';
    return { valid: false, message, fieldErrors: { ...(latitudeEmpty ? { latitude: 'Vui lòng nhập vĩ độ.' } : {}), ...(longitudeEmpty ? { longitude: 'Vui lòng nhập kinh độ.' } : {}) } };
  }

  const latitude = parseCoordinate(latitudeInput);
  const longitude = parseCoordinate(longitudeInput);
  if (latitude === null || longitude === null) {
    const message = 'Tọa độ phải là số hợp lệ.';
    return { valid: false, message, fieldErrors: { ...(latitude === null ? { latitude: 'Vĩ độ phải là số hợp lệ.' } : {}), ...(longitude === null ? { longitude: 'Kinh độ phải là số hợp lệ.' } : {}) } };
  }
  if (latitude < -90 || latitude > 90) return { valid: false, message: 'Vĩ độ phải nằm trong khoảng -90 đến 90.', fieldErrors: { latitude: 'Vĩ độ phải nằm trong khoảng -90 đến 90.' } };
  if (longitude < -180 || longitude > 180) return { valid: false, message: 'Kinh độ phải nằm trong khoảng -180 đến 180.', fieldErrors: { longitude: 'Kinh độ phải nằm trong khoảng -180 đến 180.' } };
  return { valid: true, coordinates: { latitude, longitude } };
}

export function coordinatePairFromUnknown(latitudeInput: unknown, longitudeInput: unknown): CoordinatePair {
  const result = validateCoordinatePair(latitudeInput, longitudeInput);
  return result.valid ? result.coordinates : { latitude: null, longitude: null };
}
