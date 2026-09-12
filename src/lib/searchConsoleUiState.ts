import type {
  SearchConsoleAccessDiagnosis,
  SearchConsoleConfigurationState,
} from './api/searchVisibility';

export type SearchConsoleUiState =
  | 'not_configured'
  | 'invalid'
  | 'configured_not_verified'
  | 'ready';

/**
 * Configuration and Google property access are deliberately separate states.
 * A server-side key being present does not prove the service account can use the
 * exact URL-prefix property; only the owner-authorized read-only diagnostic can.
 */
export function getSearchConsoleUiState(
  configurationState: SearchConsoleConfigurationState,
  diagnosis: Pick<SearchConsoleAccessDiagnosis, 'status'> | null,
): SearchConsoleUiState {
  if (configurationState === 'not_configured') return 'not_configured';
  if (configurationState === 'invalid') return 'invalid';
  return diagnosis?.status === 'ACCESS_CONFIRMED' ? 'ready' : 'configured_not_verified';
}
