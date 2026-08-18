export type NearbyPoiRequestState = 'idle' | 'loading' | 'done' | 'error';
export type NearbyPoiViewState = 'idle' | 'loading' | 'results' | 'empty' | 'error';

export function deriveNearbyPoiViewState(
  requestState: NearbyPoiRequestState,
  pois: readonly unknown[],
): NearbyPoiViewState {
  if (requestState === 'idle') return 'idle';
  if (requestState === 'loading') return 'loading';
  if (requestState === 'error') return 'error';
  return pois.length > 0 ? 'results' : 'empty';
}
