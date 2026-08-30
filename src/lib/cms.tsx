'use client';
import { useState, useEffect, createContext, useContext } from 'react';
import { getAllSiteContent, getSiteSettings, getMenuItems } from './api';
import type { MenuItem } from './supabase';
import { settingFallback } from './siteBrandDefaults';

type CmsData = {
  content: Record<string, Record<string, string>>;
  settings: Record<string, string>;
  menu: MenuItem[];
  loading: boolean;
};

const CmsContext = createContext<CmsData>({ content: {}, settings: {}, menu: [], loading: true });

export function CmsProvider({ children, initialSettings = {} }: { children: React.ReactNode; initialSettings?: Record<string, string> }) {
  const [content, setContent] = useState<Record<string, Record<string, string>>>({});
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAllSiteContent(), getSiteSettings(), getMenuItems().catch(() => [])])
      .then(([c, s, m]) => { setContent(c); setSettings(s); setMenu(m); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return <CmsContext.Provider value={{ content, settings, menu, loading }}>{children}</CmsContext.Provider>;
}

export function useCms() {
  return useContext(CmsContext);
}

export function useMenu(): MenuItem[] {
  return useContext(CmsContext).menu;
}

export function useContent(section: string): Record<string, string> {
  const { content } = useCms();
  return content[section] ?? {};
}

export function useSetting(key: string, fallback = ''): string {
  const { settings } = useCms();
  return settings[key] ?? settingFallback(key, fallback);
}
