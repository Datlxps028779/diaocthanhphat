import { useState, useEffect } from 'react';
import { X, Users, Phone } from 'lucide-react';

const AREAS = ['Dầu Tiếng', 'Bến Cát', 'Thủ Dầu Một', 'Dĩ An', 'Thuận An', 'Bình Dương'];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function SocialProofToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [isViewing, setIsViewing] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const show = () => {
      const isView = Math.random() > 0.4;
      setIsViewing(isView);
      if (isView) {
        const count = randomInt(3, 15);
        setMessage(`${count} người đang xem trang này ngay bây giờ`);
      } else {
        const area = AREAS[randomInt(0, AREAS.length - 1)];
        setMessage(`Khách hàng vừa liên hệ về BĐS tại ${area}`);
      }
      setVisible(true);
      timeout = setTimeout(() => {
        setVisible(false);
        timeout = setTimeout(show, randomInt(18000, 35000));
      }, 5000);
    };

    timeout = setTimeout(show, randomInt(6000, 12000));
    return () => clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-4 z-50 animate-in slide-in-from-left-4 duration-300">
      <div className="bg-white rounded-xl shadow-xl border border-gray-100 px-4 py-3 flex items-center gap-3 max-w-[260px]">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isViewing ? 'bg-blue-100' : 'bg-emerald-100'}`}>
          {isViewing
            ? <Users className="w-4 h-4 text-blue-600" />
            : <Phone className="w-4 h-4 text-emerald-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-800 text-xs font-medium leading-snug">{message}</p>
          <p className="text-gray-400 text-[10px] mt-0.5">vừa xong</p>
        </div>
        <button onClick={() => setVisible(false)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
