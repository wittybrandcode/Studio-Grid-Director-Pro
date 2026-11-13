import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_STUDIO_PROJECT,
  LaserPointerState,
  PRESET_PROJECT_TEMPLATES,
  StudioProject,
  SyncPayload,
  UILanguage,
} from '../types/studio';
import {
  computeGrid,
  computeQuickFlashYellowIntensity,
  renderStudioCanvas,
} from '../utils/gridEngine';
import {
  closeCurrentTauriWindowIfSecondary,
  disposeTauriNdiScratchCanvas,
  emitTauriSyncEvent,
  isTauriRuntime,
  listenTauriSyncEvent,
  pushTauriNdiCanvasFrame,
  toggleStudioFullscreen,
} from '../utils/tauriBridge';

const SCREENS_STORAGE_KEY = 'studio_grid_director_screens_v4';
const LEGACY_STORAGE_KEY = 'studio_grid_director_active_project_v3';
const CHANNEL_NAME = 'studio_calibration_channel';

interface LiveOutputViewProps {
  screenId?: string | null;
  initialProject?: StudioProject;
  onExitLiveOutput?: () => void;
}

function loadScreenFromLocalFallback(targetScreenId?: string | null): StudioProject {
  try {
    const rawScreens = localStorage.getItem(SCREENS_STORAGE_KEY);
    if (rawScreens) {
      const parsedScreens = JSON.parse(rawScreens) as StudioProject[];
      if (Array.isArray(parsedScreens) && parsedScreens.length > 0) {
        if (targetScreenId) {
          const found = parsedScreens.find((s) => s.id === targetScreenId);
          if (found) return found;
        }
        return parsedScreens[0];
      }
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      return JSON.parse(legacy);
    }
  } catch {
    // ignore storage errors
  }
  if (targetScreenId) {
    const template = PRESET_PROJECT_TEMPLATES.find((t) => t.id === targetScreenId);
    if (template) return template;
  }
  return DEFAULT_STUDIO_PROJECT;
}

