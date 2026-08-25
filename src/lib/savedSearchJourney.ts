export type SavedSearchNoticeState = {
  savedSearchId: string;
  signature: string;
};

export function shouldShowSavedSearchNotice(
  previous: SavedSearchNoticeState | null,
  next: SavedSearchNoticeState,
): boolean {
  return previous?.savedSearchId !== next.savedSearchId || previous.signature !== next.signature;
}

export function savedSearchManagementHref(): string {
  return '/tai-khoan?tab=saved';
}
