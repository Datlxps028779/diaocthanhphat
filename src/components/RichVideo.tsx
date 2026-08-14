'use client';

import { useState } from 'react';
import type { VideoMedia } from '../lib/videoMedia';
import { youtubeEmbedUrl } from '../lib/videoMedia';

interface RichVideoProps {
  video: VideoMedia;
  className?: string;
}

// Player chỉ nhận VideoMedia đã parse. Không nhận URL/iframe thô từ nội dung CMS.
// Upload có tỷ lệ lấy từ metadata trình duyệt lúc chèn; fallback 16:9 cho dữ liệu cũ.
export function RichVideo({ video, className = '' }: RichVideoProps) {
  const [ready, setReady] = useState(video.kind === 'youtube');
  const ratio = video.kind === 'upload' ? (video.aspectRatio ?? 16 / 9) : 16 / 9;

  return (
    <div className={`my-6 overflow-hidden rounded-xl border border-gray-200 bg-black shadow-sm ${className}`}>
      <div className="relative" style={{ aspectRatio: String(ratio) }}>
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
          <>
            {!ready && <div className="absolute inset-0 z-10 grid place-items-center bg-gray-950 text-xs text-gray-200">Đang tải video...</div>}
            <video
              src={video.src}
              poster={video.poster}
              controls
              className="h-full w-full object-contain"
              preload="metadata"
              onLoadedMetadata={() => setReady(true)}
              onError={() => setReady(true)}
            >
              Trình duyệt của bạn không hỗ trợ định dạng video này.
            </video>
          </>
        )}
      </div>
    </div>
  );
}
