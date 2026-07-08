'use client';
import { useState, useEffect, createContext, useContext } from 'react';
import { getAllSiteContent, getSiteSettings } from './api';

type CmsData = {
  content: Record<string, Record<string, string>>;
  settings: Record<string, string>;
  loading: boolean;
};

const CmsContext = createContext<CmsData>({ content: {}, settings: {}, loading: true });

export function CmsProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<Record<string, Record<string, string>>>({});
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAllSiteContent(), getSiteSettings()])
      .then(([c, s]) => { setContent(c); setSettings(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return <CmsContext.Provider value={{ content, settings, loading }}>{children}</CmsContext.Provider>;
}

export function useCms() {
  return useContext(CmsContext);
}

export function useContent(section: string): Record<string, string> {
  const { content } = useCms();
  return content[section] ?? {};
}

export function useSetting(key: string, fallback = ''): string {
  const { settings } = useCms();
  return settings[key] ?? fallback;
}
