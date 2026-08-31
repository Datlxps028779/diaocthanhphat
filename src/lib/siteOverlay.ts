export const AI_PANEL_EVENT = 'cnv_ai_panel_changed';

export function notifyAiPanel(open: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<boolean>(AI_PANEL_EVENT, { detail: open }));
}
