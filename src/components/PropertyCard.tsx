import { MapPin, Phone, ChevronRight, Eye, Flame, Sparkles } from 'lucide-react';
import { type Property } from '../lib/supabase';

const badgeColors: Record<string, string> = {
  red:    'bg-red-500',
  green:  'bg-emerald-500',
  orange: 'bg-orange-500',
  blue:   'bg-blue-500',
  purple: 'bg-violet-500',
  teal:   'bg-teal-500',
};

interface PropertyCardProps {
  property: Property;
  onContact: (property: Property) => void;
  onClick?: () => void;
}

export function PropertyCard({ property, onContact, onClick }: PropertyCardProps) {
  const badgeCls = badgeColors[property.badge_color ?? 'red'] ?? 'bg-red-500';
  const isRent = property.listing_type === 'cho_thue';

  return (
    <div
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 flex flex-col cursor-pointer"
      onClick={onClick}
    >
      <div className="relative overflow-hidden">
        <img
          src={property.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'}
          alt={property.title}
          className="w-full h-52 object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Badges */}
        {property.badge ? (
          <span className={`absolute top-3 left-3 ${badgeCls} text-white text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide`}>
            {property.badge}
          </span>
        ) : property.is_hot ? (
          <span className="absolute top-3 left-3 bg-orange-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            <Flame className="w-2.5 h-2.5" />HOT
          </span>
        ) : property.is_featured ? (
          <span className="absolute top-3 left-3 bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />Nổi bật
          </span>
        ) : null}

        {/* Listing type */}
        {isRent && (
          <span className="absolute top-3 right-3 bg-blue-600/90 text-white text-[9px] font-bold px-2 py-0.5 rounded">
            Cho thuê
          </span>
        )}

        {/* View count */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 text-white/80 text-[10px] bg-black/30 px-1.5 py-0.5 rounded">
          <Eye className="w-2.5 h-2.5" />{property.views ?? 0}
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-2 line-clamp-2 group-hover:text-red-600 transition-colors">
          {property.title}
        </h3>
        <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-3">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
          <span className="truncate">{property.district ? `${property.district}, ` : ''}{property.city}</span>
        </div>
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
          <div>
            <p className="text-red-600 font-bold text-base leading-tight">
              {property.price_label ?? `${property.price} ${property.price_unit}`}
            </p>
            {property.area_sqm && (
              <p className="text-gray-400 text-xs mt-0.5">{property.area_sqm} m²</p>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); onContact(property); }}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
          >
            <Phone className="w-3 h-3" />Liên hệ
          </button>
        </div>
        {property.legal_status && (
          <p className="text-xs text-emerald-600 font-medium mt-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            {property.legal_status}
          </p>
        )}
      </div>
    </div>
  );
}

interface SectionHeaderProps {
  badge?: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}

export function SectionHeader({ badge, title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-8">
      <div>
        {badge && (
          <span className="text-red-600 text-xs font-bold tracking-widest uppercase block mb-2 flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-red-500 inline-block rounded" />
            {badge}
          </span>
        )}
        <h2 className="text-2xl md:text-3xl font-black text-gray-900 leading-tight">{title}</h2>
        {subtitle && <p className="text-gray-500 mt-1.5 text-sm">{subtitle}</p>}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="flex items-center gap-1 text-red-600 hover:text-red-700 font-semibold text-sm whitespace-nowrap group"
        >
          {action.label}
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}
    </div>
  );
}
