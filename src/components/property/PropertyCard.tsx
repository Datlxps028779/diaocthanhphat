import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';
import { ArrowUpRight, Phone } from 'lucide-react';
import { buildPropertyCardModel, type PropertyCardSource, type PublicCardPoster } from '../../lib/propertyCardModel';
import { normalizePublicHref } from '../../lib/siteUrl';
import { PropertyGallery } from '../PropertyGallery';
import { VerifiedBadge } from '../VerifiedBadge';
import { SafeImage } from '../SafeImage';
import styles from './PropertyCard.module.css';

export type PropertyCardProps = {
  property: PropertyCardSource;
  href?: string;
  variant?: 'grid' | 'list' | 'compact' | 'locality';
  onResultClick?: MouseEventHandler<HTMLAnchorElement>;
  onContact?: () => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  mediaActions?: ReactNode;
  extraActions?: ReactNode;
  note?: ReactNode;
  poster?: PublicCardPoster | null;
};

export function PropertyCard({ property, href, variant = 'grid', onResultClick, onContact, isFavorited, onToggleFavorite, mediaActions, extraActions, note, poster }: PropertyCardProps) {
  const model = buildPropertyCardModel(property, poster);
  const target = normalizePublicHref(href) || model.href;
  const galleryProperty = {
    id: property.id, title: model.title,
    image_url: model.images[0] ?? null, images: model.images,
    ward: property.ward ?? null, district: property.district ?? null, city: property.city ?? '',
    listing_type: property.listing_type === 'cho_thue' ? 'cho_thue' as const : 'mua_ban' as const,
    property_types: null,
  };
  return <article className={`${styles.card} ${styles[variant]}`} data-testid="property-card" data-property-id={model.id}>
    <PropertyGallery property={galleryProperty} href={target} publicCard mobileList={variant === 'grid' || variant === 'locality'} singleImage={variant === 'locality'}
      className={styles.media} onLinkClick={onResultClick}
      isFavorited={isFavorited} onToggleFavorite={onToggleFavorite}
      topLeft={<div className={styles.badges}>
        <span>{model.typeLabel}</span><span>{model.transaction}</span>
        {property.badge?.trim() ? <span>{property.badge}</span> : property.is_hot ? <span>Tin nổi bật</span> : property.is_featured ? <span>Nổi bật</span> : null}
      </div>}
      topRight={mediaActions}
      bottomLeft={<div className={styles.verification}><VerifiedBadge property={{ ...property, is_verified: property.is_verified ?? false }} /></div>}
    />
    <div className={styles.body}>
      <h3 className={styles.title}><Link href={target} onClick={onResultClick} title={model.title}>{model.title}</Link></h3>
      <div className={styles.mobileVerification}><VerifiedBadge property={{ ...property, is_verified: property.is_verified ?? false }} /></div>
      <div className={styles.prices}>
        <p className={styles.price}>{model.price}</p><p className={styles.area}>{model.areaLabel}</p>
        {model.pricePerSqm && <p className={styles.unitPrice}>{model.pricePerSqm}</p>}
      </div>
      <p className={styles.address} title={model.address}>{model.address}</p>
      <ul className={styles.specs}>{model.roomLabels.map(label => <li key={label}>{label}</li>)}<li><span className="sr-only">Pháp lý: </span>{model.legalLabel}</li></ul>
      {note && <div className={styles.note}>{note}</div>}
      <div className={styles.footer} data-testid="property-card-footer">
        <div className={styles.identity}>
          <div className={styles.poster} data-testid="property-card-poster">
            <div className={styles.avatar} aria-hidden="true">{model.poster.avatarUrl
              ? <SafeImage src={model.poster.avatarUrl} alt="" width={32} height={32} className="h-full w-full object-cover" />
              : model.poster.identified ? model.poster.name.split(/\s+/).slice(-2).map(word => word[0]).join('') : '?'}</div>
            <div className={styles.posterText}><span className="sr-only">Người đăng: </span>
              {model.poster.href ? <Link href={model.poster.href} className={styles.posterName}>{model.poster.name}</Link> : <p className={styles.posterName}>{model.poster.name}</p>}
            </div>
          </div>
          <div className={styles.dateRow}>
            {model.postedAt ? <time dateTime={model.postedAt}>{model.postedLabel}</time> : <span>{model.postedLabel}</span>}
          </div>
        </div>
        <div className={styles.actions}>
          <Link href={target} onClick={onResultClick} title="Chi tiết" aria-label={`Chi tiết: ${model.title}`}><ArrowUpRight size={20} aria-hidden="true" /></Link>
          {onContact && <button type="button" onClick={onContact} className={styles.contact} title="Liên hệ" aria-label={`Liên hệ: ${model.title}`}><Phone size={18} aria-hidden="true" /></button>}
          {extraActions}
        </div>
      </div>
    </div>
  </article>;
}
