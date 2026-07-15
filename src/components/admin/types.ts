export type AdminTab = 'dashboard' | 'properties' | 'leads' | 'chat-sessions' | 'user-listings' | 'users' | 'staff' | 'projects' | 'news' | 'testimonials' | 'cms' | 'settings' | 'banners' | 'featured-sections' | 'page-builder' | 'pages' | 'backup' | 'ai-analytics';

export interface AdminPanelProps { onLogout: () => void; initialTab?: string; role: 'user' | 'staff' | 'admin'; }
