import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle, ExternalLink, Plus, Save, Trash2 } from 'lucide-react';
import type { SiteContent, SiteSetting } from '../../../lib/supabase';
import { adminGetAllSiteContent, adminGetAllSiteSettings, updateSiteContent, updateSiteSetting, upsertSiteSetting } from '../../../lib/api';
import { normalizePublicHref } from '../../../lib/siteUrl';

type QuickLink = { label: string; href: string };

const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { label: 'Trang chủ', href: '/' },
  { label: 'Mua bán BĐS', href: '/mua-ban' },
  { label: 'BĐS Cho thuê', href: '/cho-thue' },
  { label: 'Dự án', href: '/du-an' },
  { label: 'Đầu tư', href: '/dau-tu' },
  { label: 'Khu vực', href: '/khu-vuc' },
  { label: 'Tin tức', href: '/tin-tuc' },
  { label: 'Về chúng tôi', href: '/ve-chung-toi' },
  { label: 'Liên hệ', href: '/trang/lien-he' },
  { label: 'Điều khoản sử dụng', href: '/trang/dieu-khoan-su-dung' },
  { label: 'Chính sách bảo mật', href: '/trang/chinh-sach-bao-mat' },
  { label: 'Chính sách đăng tin', href: '/trang/chinh-sach-dang-tin' },
];

const FOOTER_SETTING_ORDER = [
  'site_logo_text', 'site_logo_sub', 'phone_main', 'email', 'address', 'footer_description',
  'footer_col3_sub1', 'footer_col3_sub2', 'footer_license',
];
const FOOTER_CONTENT_ORDER = ['col2_title', 'col3_title', 'col4_title', 'copyright'];

function parseQuickLinks(raw: string | null | undefined): QuickLink[] {
  if (!raw?.trim()) return DEFAULT_QUICK_LINKS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_QUICK_LINKS;
    const links = parsed
      .filter((x): x is QuickLink => x && typeof x.label === 'string' && typeof x.href === 'string' && x.label.trim() !== '' && x.href.trim() !== '')
      .map(x => ({ label: x.label.trim(), href: x.href.trim() }));
    return links.length ? links : DEFAULT_QUICK_LINKS;
  } catch {
    return DEFAULT_QUICK_LINKS;
  }
}

