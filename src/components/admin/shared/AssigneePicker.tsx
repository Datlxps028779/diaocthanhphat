import { useState, useRef, useEffect } from 'react';
import { UserPlus, X, Check, Users } from 'lucide-react';
import { memberLabel, type TeamMember, type Assignee } from '../../../lib/leadAssignment';

interface Props {
  assignees: Assignee[];               // NV đang phụ trách (đã resolve nhãn)
  roster: TeamMember[];                // danh sách chọn thêm
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
  disabled?: boolean;
  compact?: boolean;                   // true = gọn cho card danh sách; false = đầy đủ cho drawer
}

// Chọn nhiều NV cùng phụ trách 1 lead: chip NV hiện tại (gỡ được) + dropdown thêm.
// RLS ở DB quyết ai được thêm/gỡ; component chỉ phát sự kiện.
export function AssigneePicker({ assignees, roster, onAdd, onRemove, disabled, compact }: Props) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const assignedIds = new Set(assignees.map(a => a.id));

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Users className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-gray-400 flex-shrink-0`} />
        {assignees.length === 0 && <span className="text-xs text-gray-400">Chưa gán</span>}
        {assignees.map(a => (
          <span key={a.id} className="inline-flex items-center gap-1 bg-red-50 text-red-700 rounded-full pl-2 pr-1 py-0.5 text-[11px] font-medium">
            {a.label}
            {!disabled && (
              <button type="button" onClick={() => onRemove(a.id)} aria-label={`Gỡ ${a.label}`}
                className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
            )}
          </span>
        ))}
        {!disabled && (
          <button type="button" onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-red-600 border border-dashed border-gray-300 hover:border-red-400 rounded-full px-2 py-0.5 transition-colors">
            <UserPlus className="w-3 h-3" />Thêm NV
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {roster.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">Chưa có nhân viên nào.</p>
            ) : (
              roster.map(m => {
                const on = assignedIds.has(m.id);
                return (
                  <button type="button" key={m.id}
                    onClick={() => { on ? onRemove(m.id) : onAdd(m.id); }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 transition-colors">
                    <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">{memberLabel(m)}</span>
                    <span className="text-[10px] text-gray-400">{m.role === 'admin' ? 'QT' : 'NV'}</span>
                    {on && <Check className="w-4 h-4 text-red-600 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
