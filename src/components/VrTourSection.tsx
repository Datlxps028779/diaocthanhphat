import { useState } from 'react';
import { Glasses, ExternalLink, Play, X } from 'lucide-react';

interface VrTourSectionProps {
  vrTourUrl: string | null;
}

export function VrTourSection({ vrTourUrl }: VrTourSectionProps) {
  const [open, setOpen] = useState(false);

  if (!vrTourUrl) return null;

  const embedUrl = normalizeEmbedUrl(vrTourUrl);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <Glasses className="w-4 h-4 text-red-500" />
            Tham quan thực tế 360°
          </h2>
          <a href={vrTourUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs text-red-600 hover:underline font-medium">
            <ExternalLink className="w-3 h-3" />Mở rộng
          </a>
        </div>

        {!open ? (
          <div className="relative bg-gray-900 rounded-xl overflow-hidden cursor-pointer group"
            onClick={() => setOpen(true)}>
            <div className="h-40 flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <Play className="w-6 h-6 text-white ml-0.5" />
              </div>
              <p className="text-white text-sm font-medium">Bấm để xem tour ảo 360°</p>
              <p className="text-gray-400 text-xs">Trải nghiệm không gian thực tế ngay trên trình duyệt</p>
            </div>
          </div>
        ) : (
          <div className="relative">
            <button onClick={() => setOpen(false)}
              className="absolute top-2 right-2 z-10 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
            <iframe
              src={embedUrl}
              className="w-full h-72 rounded-xl border-0"
              allow="fullscreen; vr; gyroscope; accelerometer"
              allowFullScreen
              title="VR Tour 360°"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeEmbedUrl(url: string): string {
  if (url.includes('kuula.co') && !url.includes('/e/')) {
    return url.replace('kuula.co/post/', 'kuula.co/e/').replace('kuula.co/share/', 'kuula.co/e/');
  }
  if (url.includes('panoee.com') && !url.includes('/embed/')) {
    return url.replace('panoee.com/tour/', 'panoee.com/embed/tour/');
  }
  return url;
}
