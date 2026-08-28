import { formatPriceInput } from '../lib/listingPrice';

type PriceFieldProps = {
  mode: 'sale' | 'rent';
  value: string;
  unit: string;
  onChange: (value: string) => void;
  onUnitChange: (unit: string) => void;
  error?: string;
  id?: string;
};

export function PriceField({ mode, value, unit, onChange, onUnitChange, error, id = 'listing-price' }: PriceFieldProps) {
  const isRent = mode === 'rent';
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={event => onChange(formatPriceInput(event.target.value))}
          placeholder={isRent ? 'Ví dụ: 8 hoặc 8,5' : 'Ví dụ: 1,500 hoặc 1,5'}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 ${error ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
        />
        {isRent ? (
          <div className="flex min-h-12 items-center rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-600 sm:min-w-[150px]">triệu/tháng</div>
        ) : (
          <select
            value={unit}
            onChange={event => onUnitChange(event.target.value)}
            aria-label="Đơn vị giá"
            className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400 sm:w-32"
          >
            <option value="tỷ">tỷ</option>
            <option value="triệu">triệu</option>
          </select>
        )}
      </div>
      <p className="mt-1.5 text-xs text-gray-400">Dùng dấu chấm hoặc dấu phẩy cho phần thập phân, ví dụ 1.5 hoặc 1,5.</p>
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
