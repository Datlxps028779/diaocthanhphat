export type AgentProfileWorkspaceTab = 'overview' | 'public' | 'activity' | 'history';

const WORKSPACE_TABS = new Set<AgentProfileWorkspaceTab>([
  'overview',
  'public',
  'activity',
  'history',
]);

export function parseAgentProfileWorkspaceSearch(search: string): {
  profileId: string | null;
  tab: AgentProfileWorkspaceTab;
} {
  const params = new URLSearchParams(search);
  const profileId = params.get('profile')?.trim() || null;
  const candidate = params.get('workspaceTab');
  const tab = candidate && WORKSPACE_TABS.has(candidate as AgentProfileWorkspaceTab)
    ? candidate as AgentProfileWorkspaceTab
    : 'overview';
  return { profileId, tab };
}

export function updateAgentProfileWorkspaceSearch(
  search: string,
  profileId: string | null,
  tab: AgentProfileWorkspaceTab = 'overview',
): string {
  const params = new URLSearchParams(search);
  if (profileId) {
    params.set('profile', profileId);
    params.set('workspaceTab', tab);
  } else {
    params.delete('profile');
    params.delete('workspaceTab');
  }
  const next = params.toString();
  return next ? `?${next}` : '';
}
