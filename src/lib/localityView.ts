import type { LocalityPageContext } from './localityPageContext';

export type LocalityNavigationTab = {
  id: 'listings' | 'news' | 'report';
  label: string;
  href?: string;
  active: boolean;
  disabled?: boolean;
  note?: string;
};

export function localityListingsPath(context: Pick<LocalityPageContext, 'listingType' | 'areaSlug' | 'landingPath'>): string {
  if (context.listingType) return context.landingPath;
  return `/mua-ban/${context.areaSlug}`;
}

export function buildLocalityNavigation(
  context: Pick<LocalityPageContext, 'path' | 'listingType' | 'areaSlug' | 'landingPath' | 'reportPath'>,
  options: { newsPath?: string | null } = {},
): LocalityNavigationTab[] {
  const listingsPath = localityListingsPath(context);
  return [
    {
      id: 'listings',
      label: 'Tin đăng',
      href: listingsPath,
      active: context.path === listingsPath,
    },
    {
      id: 'news',
      label: 'Tin tức',
      href: options.newsPath ?? undefined,
      active: Boolean(options.newsPath && context.path === options.newsPath),
      disabled: !options.newsPath,
      note: options.newsPath ? undefined : 'Chưa đủ dữ liệu khu vực',
    },
    {
      id: 'report',
      label: 'Báo cáo dữ liệu',
      href: context.reportPath,
      active: context.path === context.reportPath,
    },
  ];
}
