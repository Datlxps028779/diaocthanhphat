export type AdminTab = 'dashboard' | 'properties' | 'leads' | 'user-listings' | 'projects' | 'news' | 'testimonials' | 'cms' | 'settings' | 'banners' | 'featured-sections' | 'page-builder' | 'pages' | 'backup' | 'ai-analytics';

export interface AdminPanelProps { onLogout: () => void; initialTab?: string; }
