export type AdminTab = 'dashboard' | 'properties' | 'property-verification' | 'leads' | 'chat-sessions' | 'nurture' | 'user-listings' | 'users' | 'staff' | 'projects' | 'news' | 'news-categories' | 'testimonials' | 'cms' | 'settings' | 'footer' | 'banners' | 'featured-sections' | 'page-builder' | 'home-experience' | 'pages' | 'neighborhoods' | 'menu' | 'backup' | 'ai-analytics' | 'google-analytics' | 'ai-chat' | 'ai-rag' | 'seo-geo';

export interface AdminPanelProps { onLogout: () => void; initialTab?: string; role: 'user' | 'staff' | 'admin'; basePath?: string; }