export const LiveOutputView: React.FC<LiveOutputViewProps> = ({
  screenId,
  initialProject,
  onExitLiveOutput,
}) => {
  const [project, setProject] = useState<StudioProject>(() => {
    if (initialProject && (!screenId || initialProject.id === screenId)) {
      return initialProject;
    }
    return loadScreenFromLocalFallback(screenId);
  });

  const [blinkingKeys, setBlinkingKeys] = useState<Set<string>>(new Set());
  const [blinkPhaseOn, setBlinkPhaseOn] = useState<boolean>(false);
  const [laser, setLaser] = useState<LaserPointerState | null>(null);
  const [identifyFlash, setIdentifyFlash] = useState<boolean>(false);
  const identifyTimerRef = useRef<number | null>(null);
  const identifyFlashStartRef = useRef<number>(0);

  const [lang, setLang] = useState<UILanguage>(() => {
    try {
      const saved = localStorage.getItem('studio_grid_lang');
      if (saved === 'en' || saved === 'ar' || saved === 'bilingual') return saved;
    } catch {
      // ignore storage errors
    }
    return 'ar';
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'studio_grid_lang') {
        const val = e.newValue;
        if (val === 'en' || val === 'ar' || val === 'bilingual') {
          setLang(val);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectiveScreenId = screenId || project.id;

  const triggerIdentifyFlash = () => {
    identifyFlashStartRef.current = performance.now();
    setIdentifyFlash(true);
    if (identifyTimerRef.current) {
      window.clearTimeout(identifyTimerRef.current);
    }
    identifyTimerRef.current = window.setTimeout(() => {
      setIdentifyFlash(false);
    }, 2000);
  };

  // Update browser tab / Tauri window title so OBS (Capture de fenêtre) and NDI Screen Capture can find it immediately
  useEffect(() => {
    const ndiCfg = project.ndiConfig;
    const srcName = ndiCfg?.sourceName?.trim() || `SGD_${project.id}`;
    if (ndiCfg?.enabled) {
      document.title = `SGD_LIVE_OUTPUT :: NDI [${srcName}] — ${project.name} (${project.compWidth}×${project.compHeight})`;
    } else {
      document.title = `SGD_LIVE_OUTPUT :: ${project.name} (${project.compWidth}×${project.compHeight})`;
    }
  }, [project.id, project.name, project.compWidth, project.compHeight, project.ndiConfig]);

  // Keyboard shortcuts for Tauri & Browser Live Output windows (F11: toggle fullscreen, Esc: exit fullscreen or close secondary window)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        void toggleStudioFullscreen();
      } else if (e.key === 'Escape') {
        if (onExitLiveOutput) {
          onExitLiveOutput();
          return;
        }
        void closeCurrentTauriWindowIfSecondary();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onExitLiveOutput]);

  // 1. Real-Time Server-Sent Events (SSE) + Initial Server Fetch (works across partitioned iframes, tabs, and monitors)
  useEffect(() => {
    const targetQueryId = screenId || '*';
    let isMounted = true;
    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let retryDelayMs = 1000;

    const fetchLatestSnapshot = () => {
      const endpoint = screenId
        ? `/api/screens/${encodeURIComponent(screenId)}`
        : '/api/screens';

      fetch(endpoint, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!isMounted || !data) return;
          if (data.screen) {
            setProject(data.screen);
          } else if (Array.isArray(data.screens) && data.screens.length > 0) {
            const match =
              data.screens.find((s: StudioProject) => s.id === data.activeScreenId) ||
              data.screens[0];
            if (match) setProject(match);
          }
        })
        .catch(() => {
          // ignore network error (e.g. serverless Tauri runtime)
        });
    };

    const connectSse = () => {
      if (!isMounted) return;
      try {
        es?.close();
        es = new EventSource(
          `/api/screens-stream?role=output&screenId=${encodeURIComponent(targetQueryId)}`
        );

        es.onopen = () => {
          retryDelayMs = 1000;
        };

        es.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data) as SyncPayload;
            if (!payload) return;

            const payloadScreenId = payload.screenId || payload.project?.id;
            if (screenId && payloadScreenId && payloadScreenId !== screenId) {
              return;
            }

            if (payload.type === 'PROJECT_UPDATE' && payload.project) {
              setProject(payload.project);
            } else if (payload.type === 'LASER_MOVE') {
              setLaser(payload.laser || null);
            } else if (payload.type === 'IDENTIFY_SCREEN') {
              triggerIdentifyFlash();
            } else if (payload.type === 'BLINK_CELLS') {
              if (payload.blinkActive && payload.blinkingCellKeys) {
                setBlinkingKeys(new Set(payload.blinkingCellKeys));
              } else {
                setBlinkingKeys(new Set());
              }
            }
          } catch {
            // ignore parse errors
          }
        };

        es.onerror = () => {
          es?.close();
          es = null;
          if (!isMounted) return;
          if (reconnectTimer) window.clearTimeout(reconnectTimer);
          const delay = retryDelayMs;
          retryDelayMs = Math.min(10000, retryDelayMs * 2);
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            fetchLatestSnapshot();
            connectSse();
          }, delay);
        };
      } catch {
        // ignore SSE error in serverless Tauri mode
      }
    };

    fetchLatestSnapshot();
    connectSse();

    return () => {
      isMounted = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (identifyTimerRef.current) window.clearTimeout(identifyTimerRef.current);
      es?.close();
    };
  }, [screenId]);

  // 2. Direct Tauri Event Bus + window.postMessage + BroadcastChannel + Storage fallback
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    let heartbeatTimer: number | null = null;

    const handleIncomingPayload = (payload: SyncPayload) => {
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'PING') {
        sendHeartbeat();
        return;
      }

      const payloadScreenId = payload.screenId || payload.project?.id;
      if (screenId && payloadScreenId && payloadScreenId !== screenId) {
        return;
      }

      if (payload.type === 'PROJECT_UPDATE' && payload.project) {
        setProject(payload.project);
      } else if (payload.type === 'IDENTIFY_SCREEN') {
        triggerIdentifyFlash();
      } else if (payload.type === 'BLINK_CELLS') {
        if (payload.blinkActive && payload.blinkingCellKeys) {
          setBlinkingKeys(new Set(payload.blinkingCellKeys));
        } else {
          setBlinkingKeys(new Set());
        }
      } else if (payload.type === 'LASER_MOVE') {
        setLaser(payload.laser || null);
      }
    };

    const sendHeartbeat = () => {
      const hb: SyncPayload = {
        type: 'OUTPUT_HEARTBEAT',
        screenId: effectiveScreenId,
        timestamp: Date.now(),
      };
      emitTauriSyncEvent(hb);
      try {
        channel?.postMessage(hb);
      } catch {
        // ignore
      }
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(hb, window.location.origin);
        }
      } catch {
        // ignore
      }
    };

    const unlistenTauri = listenTauriSyncEvent(handleIncomingPayload);

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<SyncPayload>) => {
        handleIncomingPayload(event.data);
      };
      sendHeartbeat();
      heartbeatTimer = window.setInterval(sendHeartbeat, 1500);
    } catch {
      sendHeartbeat();
      heartbeatTimer = window.setInterval(sendHeartbeat, 1500);
    }

    const handleWindowMessage = (e: MessageEvent) => {
      if (e.data && typeof e.data === 'object' && 'type' in e.data) {
        handleIncomingPayload(e.data as SyncPayload);
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === SCREENS_STORAGE_KEY && e.newValue) {
        try {
          const list = JSON.parse(e.newValue) as StudioProject[];
          if (Array.isArray(list)) {
            const match = screenId ? list.find((s) => s.id === screenId) : list[0];
            if (match) setProject(match);
          }
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('message', handleWindowMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      unlistenTauri();
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (channel) channel.close();
      window.removeEventListener('message', handleWindowMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, [screenId, effectiveScreenId]);

  // Blink interval when squares are flashing
  useEffect(() => {
    if (blinkingKeys.size === 0) {
      setBlinkPhaseOn(false);
      return;
    }
    setBlinkPhaseOn(true);
    const interval = window.setInterval(() => {
      setBlinkPhaseOn((prev) => !prev);
    }, 240);
    return () => window.clearInterval(interval);
  }, [blinkingKeys]);

  const [clockTick, setClockTick] = useState<number>(0);

  useEffect(() => {
    if (!project.overlays?.showClock) return;
    const timer = window.setInterval(() => {
      setClockTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [project.overlays?.showClock]);

  const computed = useMemo(
    () => computeGrid(project),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      project.id,
      project.compWidth,
      project.compHeight,
      project.divisionMode,
      project.squareSizePx,
      project.useCustomRectPx,
      project.cellWidthPx,
      project.cellHeightPx,
      project.columnsCount,
      project.rowsCount,
      project.gridRemainderAlign,
      project.numberingSystem,
      project.coloringMode,
      project.overrides,
      project.notes,
      project.focusedNoteId,
    ]
  );

  // Render exact-resolution canvas (coalesced into next RAF or 60fps loop when Quick Flash or Moving Sync Bar is active)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawFrame = (flashIntensityVal: number) => {
      renderStudioCanvas(ctx, project, computed, {
        blinkingCellKeys: blinkingKeys,
        blinkPhaseOn,
        laser,
        isLiveOutput: true,
        identifyFlashActive: identifyFlash,
        identifyFlashIntensity: flashIntensityVal,
        lang,
        onAsyncImageLoad: () => setClockTick((t) => t + 1),
      });
    };

    const needsRaf = Boolean(identifyFlash || project.overlays?.movingSyncBar);
    if (!needsRaf) {
      const singleRaf = window.requestAnimationFrame(() => drawFrame(0));
      return () => window.cancelAnimationFrame(singleRaf);
    }

    let rafId = 0;
    const step = () => {
      const intensity = identifyFlash
        ? computeQuickFlashYellowIntensity(performance.now() - identifyFlashStartRef.current)
        : 0;
      drawFrame(intensity);
      rafId = window.requestAnimationFrame(step);
    };
    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [
    project,
    computed,
    blinkingKeys,
    blinkPhaseOn,
    laser,
    identifyFlash,
    clockTick,
  ]);

  const bgKeyMode = project.ndiConfig?.bgKeyMode || 'solid';
  const containerBgStyle =
    bgKeyMode === 'alpha'
      ? 'transparent'
      : bgKeyMode === 'chroma_green'
      ? '#00FF00'
      : bgKeyMode === 'chroma_blue'
      ? '#0000FF'
      : '#000000';

  useEffect(() => {
    const prevBodyBg = document.body.style.backgroundColor;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    if (bgKeyMode === 'alpha') {
      document.body.style.backgroundColor = 'transparent';
      document.documentElement.style.backgroundColor = 'transparent';
    }
    return () => {
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.backgroundColor = prevHtmlBg;
    };
  }, [bgKeyMode]);

  // Stream NDI frames from Live Output window if NDI is enabled in Tauri
  useEffect(() => {
    const ndiCfg = project.ndiConfig;
    if (!ndiCfg?.enabled || !isTauriRuntime()) return undefined;

    const fps = ndiCfg.frameRate || 30;
    const intervalMs = Math.max(16, Math.round(1000 / fps));
    const srcName = ndiCfg.sourceName?.trim() || `SGD_${project.id}`;

    const timer = window.setInterval(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        void pushTauriNdiCanvasFrame(project.id, srcName, canvas, fps);
      }
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
      disposeTauriNdiScratchCanvas();
    };
  }, [
    project.id,
    project.ndiConfig?.enabled,
    project.ndiConfig?.sourceName,
    project.ndiConfig?.frameRate,
  ]);

  return (
    <div
      onDoubleClick={() => void toggleStudioFullscreen()}
      style={{ backgroundColor: containerBgStyle }}
      className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center select-none cursor-none"
    >
      <canvas
        ref={canvasRef}
        width={project.compWidth}
        height={project.compHeight}
        className="w-screen h-screen object-contain block"
      />
    </div>
  );
};
