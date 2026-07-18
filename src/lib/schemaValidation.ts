export type SchemaTarget = 'global' | 'property' | 'news' | 'area' | 'route' | 'home';

export interface SchemaValidationResult {
  valid: boolean;
  warnings: string[];
  schema: Record<string, unknown> | null;
}

const MAX_SCHEMA_BYTES = 50_000;

const ALLOWED_TYPES: Record<SchemaTarget, Set<string>> = {
  global: new Set(['RealEstateAgent', 'Organization', 'WebSite', 'SearchAction']),
  property: new Set(['RealEstateListing', 'Offer', 'Residence', 'Place', 'VideoObject', 'BreadcrumbList']),
  news: new Set(['NewsArticle', 'Article', 'BreadcrumbList']),
  area: new Set(['CollectionPage', 'ItemList', 'Place', 'BreadcrumbList']),
  route: new Set(['WebPage', 'CollectionPage', 'ItemList', 'FAQPage', 'BreadcrumbList']),
  home: new Set(['WebPage', 'FAQPage', 'WebSite', 'RealEstateAgent', 'Organization']),
};

const URL_KEYS = new Set(['url', 'image', 'logo', 'sameAs', 'contentUrl', 'embedUrl', 'thumbnailUrl', 'item', 'mainEntityOfPage']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemaTypes(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

function containsUnsafeUrl(value: unknown): boolean {
  if (typeof value === 'string') return /^javascript:/i.test(value.trim());
  if (Array.isArray(value)) return value.some(containsUnsafeUrl);
  if (isPlainObject(value)) return Object.entries(value).some(([key, child]) => URL_KEYS.has(key) && containsUnsafeUrl(child));
  return false;
}

function scanUnsafeUrls(obj: Record<string, unknown>): boolean {
  return Object.entries(obj).some(([key, value]) => {
    if (URL_KEYS.has(key) && containsUnsafeUrl(value)) return true;
    if (Array.isArray(value)) return value.some(v => isPlainObject(v) && scanUnsafeUrls(v));
    if (isPlainObject(value)) return scanUnsafeUrls(value);
    return false;
  });
}

export function parseSchemaJson(value: string): SchemaValidationResult {
  if (!value.trim()) return { valid: true, warnings: [], schema: null };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isPlainObject(parsed)) return { valid: false, warnings: ['Schema phải là JSON object.'], schema: null };
    return { valid: true, warnings: [], schema: parsed };
  } catch {
    return { valid: false, warnings: ['Schema JSON không hợp lệ.'], schema: null };
  }
}

export function validateSchemaMarkup(schema: unknown, target: SchemaTarget): SchemaValidationResult {
  const warnings: string[] = [];
  if (schema == null) return { valid: true, warnings, schema: null };
  if (!isPlainObject(schema)) return { valid: false, warnings: ['Schema phải là JSON object.'], schema: null };
  if (JSON.stringify(schema).length > MAX_SCHEMA_BYTES) {
    return { valid: false, warnings: ['Schema quá lớn, vui lòng rút gọn trước khi lưu.'], schema: null };
  }

  const context = schema['@context'];
  if (context && !(typeof context === 'string' && context.includes('schema.org'))) {
    warnings.push('@context không phải schema.org nên schema custom bị bỏ qua.');
  }

  const types = schemaTypes(schema['@type']);
  const allowed = ALLOWED_TYPES[target];
  if (types.length === 0) warnings.push('Thiếu @type cho schema.');
  const incompatible = types.filter(type => !allowed.has(type));
  if (incompatible.length > 0) warnings.push(`@type không phù hợp cho trang này: ${incompatible.join(', ')}.`);
  if (scanUnsafeUrls(schema)) warnings.push('Schema chứa URL không an toàn.');

  const valid = warnings.length === 0;
  return { valid, warnings, schema: valid ? schema : null };
}

export function mergeSchema(base: Record<string, unknown>, custom: unknown, target: SchemaTarget, lockedKeys: string[]): { schema: Record<string, unknown>; warnings: string[] } {
  const validation = validateSchemaMarkup(custom, target);
  if (!validation.valid || !validation.schema) return { schema: base, warnings: validation.warnings };
  const merged = { ...base, ...validation.schema };
  for (const key of lockedKeys) merged[key] = base[key];
  return { schema: merged, warnings: validation.warnings };
}
