'use client';
import { useMemo, useRef, useState } from 'react';
import { Bot, Send, Sparkles, X, Phone, ExternalLink } from 'lucide-react';
import { type Page } from '../lib/router';
import { useAreas, useDistricts, usePropertyTypes, useWards } from '../lib/hooks/useTaxonomy';
import { buildAdvisorLeadPayload, buildAdvisorTurn, summarizePropertyForAdvisor, validateAdvisorLeadContact, type AdvisorMessage, type AdvisorPropertySummary, type AdvisorTurnResult } from '../lib/aiAdvisor';
import { getAllProperties } from '../lib/api/properties';
import { submitLead } from '../lib/api/leads';
import { track, EVENTS } from '../lib/analytics';

const EXAMPLES = [
  'Nhà Dĩ An dưới 3 tỷ sổ hồng',
  'Cho thuê căn hộ Thủ Dầu Một 5-10 triệu',
  'Đất nền Bến Cát trên 100m2 gần VSIP',
  'Tôi cần tư vấn pháp lý',
];

const GREETING: AdvisorMessage = {
  role: 'assistant',
  text: 'Em là Trợ lý BĐS. Anh/chị mô tả nhu cầu mua/thuê, em sẽ lọc tin phù hợp và có thể gửi thông tin cho tư vấn viên.',
};

