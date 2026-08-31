export type ListingTitleCorrectionKind = 'spacing' | 'punctuation' | 'spelling' | 'case' | 'protected-token';

export interface ListingTitleCorrection {
  kind: ListingTitleCorrectionKind;
  before: string;
  after: string;
}

export interface ListingTitleNormalization {
  value: string;
  changed: boolean;
  corrections: ListingTitleCorrection[];
}

type ProtectedRule = {
  pattern: RegExp;
  canonical: string | ((match: string, ...groups: string[]) => string);
};

const DEFAULT_PROTECTED_PHRASES = [
  'TP. Hồ Chí Minh',
  'Thủ Dầu Một',
  'Bình Dương',
  'Bình Phước',
  'Đồng Nai',
  'Dĩ An',
  'Thuận An',
  'Bến Cát',
  'Tân Uyên',
  'Chơn Thành',
  'Đồng Xoài',
  'An Phú',
  'Minh Hưng',
  'Lái Thiêu',
  'Hưng Định',
  'Chợ Búng',
  'Bình Chuẩn',
  'Tân Khai',
  'Nguyễn Chí Thanh',
  'Nguyễn Văn Linh',
  'Lê Phong',
  'Lê Duẩn',
  'TP. Đồng Nai',
  'Becamex',
] as const;

const FIXED_PROTECTED_RULES: ProtectedRule[] = [
  { pattern: /\bTP\s*\.\s*HCM\b/giu, canonical: 'TP.HCM' },
  { pattern: /\bBĐS\b/giu, canonical: 'BĐS' },
  { pattern: /\bPCCC\b/giu, canonical: 'PCCC' },
  { pattern: /\bSHR\b/giu, canonical: 'SHR' },
  { pattern: /\bKCN\b/giu, canonical: 'KCN' },
  { pattern: /\bKDC\b/giu, canonical: 'KDC' },
  { pattern: /\bQL\s*([0-9]+)\b/giu, canonical: (_match, number) => `QL${number}` },
  { pattern: /\b(?:PN|WC|DT)\b/giu, canonical: match => match.toLocaleUpperCase('vi-VN') },
  // Token pha chữ+số thường là mã đường, quốc lộ, diện tích hoặc giá rút gọn.
  { pattern: /\b(?=[\p{L}\p{N}.]*\p{L})(?=[\p{L}\p{N}.]*\p{N})[\p{L}\p{N}.]+\b/gu, canonical: match => match },
];

const SAFE_TYPO_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /(?<!\p{L})sổ\s+h[oòóỏõọ]ng(?!\p{L})/giu, replacement: 'sổ hồng' },
  { pattern: /(?<!\p{L})chính\s+chũ(?!\p{L})/giu, replacement: 'chính chủ' },
  { pattern: /(?<!\p{L})phòng\s+ngũ(?!\p{L})/giu, replacement: 'phòng ngủ' },
  { pattern: /(?<!\p{L})măt\s+tiền(?!\p{L})/giu, replacement: 'mặt tiền' },
  { pattern: /(?<!\p{L})thổ\s+cử(?!\p{L})/giu, replacement: 'thổ cư' },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function record(
  corrections: ListingTitleCorrection[],
  kind: ListingTitleCorrectionKind,
  before: string,
  after: string,
): string {
  if (before !== after) corrections.push({ kind, before, after });
  return after;
}

function uniqueProtectedPhrases(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values
    .map(value => value.normalize('NFC').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .filter(value => {
      const key = value.toLocaleLowerCase('vi-VN');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function protectTitleParts(value: string, protectedPhrases: readonly string[]) {
  let markerCode = 0xe000;
  while (value.includes(String.fromCharCode(markerCode))) markerCode += 1;
  const marker = String.fromCharCode(markerCode);
  const protectedValues: string[] = [];
  let text = value;

  const add = (canonical: string) => {
    const index = protectedValues.push(canonical) - 1;
    return `${marker}${index}${marker}`;
  };

  for (const phrase of uniqueProtectedPhrases([...DEFAULT_PROTECTED_PHRASES, ...protectedPhrases])) {
    text = text.replace(new RegExp(escapeRegExp(phrase), 'giu'), () => add(phrase));
  }
  for (const rule of FIXED_PROTECTED_RULES) {
    text = text.replace(rule.pattern, (match, ...args: string[]) => {
      const canonical = typeof rule.canonical === 'function'
        ? rule.canonical(match, ...args)
        : rule.canonical;
      return add(canonical);
    });
  }

  return {
    text,
    marker,
    restore(input: string) {
      return input.replace(new RegExp(`${marker}(\\d+)${marker}`, 'g'), (_match, index) => protectedValues[Number(index)] ?? '');
    },
  };
}

function sentenceCase(value: string, capitalizeStart: boolean): string {
  const lowered = value.toLocaleLowerCase('vi-VN');
  if (!capitalizeStart) return lowered;
  const index = lowered.search(/\p{L}/u);
  if (index < 0) return lowered;
  const first = lowered[index].toLocaleUpperCase('vi-VN');
  return `${lowered.slice(0, index)}${first}${lowered.slice(index + 1)}`;
}

export function normalizeListingTitle(
  rawValue: string,
  protectedPhrases: readonly string[] = [],
): ListingTitleNormalization {
  const corrections: ListingTitleCorrection[] = [];
  const original = String(rawValue ?? '');
  let value = original.normalize('NFC');

  value = record(corrections, 'spacing', value, value.trim().replace(/\s+/g, ' '));
  const protectedTitle = protectTitleParts(value, protectedPhrases);
  value = protectedTitle.text;

  for (const rule of SAFE_TYPO_RULES) {
    value = record(corrections, 'spelling', value, value.replace(rule.pattern, rule.replacement));
  }

  let punctuation = value
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:!?])(?=[\p{L}\p{N}])/gu, '$1 ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/(?:\s+[–—-]\s*|\s*[–—-]\s+)/g, ' - ')
    .replace(/([!?.,])\1+/g, '$1')
    .replace(/(\d),\s+(\d)/g, '$1,$2')
    .replace(/\s+/g, ' ')
    .trim();
  value = record(corrections, 'punctuation', value, punctuation);

  const firstLetterIndex = value.search(/\p{L}/u);
  const firstProtectedIndex = value.indexOf(protectedTitle.marker);
  const capitalizeStart = firstProtectedIndex < 0 || (firstLetterIndex >= 0 && firstLetterIndex < firstProtectedIndex);
  const cased = sentenceCase(value, capitalizeStart);
  value = record(corrections, 'case', value, cased);
  const restored = protectedTitle.restore(value);
  const finalPunctuation = restored
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:!?])(?=[\p{L}\p{N}])/gu, '$1 ')
    .replace(/(\d),\s+(\d)/g, '$1,$2')
    .replace(/\s+/g, ' ')
    .trim();
  value = record(corrections, 'protected-token', value, finalPunctuation);

  return {
    value,
    changed: value !== original,
    corrections,
  };
}
