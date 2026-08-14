import type { VideoMedia } from '../lib/videoMedia';
import { youtubeEmbedUrl } from '../lib/videoMedia';

interface RichVideoProps {
  video: VideoMedia;
  className?: string;
}

// Player chỉ nhận VideoMedia đã parse. Không nhận URL/iframe thô từ nội dung CMS.
export function RichVideo({ video, className = '' }: RichVideoProps) {
  return (
    <div className={`my-6 overflow-hidden rounded-xl border border-gray-200 bg-black shadow-sm ${className}`}>
      <div className="relative aspect-video">
        {video.kind === 'youtube' ? (
          <iframe
            src={youtubeEmbedUrl(video)}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            title={video.title}
          />
        ) : (
          <video
            src={video.src}
            poster={video.poster}
            controls
            className="h-full w-full object-contain"
            preload="metadata"
          >
            Trình duyệt của bạn không hỗ trợ video HTML5.
          </video>
        )}
      </div>
    </div>
  );
}