export function AiSearchChat({ onNavigate }: { onNavigate?: (p: Page) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<AdvisorMessage[]>([GREETING]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AdvisorPropertySummary[]>([]);
  const [lastTurn, setLastTurn] = useState<AdvisorTurnResult | null>(null);
  const [leadFor, setLeadFor] = useState<AdvisorPropertySummary | null>(null);
  const [showGeneralLeadForm, setShowGeneralLeadForm] = useState(false);
  const [leadForm, setLeadForm] = useState({ full_name: '', phone: '', message: '' });
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadSent, setLeadSent] = useState(false);
  const [submittingLead, setSubmittingLead] = useState(false);
  const requestSeq = useRef(0);

  const { data: areas = [], isLoading: loadingAreas } = useAreas();
  const { data: propertyTypes = [], isLoading: loadingTypes } = usePropertyTypes();
  const { data: districts = [], isLoading: loadingDistricts } = useDistricts();
  const { data: wards = [], isLoading: loadingWards } = useWards();
  const taxonomyReady = !loadingAreas && !loadingTypes && !loadingDistricts && !loadingWards;
  const taxonomy = useMemo(() => ({ areas, districts, wards, propertyTypes }), [areas, districts, wards, propertyTypes]);

  const openPanel = () => {
    setOpen(v => {
      const next = !v;
      if (next) track(EVENTS.AI_ADVISOR_OPEN);
      return next;
    });
  };

  const send = async (raw = query) => {
    const text = raw.trim();
    if (!text || !taxonomyReady) return;
    const seq = ++requestSeq.current;
    setQuery('');
    setLeadFor(null);
    setShowGeneralLeadForm(false);
    setLeadError(null);
    setLeadSent(false);
    setMessages(prev => [...prev, { role: 'user', text }]);
    track(EVENTS.AI_ADVISOR_SEND, { hasText: true });

    const turn = buildAdvisorTurn(text, taxonomy);
    setLastTurn(turn);
    setResults([]);
    setMessages(prev => [...prev, { role: 'assistant', text: turn.reply, chips: turn.matched.map(m => m.label) }]);
    if (turn.stage === 'collecting_contact') setShowGeneralLeadForm(true);

    if (turn.stage !== 'showing_matches') return;

    setLoading(true);
    try {
      const res = await getAllProperties({ ...turn.filters, keyword: turn.residualKeyword || undefined, sort: 'relevance', page: 1, limit: 4 });
      if (seq !== requestSeq.current) return;
      const cards = res.data.map(summarizePropertyForAdvisor);
      setResults(cards);
      // Luôn cho phép để lại liên hệ sau khi gợi ý, kể cả khi đã có tin.
      setShowGeneralLeadForm(true);
      track(EVENTS.AI_ADVISOR_SUGGEST, { count: cards.length });
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: cards.length ? `Em tìm được ${cards.length} tin phù hợp nhất. Anh/chị có thể xem chi tiết, lọc toàn bộ kết quả hoặc gửi thông tin để tư vấn viên hỗ trợ.` : 'Hiện chưa có tin thật sự khớp. Anh/chị có thể nới khoảng giá/khu vực, bấm lọc toàn bộ kết quả hoặc để lại thông tin để tư vấn viên tìm giúp.',
      }]);
    } catch {
      if (seq !== requestSeq.current) return;
      setShowGeneralLeadForm(true);
      setMessages(prev => [...prev, { role: 'assistant', text: 'Em chưa tải được danh sách gợi ý lúc này. Anh/chị có thể bấm lọc toàn bộ kết quả hoặc để lại số điện thoại để tư vấn viên hỗ trợ.' }]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  };

  const navigateAll = () => {
    if (!lastTurn || !onNavigate) return;
    onNavigate({
      name: 'listings',
      listingType: lastTurn.filters.listingType === 'mua_ban' || lastTurn.filters.listingType === 'cho_thue' ? lastTurn.filters.listingType : undefined,
      areaId: lastTurn.filters.areaId,
      district: lastTurn.filters.district,
      ward: lastTurn.filters.ward,
      typeId: lastTurn.filters.typeId,
      keyword: lastTurn.residualKeyword || undefined,
      minPrice: lastTurn.filters.minPrice,
      maxPrice: lastTurn.filters.maxPrice,
      minArea: lastTurn.filters.minArea,
      maxArea: lastTurn.filters.maxArea,
      bedrooms: lastTurn.filters.bedrooms,
      legal: lastTurn.filters.legal,
      direction: lastTurn.filters.direction,
      sort: 'relevance',
    });
    setOpen(false);
  };

  const openProperty = (p: AdvisorPropertySummary) => {
    track(EVENTS.AI_ADVISOR_PROPERTY_CLICK, { propertyId: p.id });
    onNavigate?.({ name: 'property', id: p.id, slug: p.slug ?? undefined });
    setOpen(false);
  };

  const submitAdvisorLead = async () => {
    if (!lastTurn || submittingLead) return;
    const validation = validateAdvisorLeadContact(leadForm);
    if (!validation.valid) { setLeadError(validation.error ?? 'Thông tin chưa hợp lệ.'); return; }
    setLeadError(null);
    setSubmittingLead(true);
    try {
      const payload = buildAdvisorLeadPayload(leadForm, lastTurn, leadFor ?? undefined);
      await submitLead(payload);
      track(EVENTS.LEAD_SUBMIT, { source: 'ai_advisor', hasProperty: !!leadFor, hasMessage: !!leadForm.message.trim() });
      setLeadSent(true);
      setShowGeneralLeadForm(false);
      setMessages(prev => [...prev, { role: 'assistant', text: 'Đã gửi thông tin, tư vấn viên sẽ liên hệ anh/chị trong thời gian sớm nhất.' }]);
      setLeadForm({ full_name: '', phone: '', message: '' });
      setLeadFor(null);
    } catch {
      setLeadError('Chưa gửi được thông tin. Anh/chị thử lại sau ít phút.');
    } finally {
      setSubmittingLead(false);
    }
  };

  return (
    <div className="relative">
      {open && (
        <div className="absolute bottom-16 right-0 w-[360px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-7rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in flex flex-col">
          <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white p-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-black text-sm"><Bot className="w-4 h-4" />Trợ lý BĐS</div>
              <p className="text-xs text-white/80 mt-1">Tư vấn nhu cầu, gợi ý tin phù hợp và kết nối tư vấn viên.</p>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-white/15 transition-colors" aria-label="Đóng trợ lý">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-red-600 text-white' : 'bg-gray-50 text-gray-700'}`}>
                  <p>{m.text}</p>
                  {m.chips && m.chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.chips.map(c => <span key={c} className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2 py-1">{c}</span>)}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && <div className="text-xs text-gray-400">Đang tìm BĐS phù hợp…</div>}

            {!loading && (results.length > 0 || lastTurn?.stage === 'showing_matches') && (
              <div className="space-y-2">
                {results.map(p => (
                  <div key={p.id} className="border border-gray-100 rounded-xl overflow-hidden bg-white shadow-sm">
                    <div className="flex gap-3 p-2.5">
                      <img src={p.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'} alt="" className="w-20 h-16 object-cover rounded-lg flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900 text-xs line-clamp-2">{p.title}</p>
                        <p className="text-red-600 font-black text-sm mt-0.5">{p.priceText}</p>
                        <p className="text-[11px] text-gray-500 truncate">{p.location}</p>
                        <div className="flex gap-1 mt-1 text-[10px] text-gray-500 flex-wrap">
                          {p.area && <span className="bg-gray-50 px-1.5 py-0.5 rounded">{p.area}</span>}
                          {p.legal && <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{p.legal}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 border-t border-gray-100">
                      <button onClick={() => openProperty(p)} className="text-xs font-semibold text-gray-700 py-2 hover:bg-gray-50 flex items-center justify-center gap-1"><ExternalLink className="w-3 h-3" />Xem chi tiết</button>
                      <button onClick={() => { setLeadFor(p); setShowGeneralLeadForm(false); setLeadError(null); setLeadSent(false); }} className="text-xs font-semibold text-red-600 py-2 hover:bg-red-50 flex items-center justify-center gap-1"><Phone className="w-3 h-3" />Tư vấn căn này</button>
                    </div>
                  </div>
                ))}
                <button onClick={navigateAll} className="w-full border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-xl py-2.5 transition-colors">
                  Lọc tất cả kết quả phù hợp
                </button>
              </div>
            )}

            {(leadFor || (showGeneralLeadForm && !leadSent)) && (
              <div className="border border-red-100 bg-red-50/40 rounded-xl p-3 space-y-2">
                <p className="text-xs font-bold text-gray-800">{leadFor ? `Tư vấn về: ${leadFor.title}` : 'Để lại thông tin tư vấn viên liên hệ'}</p>
                <input value={leadForm.full_name} onChange={e => setLeadForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Họ tên" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                <input value={leadForm.phone} onChange={e => setLeadForm(f => ({ ...f, phone: e.target.value }))} placeholder="Số điện thoại" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                <textarea value={leadForm.message} onChange={e => setLeadForm(f => ({ ...f, message: e.target.value }))} placeholder="Ghi chú thêm (tuỳ chọn)" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm min-h-[60px] resize-none focus:outline-none focus:ring-2 focus:ring-red-400" />
                {leadError && <p className="text-xs text-red-600">{leadError}</p>}
                <button onClick={submitAdvisorLead} disabled={submittingLead} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold text-sm py-2 rounded-lg transition-colors">
                  {submittingLead ? 'Đang gửi…' : 'Gửi cho tư vấn viên'}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 p-3 space-y-2">
            {!taxonomyReady && <p className="text-xs text-gray-400">Đang nạp dữ liệu khu vực/loại BĐS…</p>}
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map(example => (
                <button key={example} disabled={!taxonomyReady} onClick={() => send(example)} className="text-[11px] text-gray-600 hover:text-red-600 bg-gray-50 hover:bg-red-50 disabled:opacity-50 rounded-full px-2.5 py-1.5 transition-colors">{example}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
                }}
                placeholder="Nhập nhu cầu: khu vực, giá, pháp lý, số phòng…"
                className="flex-1 max-h-24 min-h-[42px] resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <button onClick={() => send()} disabled={!query.trim() || !taxonomyReady} className="w-11 h-11 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white flex items-center justify-center flex-shrink-0 transition-colors" aria-label="Gửi tin nhắn">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      <button
        onClick={openPanel}
        className="relative w-12 h-12 rounded-full bg-gradient-to-br from-red-600 to-orange-500 text-white shadow-lg hover:scale-110 transition-all flex items-center justify-center"
        title="AI tìm BĐS cho bạn"
        aria-label="Mở trợ lý AI tìm BĐS"
      >
        <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
        <Bot className="w-5 h-5 relative z-[1]" />
        <Sparkles className="w-3 h-3 absolute top-2 right-2 z-[1] animate-pulse" />
      </button>
    </div>
  );
}
