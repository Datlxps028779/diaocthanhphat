'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Send, Sparkles, X, Phone, ExternalLink, RotateCcw } from 'lucide-react';
import { type Page } from '../lib/router';
import { useAreas, useDistricts, usePropertyTypes, useWards } from '../lib/hooks/useTaxonomy';
import { buildAdvisorLeadPayload, buildAdvisorTurn, summarizeAdvisorNeed, summarizePropertyForAdvisor, validateAdvisorLeadContact, type AdvisorMessage, type AdvisorPropertySummary, type AdvisorTurnResult } from '../lib/aiAdvisor';
import { getAllProperties } from '../lib/api/properties';
import { submitLead } from '../lib/api/leads';
import { appendPublicChatMessage, getPublicChatMessages, linkChatLead, requestStaffChat, routeChatSession, startChatSession, type PublicChatHandle } from '../lib/api/chatOps';
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
  const [leadFormExpanded, setLeadFormExpanded] = useState(false);
  const [chatHandle, setChatHandle] = useState<PublicChatHandle | null>(null);
  const chatHandleRef = useRef<PublicChatHandle | null>(null);
  const seenRemoteMessageIds = useRef<Set<string>>(new Set());
  const requestSeq = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const { data: areas = [], isLoading: loadingAreas } = useAreas();
  const { data: propertyTypes = [], isLoading: loadingTypes } = usePropertyTypes();
  const { data: districts = [], isLoading: loadingDistricts } = useDistricts();
  const { data: wards = [], isLoading: loadingWards } = useWards();
  const taxonomyReady = !loadingAreas && !loadingTypes && !loadingDistricts && !loadingWards;
  const taxonomy = useMemo(() => ({ areas, districts, wards, propertyTypes }), [areas, districts, wards, propertyTypes]);
  const hasUserMessage = messages.some(m => m.role === 'user');
  const showExamples = !hasUserMessage && !loading;
  const showMatchActions = !loading && lastTurn?.stage === 'showing_matches';
  const showLeadCta = !leadSent && (Boolean(leadFor) || showGeneralLeadForm);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [open, messages.length, loading, results.length, leadFor, showGeneralLeadForm, leadFormExpanded, leadSent]);

  useEffect(() => {
    if (!open || !chatHandle) return;
    let alive = true;
    const loadReplies = async () => {
      try {
        const rows = await getPublicChatMessages(chatHandle);
        const incoming = rows.filter(m => {
          if (seenRemoteMessageIds.current.has(m.id)) return false;
          seenRemoteMessageIds.current.add(m.id);
          return m.sender === 'staff' || m.sender === 'system';
        });
        if (!alive || incoming.length === 0) return;
        setMessages(prev => [...prev, ...incoming.map(m => ({
          role: m.sender === 'staff' ? 'staff' as const : 'system' as const,
          text: m.body,
        }))]);
      } catch { /* polling phụ, không chặn chat */ }
    };
    loadReplies();
    const t = setInterval(loadReplies, 5_000);
    return () => { alive = false; clearInterval(t); };
  }, [open, chatHandle]);

  const resetConversation = () => {
    requestSeq.current += 1;
    setQuery('');
    setMessages([GREETING]);
    setLoading(false);
    setResults([]);
    setLastTurn(null);
    setLeadFor(null);
    setShowGeneralLeadForm(false);
    setLeadForm({ full_name: '', phone: '', message: '' });
    setLeadError(null);
    setLeadSent(false);
    setSubmittingLead(false);
    setLeadFormExpanded(false);
    chatHandleRef.current = null;
    seenRemoteMessageIds.current = new Set();
    setChatHandle(null);
  };

  const openPanel = () => {
    setOpen(v => {
      const next = !v;
      if (next) track(EVENTS.AI_ADVISOR_OPEN);
      return next;
    });
  };

  // Chỉ tạo phiên + đồng bộ khi khách CHỦ ĐỘNG yêu cầu tư vấn (để lại SĐT hoặc gặp
  // nhân viên). Chat tham khảo giữ ở client, không bắn về admin/staff. Khi bắt đầu tư
  // vấn thì backfill toàn bộ hội thoại đang có để tư vấn viên nắm ngữ cảnh.
  const ensureConsultationSession = async (needSummary: string, history: AdvisorMessage[]): Promise<PublicChatHandle | null> => {
    if (chatHandleRef.current) return chatHandleRef.current;
    const handle = { sessionId: crypto.randomUUID(), visitorToken: crypto.randomUUID() };
    chatHandleRef.current = handle;
    setChatHandle(handle);
    try {
      await startChatSession({ sessionId: handle.sessionId, visitorToken: handle.visitorToken, needSummary });
      for (const m of history) {
        if (m.role !== 'user' && m.role !== 'assistant') continue;
        await appendPublicChatMessage(handle, m.role === 'user' ? 'visitor' : 'assistant', m.text);
      }
      const rows = await getPublicChatMessages(handle);
      rows.forEach(r => seenRemoteMessageIds.current.add(r.id));
      return handle;
    } catch (error) {
      if (chatHandleRef.current?.sessionId === handle.sessionId) {
        chatHandleRef.current = null;
        setChatHandle(null);
      }
      throw error;
    }
  };

  // Chỉ ghi tiếp khi phiên tư vấn đã mở (đã đồng bộ). Trước đó = chat tham khảo, bỏ qua.
  const persistOngoingMessage = async (sender: 'visitor' | 'assistant', body: string) => {
    const handle = chatHandleRef.current;
    if (!handle) return;
    try {
      await appendPublicChatMessage(handle, sender, body);
      const rows = await getPublicChatMessages(handle);
      rows.forEach(m => seenRemoteMessageIds.current.add(m.id));
    } catch { /* không chặn trải nghiệm chat */ }
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
    setLeadFormExpanded(false);
    setMessages(prev => [...prev, { role: 'user', text }]);
    track(EVENTS.AI_ADVISOR_SEND, { hasText: true });

    // Chat tham khảo: KHÔNG tạo phiên. Chỉ ghi tiếp nếu khách đã mở tư vấn trước đó.
    await persistOngoingMessage('visitor', text);

    const turn = buildAdvisorTurn(text, taxonomy);
    setLastTurn(turn);
    setResults([]);
    setMessages(prev => [...prev, { role: 'assistant', text: turn.reply, chips: turn.matched.map(m => m.label) }]);
    await persistOngoingMessage('assistant', turn.reply);
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
      const resultReply = cards.length ? `Em tìm được ${cards.length} tin phù hợp nhất. Anh/chị có thể xem chi tiết, lọc toàn bộ kết quả hoặc gửi thông tin để tư vấn viên hỗ trợ.` : 'Hiện chưa có tin thật sự khớp. Anh/chị có thể nới khoảng giá/khu vực, bấm lọc toàn bộ kết quả hoặc để lại thông tin để tư vấn viên tìm giúp.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: resultReply,
      }]);
      await persistOngoingMessage('assistant', resultReply);
    } catch {
      if (seq !== requestSeq.current) return;
      setShowGeneralLeadForm(true);
      const errorReply = 'Em chưa tải được danh sách gợi ý lúc này. Anh/chị có thể bấm lọc toàn bộ kết quả hoặc để lại số điện thoại để tư vấn viên hỗ trợ.';
      setMessages(prev => [...prev, { role: 'assistant', text: errorReply }]);
      await persistOngoingMessage('assistant', errorReply);
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

  const openLeadForm = (property?: AdvisorPropertySummary) => {
    setLeadFor(property ?? null);
    setShowGeneralLeadForm(!property);
    setLeadFormExpanded(true);
    setLeadError(null);
    setLeadSent(false);
  };

  const submitAdvisorLead = async () => {
    if (!lastTurn || submittingLead) return;
    const validation = validateAdvisorLeadContact(leadForm);
    if (!validation.valid) { setLeadError(validation.error ?? 'Thông tin chưa hợp lệ.'); return; }
    setLeadError(null);
    setSubmittingLead(true);
    try {
      const payload = buildAdvisorLeadPayload(leadForm, lastTurn, leadFor ?? undefined);
      const leadId = crypto.randomUUID();
      await submitLead({ ...payload, id: leadId });
      // Khách để lại SĐT = chủ động yêu cầu tư vấn → mở phiên, backfill hội thoại rồi chia nhân viên.
      const handle = await ensureConsultationSession(summarizeAdvisorNeed(lastTurn), messages).catch(() => null);
      if (handle) {
        await linkChatLead(handle, {
          leadId,
          visitorName: leadForm.full_name,
          visitorPhone: leadForm.phone,
          needSummary: summarizeAdvisorNeed(lastTurn),
          propertyId: leadFor?.id ?? undefined,
        }).catch(() => {});
        await routeChatSession(handle).catch(() => {});
      }
      track(EVENTS.LEAD_SUBMIT, { source: 'ai_advisor', hasProperty: !!leadFor, hasMessage: !!leadForm.message.trim() });
      const successReply = 'Đã gửi thông tin, tư vấn viên sẽ liên hệ anh/chị trong thời gian sớm nhất.';
      setLeadSent(true);
      setShowGeneralLeadForm(false);
      setLeadFormExpanded(false);
      setMessages(prev => [...prev, { role: 'assistant', text: successReply }]);
      await persistOngoingMessage('assistant', successReply);
      setLeadForm({ full_name: '', phone: '', message: '' });
      setLeadFor(null);
    } catch {
      setLeadError('Chưa gửi được thông tin. Anh/chị thử lại sau ít phút.');
    } finally {
      setSubmittingLead(false);
    }
  };

  const [requestingStaff, setRequestingStaff] = useState(false);

  // Khách chủ động xin gặp nhân viên trực chat (không cần SĐT) → mở phiên, đánh dấu
  // wants_staff, backfill hội thoại rồi chia cho tư vấn viên.
  const requestLiveStaff = async () => {
    if (requestingStaff || chatHandleRef.current) return;
    setRequestingStaff(true);
    try {
      const need = lastTurn ? summarizeAdvisorNeed(lastTurn) : 'Khách yêu cầu gặp tư vấn viên';
      const handle = await ensureConsultationSession(need, messages);
      if (!handle) throw new Error('no-session');
      await requestStaffChat(handle);
      await routeChatSession(handle).catch(() => {});
      track(EVENTS.AI_ADVISOR_SEND, { hasText: false, requestStaff: true });
      setMessages(prev => [...prev, { role: 'system', text: 'Đã gửi yêu cầu gặp tư vấn viên. Anh/chị vui lòng chờ trong giây lát, nhân viên sẽ vào trò chuyện trực tiếp tại đây.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Chưa kết nối được tư vấn viên lúc này. Anh/chị có thể để lại số điện thoại để được gọi lại sớm nhất.' }]);
      setShowGeneralLeadForm(true);
    } finally {
      setRequestingStaff(false);
    }
  };

  return (
    <div className="relative">
      {open && (
        <div className="fixed sm:absolute bottom-4 sm:bottom-16 left-4 right-4 sm:left-auto sm:right-0 sm:w-[360px] h-[min(78vh,640px)] sm:h-auto sm:max-h-[calc(100vh-7rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in flex flex-col min-h-0">
          <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white p-3 sm:p-4 flex items-start justify-between gap-3 flex-shrink-0">
            <div>
              <div className="flex items-center gap-2 font-black text-sm"><Bot className="w-4 h-4" />Trợ lý BĐS</div>
              <p className="text-xs text-white/80 mt-1">Tư vấn nhu cầu, gợi ý tin phù hợp và kết nối tư vấn viên.</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {hasUserMessage && (
                <button onClick={resetConversation} className="p-1.5 rounded-full hover:bg-white/15 transition-colors" aria-label="Bắt đầu lại cuộc trò chuyện" title="Bắt đầu lại">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-white/15 transition-colors" aria-label="Đóng trợ lý">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3" aria-live="polite">
            {messages.map((m, i) => {
              const bubbleClass = m.role === 'user'
                ? 'bg-red-600 text-white'
                : m.role === 'staff'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                  : m.role === 'system'
                    ? 'bg-amber-50 text-amber-800 border border-amber-100'
                    : 'bg-gray-50 text-gray-700';
              return (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${bubbleClass}`}>
                    {m.role === 'staff' && <p className="text-[10px] font-black uppercase tracking-wide mb-1 text-emerald-700">Tư vấn viên</p>}
                    {m.role === 'system' && <p className="text-[10px] font-black uppercase tracking-wide mb-1 text-amber-700">Hệ thống</p>}
                    <p>{m.text}</p>
                    {m.chips && m.chips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {m.chips.map(c => <span key={c} className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2 py-1">{c}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && <div className="text-xs text-gray-400">Đang tìm BĐS phù hợp…</div>}

            {!loading && (results.length > 0 || showMatchActions) && (
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
                      <button onClick={() => openLeadForm(p)} className="text-xs font-semibold text-red-600 py-2 hover:bg-red-50 flex items-center justify-center gap-1"><Phone className="w-3 h-3" />Tư vấn căn này</button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={navigateAll} className="flex-1 min-w-[120px] border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg py-2 transition-colors">
                    Lọc tất cả kết quả
                  </button>
                  {!showLeadCta && (
                    <button onClick={() => openLeadForm()} className="flex-1 min-w-[120px] border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold rounded-lg py-2 transition-colors">
                      Để lại liên hệ
                    </button>
                  )}
                </div>
              </div>
            )}

            {showLeadCta && (
              leadFormExpanded ? (
                <div className="border border-red-100 bg-red-50/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-gray-800">{leadFor ? `Tư vấn về: ${leadFor.title}` : 'Để lại thông tin tư vấn viên liên hệ'}</p>
                    <button onClick={() => setLeadFormExpanded(false)} className="text-[11px] text-gray-500 hover:text-gray-700 flex-shrink-0" aria-label="Thu gọn biểu mẫu">Thu gọn</button>
                  </div>
                  <input value={leadForm.full_name} onChange={e => setLeadForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Họ tên" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  <input value={leadForm.phone} onChange={e => setLeadForm(f => ({ ...f, phone: e.target.value }))} placeholder="Số điện thoại" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  <textarea value={leadForm.message} onChange={e => setLeadForm(f => ({ ...f, message: e.target.value }))} placeholder="Ghi chú thêm (tuỳ chọn)" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm min-h-[52px] resize-none focus:outline-none focus:ring-2 focus:ring-red-400" />
                  {leadError && <p className="text-xs text-red-600">{leadError}</p>}
                  <button onClick={submitAdvisorLead} disabled={submittingLead} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold text-sm py-2 rounded-lg transition-colors">
                    {submittingLead ? 'Đang gửi…' : 'Gửi cho tư vấn viên'}
                  </button>
                </div>
              ) : (
                <button onClick={() => setLeadFormExpanded(true)} className="w-full text-left border border-red-100 bg-red-50/40 rounded-xl p-3 hover:bg-red-50 transition-colors">
                  <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-red-600" />{leadFor ? `Tư vấn về: ${leadFor.title}` : 'Cần tư vấn viên hỗ trợ?'}</p>
                  <p className="text-[11px] text-red-600 font-semibold mt-1">Nhập thông tin để được liên hệ</p>
                </button>
              )
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-100 p-2.5 sm:p-3 space-y-2 flex-shrink-0">
            {!taxonomyReady && <p className="text-xs text-gray-400">Đang nạp dữ liệu khu vực/loại BĐS…</p>}
            {showExamples && (
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map(example => (
                  <button key={example} disabled={!taxonomyReady} onClick={() => send(example)} className="text-[11px] text-gray-600 hover:text-red-600 bg-gray-50 hover:bg-red-50 disabled:opacity-50 rounded-full px-2.5 py-1.5 transition-colors">{example}</button>
                ))}
              </div>
            )}
            {!chatHandle && (
              <button onClick={requestLiveStaff} disabled={requestingStaff || !taxonomyReady} className="w-full flex items-center justify-center gap-1.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 text-xs font-bold rounded-lg py-2 transition-colors">
                <Phone className="w-3.5 h-3.5" />{requestingStaff ? 'Đang kết nối tư vấn viên…' : 'Gặp nhân viên trực chat'}
              </button>
            )}
            <div className="flex gap-2">
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  if (e.nativeEvent.isComposing) return;
                  if (e.shiftKey) return;
                  e.preventDefault();
                  send();
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
      {!open && (
        <div className="absolute bottom-14 right-0 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs font-black text-red-600 shadow-lg ring-1 ring-red-100 animate-pulse">
          Tư vấn AI
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
