export interface LiveOutputRouteState {
  isLiveOutput: boolean;
  screenId: string | null;
}

const TRUTHY_FLAG_VALUES = new Set(['1', 'true', 'yes', 'on']);

/**
 * Parse whether the current window location points to the dedicated synchronized Live Output route.
 * Supports:
 *  - Query parameters (HTTP-redirect & OAuth safe): `?live=1&screen=...`, `?live-output=1&screen=...`, `?output=1&screen=...`, `?mode=live`
 *  - Clean pathname: `/live-output` or `/live-output/<screenId>`
 *  - Hash routes (legacy backwards compatibility): `#live-output?screen=...` or `#live-output/<screenId>`
 */
export function parseLiveOutputRoute(
  loc: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location
): LiveOutputRouteState {
  const searchParams = new URLSearchParams(loc.search || '');
  const queryScreen = searchParams.get('screen') || searchParams.get('screenId');

  const liveFlag = (searchParams.get('live') || '').toLowerCase();
  const liveOutputFlag = (searchParams.get('live-output') || '').toLowerCase();
  const outputFlag = (searchParams.get('output') || '').toLowerCase();
  const modeFlag = (searchParams.get('mode') || '').toLowerCase();

  if (
    TRUTHY_FLAG_VALUES.has(liveFlag) ||
    TRUTHY_FLAG_VALUES.has(liveOutputFlag) ||
    TRUTHY_FLAG_VALUES.has(outputFlag) ||
    modeFlag === 'live' ||
    modeFlag === 'live-output' ||
    modeFlag === 'output'
  ) {
    return {
      isLiveOutput: true,
      screenId: queryScreen,
    };
  }

  const pathname = loc.pathname || '';
  const pathMatch = pathname.match(/\/live-output(?:\/([^/?#]+))?\/?$/i);
  if (pathMatch) {
    return {
      isLiveOutput: true,
      screenId: queryScreen || (pathMatch[1] ? decodeURIComponent(pathMatch[1]) : null),
    };
  }

  const hash = loc.hash || '';
  if (hash.startsWith('#live-output')) {
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex + 1));
      return {
        isLiveOutput: true,
        screenId: hashParams.get('screen') || hashParams.get('screenId') || queryScreen,
      };
    }
    const parts = hash.split('/');
    if (parts.length > 1 && parts[1]) {
      return {
        isLiveOutput: true,
        screenId: decodeURIComponent(parts[1]),
      };
    }
    return { isLiveOutput: true, screenId: queryScreen };
  }

  return { isLiveOutput: false, screenId: null };
}

/**
 * Build a redirect-safe URL for opening a synchronized Live Output screen window.
 * Uses HTTP query params (`?live=1&screen=...`) instead of `#hash` fragments so Cloud Run / OAuth
 * redirects and browser `target="_blank"` navigation never strip the route.
 */
export function buildLiveOutputUrl(screenId?: string | null, absolute = true): string {
  const params = new URLSearchParams();
  params.set('live', '1');
  if (screenId) {
    params.set('screen', screenId);
  }

  if (typeof window === 'undefined') {
    return `/?${params.toString()}`;
  }

  const pathname = window.location.pathname || '/';
  const prefix = absolute ? `${window.location.origin}${pathname}` : pathname;
  return `${prefix}?${params.toString()}`;
}
