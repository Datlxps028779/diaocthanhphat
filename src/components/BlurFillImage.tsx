import Image from 'next/image';

// Hiển thị trọn ảnh (object-contain, không cắt) với phần trống được lấp bằng chính
// ảnh đó phóng to + làm mờ. Nhờ vậy ảnh ngang/dọc/vuông đều đẹp và nhất quán,
// không bị cắt mép (cover) cũng không để lộ dải xám (contain).
export function BlurFillImage({
  src,
  alt,
  sizes,
  priority = false,
  hover = true,
  wrapperClassName = '',
  objectFit = 'contain',
}: {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  hover?: boolean;
  wrapperClassName?: string;
  objectFit?: 'contain' | 'cover';
}) {
  return (
    <div className={`relative overflow-hidden bg-gray-100 ${wrapperClassName}`}>
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        sizes={sizes}
        className="object-cover scale-110 blur-2xl"
      />
      <Image
        src={src}
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
