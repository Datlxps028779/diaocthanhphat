import { useState, useMemo } from 'react';
import { Calculator, ChevronDown, ChevronUp, Info } from 'lucide-react';

interface LoanCalculatorProps {
  propertyPrice: number;
  priceUnit: string;
}

const BANK_RATES = [
  { name: 'Vietcombank', rate: 8.5 },
  { name: 'BIDV', rate: 8.7 },
  { name: 'Vietinbank', rate: 8.9 },
  { name: 'Techcombank', rate: 9.5 },
  { name: 'MB Bank', rate: 9.8 },
];

function formatVND(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' tỷ';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' triệu';
  return n.toLocaleString('vi-VN') + ' đ';
}

export function LoanCalculator({ propertyPrice, priceUnit }: LoanCalculatorProps) {
  const [open, setOpen] = useState(false);
  const [loanPct, setLoanPct] = useState(70);
  const [years, setYears] = useState(20);
  const [selectedBank, setSelectedBank] = useState(0);

  const priceInVND = useMemo(() => {
    if (priceUnit === 'tỷ') return propertyPrice * 1e9;
    if (priceUnit === 'triệu') return propertyPrice * 1e6;
    return propertyPrice;
  }, [propertyPrice, priceUnit]);

  const { loanAmount, monthlyPayment, transferFee, registrationFee, totalCost } = useMemo(() => {
    const loan = priceInVND * (loanPct / 100);
    const r = BANK_RATES[selectedBank].rate / 100 / 12;
    const n = years * 12;
    const monthly = r === 0 ? loan / n : loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    const transfer = priceInVND * 0.02;
    const registration = priceInVND * 0.005;
    return {
      loanAmount: loan,
      monthlyPayment: monthly,
      transferFee: transfer,
      registrationFee: registration,
      totalCost: priceInVND + transfer + registration,
    };
  }, [priceInVND, loanPct, years, selectedBank]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-red-500" />
          <span className="font-bold text-gray-900 text-sm">Tính lãi vay & Chi phí</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
          <div className="pt-3">
            <label className="text-xs font-semibold text-gray-700 block mb-2">
              Tỷ lệ vay: <span className="text-red-600">{loanPct}%</span>
              <span className="text-gray-400 font-normal ml-1">({formatVND(loanAmount)})</span>
            </label>
            <input type="range" min={10} max={90} step={5} value={loanPct}
              onChange={e => setLoanPct(Number(e.target.value))}
              className="w-full accent-red-500" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>10%</span><span>90%</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-2">
              Thời hạn: <span className="text-red-600">{years} năm</span>
            </label>
            <div className="grid grid-cols-4 gap-1">
              {[10, 15, 20, 25].map(y => (
                <button key={y} onClick={() => setYears(y)}
                  className={`py-1.5 text-xs rounded-lg border transition-colors ${years === y ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-600 hover:border-red-300'}`}>
                  {y}n
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-2">Ngân hàng</label>
            <select value={selectedBank} onChange={e => setSelectedBank(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400">
              {BANK_RATES.map((b, i) => (
                <option key={b.name} value={i}>{b.name} — {b.rate}%/năm</option>
              ))}
            </select>
          </div>

          <div className="bg-red-50 rounded-xl p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Trả hàng tháng</span>
              <span className="font-black text-red-600 text-sm">{formatVND(monthlyPayment)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Lệ phí trước bạ (0.5%)</span>
              <span className="font-medium text-gray-700">{formatVND(registrationFee)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Phí chuyển nhượng (2%)</span>
              <span className="font-medium text-gray-700">{formatVND(transferFee)}</span>
            </div>
            <div className="border-t border-red-200 pt-2 flex justify-between text-xs">
              <span className="font-semibold text-gray-700">Tổng chi phí ước tính</span>
              <span className="font-black text-gray-900">{formatVND(totalCost)}</span>
            </div>
          </div>

          <div className="flex items-start gap-1.5 text-[10px] text-gray-400">
            <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>Số liệu mang tính tham khảo. Lãi suất thực tế theo từng ngân hàng.</span>
          </div>
        </div>
      )}
    </div>
  );
}
