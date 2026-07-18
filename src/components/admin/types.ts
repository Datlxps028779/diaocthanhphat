export type AdminTab = 'dashboard' | 'properties' | 'leads' | 'chat-sessions' | 'nurture' | 'user-listings' | 'users' | 'staff' | 'projects' | 'news' | 'testimonials' | 'cms' | 'settings' | 'banners' | 'featured-sections' | 'page-builder' | 'pages' | 'backup' | 'ai-analytics' | 'seo-geo';

export interface AdminPanelProps { onLogout: () => void; initialTab?: string; role: 'user' | 'staff' | 'admin'; }
