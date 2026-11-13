import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StudioProject, SyncPayload } from '../types/studio';
import { emitTauriSyncEvent, listenTauriSyncEvent } from '../utils/tauriBridge';

export const CHANNEL_NAME = 'studio_calibration_channel';

export interface UseWorkspaceSyncParams {
  screens: StudioProject[];
  screensRef: React.MutableRefObject<StudioProject[]>;
  activeScreenId: string;
  project: StudioProject;
  setScreens: React.Dispatch<React.SetStateAction<StudioProject[]>>;
  isLiveOutput: boolean;
  isLiveFrozen: boolean;
  t: (ar: string, en: string) => string;
  showToast: (msg: string) => void;
}

export function useWorkspaceSync({
  screens,
  screensRef,
  activeScreenId,
  project,
  setScreens,
  isLiveOutput,
  isLiveFrozen,
  t,
  showToast,
}: UseWorkspaceSyncParams) {
  // Track connected Live Output Windows per screenId (from SSE server + BroadcastChannel)
  const [serverConnectedCounts, setServerConnectedCounts] = useState<Record<string, number>>({});
  const [liveOutputHeartbeats, setLiveOutputHeartbeats] = useState<Record<string, number>>({});

  // Local editor visual feedback when flashing/blinking Live Output
  const [editorBlinkingKeys, setEditorBlinkingKeys] = useState<Set<string>>(new Set());
  const [editorBlinkPhaseOn, setEditorBlinkPhaseOn] = useState<boolean>(false);
  const [editorIdentifyFlash, setEditorIdentifyFlash] = useState<boolean>(false);
  const [flashingScreenId, setFlashingScreenId] = useState<string | null>(null);

  const editorIdentifyFlashIntensityRef = useRef<number>(0);
  const blinkTimeoutRef = useRef<number | null>(null);
  const identifyTimeoutRef = useRef<number | null>(null);
  const identifyFlashStartRef = useRef<number>(0);

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Throttling refs for high-frequency network sync (25ms / 40fps)
  const syncTimerRef = useRef<number | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const pendingSyncRef = useRef<{
    screens: StudioProject[];
    activeScreenId: string;
    screen?: StudioProject;
  } | null>(null);

  // Cleanup active timers on unmount
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      if (blinkTimeoutRef.current) window.clearTimeout(blinkTimeoutRef.current);
      if (identifyTimeoutRef.current) window.clearTimeout(identifyTimeoutRef.current);
    };
  }, []);

  // High-performance 40fps throttled + coalesced sync to server for SSE delivery to Live Output screens
  const flushSyncToServer = useCallback(
    (payload: { screens: StudioProject[]; activeScreenId: string; screen?: StudioProject }) => {
      lastSyncTimeRef.current = Date.now();
      fetch('/api/screens/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.connectedScreens) {
            setServerConnectedCounts(data.connectedScreens);
          }
        })
        .catch(() => {
          // ignore network errors
        });
    },
    []
  );

  const pushSyncToServer = useCallback(
    (
      nextScreens: StudioProject[],
      nextActiveId: string,
      changedScreen?: StudioProject,
      immediate = false
    ) => {
      const payload = {
        screens: nextScreens,
        activeScreenId: nextActiveId,
        screen: changedScreen,
      };
      pendingSyncRef.current = payload;

      const elapsed = Date.now() - lastSyncTimeRef.current;
      if (immediate || elapsed >= 25) {
        if (syncTimerRef.current) {
          window.clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }
        pendingSyncRef.current = null;
        flushSyncToServer(payload);
      } else if (!syncTimerRef.current) {
        syncTimerRef.current = window.setTimeout(() => {
          syncTimerRef.current = null;
          if (pendingSyncRef.current) {
            const latest = pendingSyncRef.current;
            pendingSyncRef.current = null;
            flushSyncToServer(latest);
          }
        }, 25 - elapsed);
      }
    },
    [flushSyncToServer]
  );

  // Connect Director Console to Server SSE stream to track connected Live Output Windows in real time
  useEffect(() => {
    if (isLiveOutput) return undefined;

    pushSyncToServer(screens, activeScreenId, project, true);

    const es = new EventSource('/api/screens-stream?role=director');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.connectedScreens) {
          setServerConnectedCounts(data.connectedScreens);
        }
      } catch {
        // ignore
      }
    };

    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveOutput]);

  // BroadcastChannel + Tauri Native Event Bus + same-origin window.postMessage setup
  useEffect(() => {
    const handleSyncMsg = (payload: SyncPayload) => {
      if (!payload) return;
      if (payload.type === 'OUTPUT_HEARTBEAT' && payload.screenId) {
        setLiveOutputHeartbeats((prev) => ({
          ...prev,
          [payload.screenId!]: Date.now(),
        }));
      }
    };

    const handleWindowMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data && typeof e.data === 'object' && 'type' in e.data) {
        handleSyncMsg(e.data as SyncPayload);
      }
    };

    window.addEventListener('message', handleWindowMessage);

    const unlistenTauri = listenTauriSyncEvent(handleSyncMsg);
    const pingMsg: SyncPayload = {
      type: 'PING',
      timestamp: Date.now(),
    };
    emitTauriSyncEvent(pingMsg);

    try {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      broadcastChannelRef.current = ch;

      ch.onmessage = (event: MessageEvent<SyncPayload>) => {
        handleSyncMsg(event.data);
      };

      ch.postMessage(pingMsg);

      return () => {
        window.removeEventListener('message', handleWindowMessage);
        unlistenTauri();
        ch.close();
        broadcastChannelRef.current = null;
      };
    } catch {
      return () => {
        window.removeEventListener('message', handleWindowMessage);
        unlistenTauri();
      };
    }
  }, []);

  // Broadcast live updates immediately to Live Output windows (unless frozen)
  useEffect(() => {
    if (isLiveOutput || isLiveFrozen) return;

    const syncMsg: SyncPayload = {
      type: 'PROJECT_UPDATE',
      screenId: project.id,
      project,
      timestamp: Date.now(),
    };
    emitTauriSyncEvent(syncMsg);
    broadcastChannelRef.current?.postMessage(syncMsg);
    pushSyncToServer(screens, activeScreenId, project);
  }, [screens, activeScreenId, project, isLiveOutput, isLiveFrozen, pushSyncToServer]);

  const sendImmediateProjectUpdate = useCallback(() => {
    const syncMsg: SyncPayload = {
      type: 'PROJECT_UPDATE',
      screenId: project.id,
      project,
      timestamp: Date.now(),
    };
    emitTauriSyncEvent(syncMsg);
    broadcastChannelRef.current?.postMessage(syncMsg);
    pushSyncToServer(screens, activeScreenId, project, true);
  }, [screens, activeScreenId, project, pushSyncToServer]);

  // Trigger visual identification flash on a Live Output screen
  const handleIdentifyScreen = useCallback(
    (targetScreenId: string) => {
      const msg: SyncPayload = {
        type: 'IDENTIFY_SCREEN',
        screenId: targetScreenId,
        timestamp: Date.now(),
      };
      emitTauriSyncEvent(msg);
      broadcastChannelRef.current?.postMessage(msg);
      fetch('/api/screens/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      }).catch(() => {
        // ignore
      });

      identifyFlashStartRef.current = performance.now();
      editorIdentifyFlashIntensityRef.current = 1;
      setFlashingScreenId(targetScreenId);
      setEditorIdentifyFlash(true);
      if (identifyTimeoutRef.current) window.clearTimeout(identifyTimeoutRef.current);
      identifyTimeoutRef.current = window.setTimeout(() => {
        editorIdentifyFlashIntensityRef.current = 0;
        setEditorIdentifyFlash(false);
        setFlashingScreenId(null);
      }, 2000);

      const targetScr = screens.find((s) => s.id === targetScreenId);
      showToast(
        t(
          `تم إرسال ومضة تعريف إلى "${targetScr?.name || targetScreenId}"`,
          `Sent Identification Flash to "${targetScr?.name || targetScreenId}"`
        )
      );
    },
    [screens, showToast, t]
  );

  // Toggle persistent (click ON / click OFF, no timer) visual identification on a screen
  const handleTogglePinIdentifyScreen = useCallback(
    (targetScreenId: string) => {
      const targetScr = screensRef.current.find((s) => s.id === targetScreenId);
      if (!targetScr) return;

      const nextPinned = !targetScr.overlays?.pinnedIdentify;
      const updatedScreen: StudioProject = {
        ...targetScr,
        updatedAt: new Date().toISOString(),
        overlays: {
          ...targetScr.overlays,
          pinnedIdentify: nextPinned,
        },
      };

      const nextScreens = screensRef.current.map((s) =>
        s.id === targetScreenId ? updatedScreen : s
      );
      screensRef.current = nextScreens;
      setScreens(nextScreens);

      if (!isLiveFrozen) {
        const syncMsg: SyncPayload = {
          type: 'PROJECT_UPDATE',
          screenId: targetScreenId,
          project: updatedScreen,
          timestamp: Date.now(),
        };
        emitTauriSyncEvent(syncMsg);
        broadcastChannelRef.current?.postMessage(syncMsg);
        pushSyncToServer(nextScreens, activeScreenId, updatedScreen, true);
      }

      showToast(
        nextPinned
          ? t(
              `تم تفعيل وتثبيت بطاقة الومضة على "${targetScr.name}" (انقر مرة أخرى لإيقافها)`,
              `Identification Hold ON for "${targetScr.name}" (Click again to turn off)`
            )
          : t(
              `تم إيقاف تثبيت الومضة عن "${targetScr.name}"`,
              `Identification Hold OFF for "${targetScr.name}"`
            )
      );
    },
    [screensRef, setScreens, activeScreenId, isLiveFrozen, pushSyncToServer, showToast, t]
  );

  // Trigger strobe blink on specific squares on the Live Output screen
  const handleBlinkCellsOnLiveScreen = useCallback(
    (cellKeys: string[]) => {
      if (cellKeys.length === 0) return;

      const startMsg: SyncPayload = {
        type: 'BLINK_CELLS',
        screenId: project.id,
        blinkActive: true,
        blinkingCellKeys: cellKeys,
        timestamp: Date.now(),
      };
      emitTauriSyncEvent(startMsg);
      broadcastChannelRef.current?.postMessage(startMsg);
      fetch('/api/screens/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(startMsg),
      }).catch(() => {
        // ignore
      });

      setEditorBlinkingKeys(new Set(cellKeys));
      if (blinkTimeoutRef.current) window.clearTimeout(blinkTimeoutRef.current);
      blinkTimeoutRef.current = window.setTimeout(() => {
        setEditorBlinkingKeys(new Set());
        const stopMsg: SyncPayload = {
          type: 'BLINK_CELLS',
          screenId: project.id,
          blinkActive: false,
          blinkingCellKeys: [],
          timestamp: Date.now(),
        };
        emitTauriSyncEvent(stopMsg);
        broadcastChannelRef.current?.postMessage(stopMsg);
        fetch('/api/screens/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stopMsg),
        }).catch(() => {
          // ignore
        });
      }, 2600);

      showToast(
        t(
          'تم إرسال وميض تنبيهي للصناديق على شاشة العرض المباشر',
          'Flashing squares on Live Output Screen'
        )
      );
    },
    [project.id, showToast, t]
  );

  useEffect(() => {
    if (editorBlinkingKeys.size === 0) {
      setEditorBlinkPhaseOn(false);
      return undefined;
    }
    setEditorBlinkPhaseOn(true);
    const interval = window.setInterval(() => {
      setEditorBlinkPhaseOn((p) => !p);
    }, 240);
    return () => window.clearInterval(interval);
  }, [editorBlinkingKeys]);

  const isScreenLiveOpen = useCallback(
    (scrId: string) => {
      if ((serverConnectedCounts[scrId] || 0) > 0) return true;
      const last = liveOutputHeartbeats[scrId];
      return Boolean(last && Date.now() - last < 4500);
    },
    [serverConnectedCounts, liveOutputHeartbeats]
  );

  const clearEditorBlinkingKeys = useCallback(() => {
    setEditorBlinkingKeys(new Set());
  }, []);

  return {
    broadcastChannelRef,
    editorBlinkingKeys,
    clearEditorBlinkingKeys,
    editorBlinkPhaseOn,
    editorIdentifyFlash,
    flashingScreenId,
    editorIdentifyFlashIntensityRef,
    identifyFlashStartRef,
    flushSyncToServer,
    pushSyncToServer,
    sendImmediateProjectUpdate,
    handleIdentifyScreen,
    handleTogglePinIdentifyScreen,
    handleBlinkCellsOnLiveScreen,
    isScreenLiveOpen,
  };
}