function FieldEditor({
  label,
  value,
  type,
  saving,
  saved,
  onChange,
  onSave,
}: {
  label: string;
  value: string;
  type: string;
  saving: boolean;
  saved: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const isLong = type === 'textarea' || value.length > 80;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label className="block text-xs font-bold text-gray-700 mb-1.5">{label}</label>
          {isLong ? (
            <textarea value={value} onChange={e => onChange(e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
          ) : (
            <input value={value} onChange={e => onChange(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          )}
        </div>
        <button onClick={onSave} disabled={saving}
          className={`mt-5 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${saved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-600 text-white hover:bg-red-700'}`}>
          {saving ? <div className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin" />
            : saved ? <CheckCircle className="w-3.5 h-3.5" />
            : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Đã lưu' : 'Lưu'}
        </button>
      </div>
    </div>
  );
}

export function FooterTab() {
  const [settings, setSettings] = useState<SiteSetting[]>([]);
  const [content, setContent] = useState<SiteContent[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [contentValues, setContentValues] = useState<Record<string, string>>({});
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(DEFAULT_QUICK_LINKS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([adminGetAllSiteSettings(), adminGetAllSiteContent()]).then(([s, c]) => {
      setSettings(s);
      setContent(c);
      const nextValues: Record<string, string> = {};
      s.forEach(item => { nextValues[item.key] = item.value ?? ''; });
      const nextContentValues: Record<string, string> = {};
      c.forEach(item => { nextContentValues[item.id] = item.value ?? ''; });
      setValues(nextValues);
      setContentValues(nextContentValues);
      setQuickLinks(parseQuickLinks(nextValues.footer_quick_links));
    }).finally(() => setLoading(false));
  }, []);

  const footerSettings = useMemo(() => settings
    .filter(s => (s.group_name === 'footer' || FOOTER_SETTING_ORDER.includes(s.key)) && s.key !== 'footer_quick_links')
    .sort((a, b) => {
      const ai = FOOTER_SETTING_ORDER.indexOf(a.key);
      const bi = FOOTER_SETTING_ORDER.indexOf(b.key);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }), [settings]);

  const footerContent = useMemo(() => content
    .filter(c => c.section === 'footer')
    .sort((a, b) => FOOTER_CONTENT_ORDER.indexOf(a.key) - FOOTER_CONTENT_ORDER.indexOf(b.key)), [content]);

  const markSaved = (key: string) => {
    setSaved(s => ({ ...s, [key]: true }));
    setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000);
  };

  const saveSetting = async (key: string) => {
    setSavingKey(key);
    try {
      await updateSiteSetting(key, values[key] ?? '');
      markSaved(key);
    } finally {
      setSavingKey(null);
    }
  };

  const saveContent = async (item: SiteContent) => {
    setSavingKey(item.id);
    try {
      await updateSiteContent(item.id, contentValues[item.id] ?? '');
      markSaved(item.id);
    } finally {
      setSavingKey(null);
    }
  };

  const saveQuickLinks = async () => {
    setSavingKey('footer_quick_links');
    try {
      await upsertSiteSetting({
        key: 'footer_quick_links',
        label: 'Liên kết nhanh footer',
        group_name: 'footer',
        type: 'textarea',
        value: JSON.stringify(quickLinks.map(link => ({
          label: link.label.trim(),
          href: normalizePublicHref(link.href),
        })).filter(l => l.label && l.href), null, 2),
      });
      markSaved('footer_quick_links');
    } finally {
      setSavingKey(null);
    }
  };

  const moveLink = (index: number, dir: -1 | 1) => {
    const next = [...quickLinks];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setQuickLinks(next);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900">Tùy biến Footer</h2>
          <p className="text-sm text-gray-500 mt-1">Sửa toàn bộ nội dung footer và quản lý danh sách liên kết hiển thị công khai.</p>
        </div>
        <button onClick={saveQuickLinks} disabled={savingKey === 'footer_quick_links'}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${saved.footer_quick_links ? 'bg-emerald-100 text-emerald-700' : 'bg-red-600 text-white hover:bg-red-700'}`}>
          {savingKey === 'footer_quick_links' ? <div className="w-4 h-4 border border-white/50 border-t-white rounded-full animate-spin" />
            : saved.footer_quick_links ? <CheckCircle className="w-4 h-4" />
            : <Save className="w-4 h-4" />}
          {saved.footer_quick_links ? 'Đã lưu liên kết' : 'Lưu liên kết'}
        </button>
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-gray-900">Liên kết nhanh</h3>
            <p className="text-xs text-gray-500 mt-0.5">Thêm, xóa, sửa và đổi thứ tự các link ở cột giữa footer.</p>
          </div>
          <button onClick={() => setQuickLinks(l => [...l, { label: 'Liên kết mới', href: '/' }])}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50">
            <Plus className="w-3.5 h-3.5" />Thêm link
          </button>
        </div>

        <div className="space-y-2">
          {quickLinks.map((link, index) => (
            <div key={`${index}-${link.href}`} className="grid gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-center">
              <input value={link.label} onChange={e => setQuickLinks(l => l.map((item, i) => i === index ? { ...item, label: e.target.value } : item))}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" placeholder="Tên hiển thị" />
              <input value={link.href} onChange={e => setQuickLinks(l => l.map((item, i) => i === index ? { ...item, href: e.target.value } : item))}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" placeholder="/trang/dieu-khoan-su-dung" />
              <div className="flex items-center gap-1.5">
                <button onClick={() => moveLink(index, -1)} disabled={index === 0} className="p-2 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button onClick={() => moveLink(index, 1)} disabled={index === quickLinks.length - 1} className="p-2 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <a href={link.href || '/'} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-red-600"><ExternalLink className="w-4 h-4" /></a>
                <button onClick={() => setQuickLinks(l => l.filter((_, i) => i !== index))} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-black text-gray-900">Thông tin footer</h3>
          <p className="text-xs text-gray-500 mt-0.5">Các trường này đang dùng trực tiếp ở footer công khai.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {footerSettings.map(setting => (
            <FieldEditor key={setting.key} label={setting.label} type={setting.type} value={values[setting.key] ?? ''}
              saving={savingKey === setting.key} saved={Boolean(saved[setting.key])}
              onChange={value => setValues(v => ({ ...v, [setting.key]: value }))}
              onSave={() => saveSetting(setting.key)} />
          ))}
          {footerContent.map(item => (
            <FieldEditor key={item.id} label={item.label} type={item.type} value={contentValues[item.id] ?? ''}
              saving={savingKey === item.id} saved={Boolean(saved[item.id])}
              onChange={value => setContentValues(v => ({ ...v, [item.id]: value }))}
              onSave={() => saveContent(item)} />
          ))}
        </div>
      </section>
    </div>
  );
}
