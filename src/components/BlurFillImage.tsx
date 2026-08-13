import { FALLBACK_PROPERTY_IMAGE } from '../lib/propertyImages';
import { SafeImage } from './SafeImage';

// Hiển thị trọn ảnh (object-contain, không cắt) với phần trống được lấp bằng chính
// ảnh đó phóng to + làm mờ. Cả hai lớp dùng cùng fallback để URL lỗi không tạo ô vỡ.
export function BlurFillImage({
  src,
  alt,
  sizes,
  priority = false,
  hover = true,
  wrapperClassName = '',
  objectFit = 'contain',
  fallbackSrc = FALLBACK_PROPERTY_IMAGE,
}: {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  hover?: boolean;
  wrapperClassName?: string;
  objectFit?: 'contain' | 'cover';
  fallbackSrc?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-gray-100 ${wrapperClassName}`}>
      <SafeImage
        src={src}
        fallbackSrc={fallbackSrc}
        alt=""
        aria-hidden
        fill
        sizes={sizes}
        className="object-cover scale-110 blur-2xl"
      />
      <SafeImage
        src={src}
        fallbackSrc={fallbackSrc}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={`relative ${objectFit === 'cover' ? 'object-cover' : 'object-contain'}${
          hover ? ' group-hover:scale-105 transition-transform duration-500' : ''
        }`}
      />
    </div>
  );
}
