import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FreehandDrawingItem,
  FreehandDrawMode,
  LaserModeType,
  LaserPointerState,
  LaserTrailPoint,
  StudioProject,
  SyncPayload,
} from '../types/studio';
import { ComputedGridResult } from '../utils/gridEngine';
import { emitTauriSyncEvent } from '../utils/tauriBridge';

export type CanvasInteractionMode = 'select' | 'box' | 'draw' | 'pan' | 'laser';

export interface UseLaserAndDrawingParams {
  projectId: string;
  compWidth: number;
  compHeight: number;
  showDrawingsOverlay: boolean | undefined;
  computed: ComputedGridResult;
  broadcastChannelRef: React.MutableRefObject<BroadcastChannel | null>;
  toolMode: CanvasInteractionMode;
  setToolMode: React.Dispatch<React.SetStateAction<CanvasInteractionMode>>;
  hoveredKey: string | null;
  setHoveredKey: React.Dispatch<React.SetStateAction<string | null>>;
  handleUpdateProject: (
    updater: (prev: StudioProject) => StudioProject,
    options?: { skipHistory?: boolean }
  ) => void;
  t: (ar: string, en: string) => string;
  showToast: (msg: string) => void;
}

export function useLaserAndDrawing({
  projectId,
  compWidth,
  compHeight,
  showDrawingsOverlay,
  computed,
  broadcastChannelRef,
  toolMode,
  setToolMode,
  hoveredKey,
  setHoveredKey,
  handleUpdateProject,
  t,
  showToast,
}: UseLaserAndDrawingParams) {
  // Live Laser state, color, mode & trail/stroke refs
  const [laser, setLaser] = useState<LaserPointerState | null>(null);
  const laserRef = useRef<LaserPointerState | null>(null);
  laserRef.current = laser;
  const [laserColor, setLaserColor] = useState<string>('#FF2424');
  const [laserMode, setLaserMode] = useState<LaserModeType>('free');
  const laserTrailRef = useRef<LaserTrailPoint[]>([]);
  const laserDrawnStrokeRef = useRef<LaserTrailPoint[]>([]);
  const laserOriginRef = useRef<{ x: number; y: number } | null>(null);
  const laserDownRef = useRef<boolean>(false);

  const laserTimerRef = useRef<number | null>(null);
  const lastLaserTimeRef = useRef<number>(0);

  // Freehand Pen & Organic Shape Layer state & 60fps zero-lag draft ref
  const [drawMode, setDrawMode] = useState<FreehandDrawMode>('polygon');
  const [drawColor, setDrawColor] = useState<string>('#38BDF8');
  const [drawStrokeWidth, setDrawStrokeWidth] = useState<number>(4);
  const draftDrawingRef = useRef<(FreehandDrawingItem & { isLassoTiles?: boolean }) | null>(null);

  useEffect(() => {
    return () => {
      if (laserTimerRef.current) window.clearTimeout(laserTimerRef.current);
    };
  }, []);

  // Send laser pointer updates to server + BroadcastChannel + Tauri Event Bus for the active screen
  const emitLaserMove = useCallback(
    (nextLaser: LaserPointerState, immediate = false) => {
      const laserMsg: SyncPayload = {
        type: 'LASER_MOVE',
        screenId: projectId,
        laser: nextLaser,
        timestamp: Date.now(),
      };
      emitTauriSyncEvent(laserMsg);
      broadcastChannelRef.current?.postMessage(laserMsg);

      const sendToServer = (stateToSend: LaserPointerState) => {
        lastLaserTimeRef.current = Date.now();
        fetch('/api/screens/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'LASER_MOVE',
            screenId: projectId,
            laser: stateToSend,
          }),
        }).catch(() => {
          // ignore
        });
      };

      const elapsed = Date.now() - lastLaserTimeRef.current;
      if (immediate || !nextLaser.active || elapsed >= 25) {
        if (laserTimerRef.current) {
          window.clearTimeout(laserTimerRef.current);
          laserTimerRef.current = null;
        }
        sendToServer(nextLaser);
      } else {
        if (laserTimerRef.current) {
          window.clearTimeout(laserTimerRef.current);
        }
        laserTimerRef.current = window.setTimeout(() => {
          laserTimerRef.current = null;
          sendToServer(nextLaser);
        }, 25 - elapsed);
      }
    },
    [projectId, broadcastChannelRef]
  );

  // Automatic optical trail decay so the laser tail smoothly shrinks into the laser spot when the cursor stops moving
  useEffect(() => {
    if (toolMode !== 'laser' || !laser?.active) return undefined;
    if (!laser.trail || laser.trail.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      const now = Date.now();
      const currentTrail = laserTrailRef.current;
      if (currentTrail.length <= 1) return;

      const filtered = currentTrail.filter(
        (pt, idx) => idx === currentTrail.length - 1 || now - (pt.t || 0) < 280
      );
      const nextTrail =
        filtered.length < currentTrail.length ? filtered : currentTrail.slice(2);
      laserTrailRef.current = nextTrail;

      const currentLaser = laserRef.current;
      if (!currentLaser || !currentLaser.active) return;
      const updated: LaserPointerState = {
        ...currentLaser,
        trail: nextTrail,
      };
      laserRef.current = updated;
      setLaser(updated);
      emitLaserMove(updated);
    }, 40);

    return () => window.clearInterval(timer);
  }, [toolMode, laser?.active, laser?.trail?.length, emitLaserMove]);

  // Change laser color on the fly and sync immediately
  const handleChangeLaserColor = useCallback(
    (nextColor: string) => {
      setLaserColor(nextColor);
      const prev = laserRef.current;
      if (!prev || !prev.active) return;
      const updated: LaserPointerState = {
        ...prev,
        color: nextColor,
      };
      laserRef.current = updated;
      setLaser(updated);
      emitLaserMove(updated, true);
    },
    [emitLaserMove]
  );

  // Change laser mode ('free' | 'line' | 'crosshair') on the fly and sync immediately
  const handleChangeLaserMode = useCallback(
    (nextLaserMode: LaserModeType) => {
      setLaserMode(nextLaserMode);
      laserDrawnStrokeRef.current = [];
      laserOriginRef.current = null;
      const prev = laserRef.current;
      if (!prev || !prev.active) return;
      const updated: LaserPointerState = {
        ...prev,
        laserMode: nextLaserMode,
        originX: undefined,
        originY: undefined,
        drawnStroke: [],
      };
      laserRef.current = updated;
      setLaser(updated);
      emitLaserMove(updated, true);
    },
    [emitLaserMove]
  );

  // Clear drawn laser line/stroke on screen
  const handleClearLaserStroke = useCallback(() => {
    laserDrawnStrokeRef.current = [];
    laserOriginRef.current = null;
    const prev = laserRef.current;
    if (!prev || !prev.active) return;
    const updated: LaserPointerState = {
      ...prev,
      originX: undefined,
      originY: undefined,
      drawnStroke: [],
    };
    laserRef.current = updated;
    setLaser(updated);
    emitLaserMove(updated, true);
  }, [emitLaserMove]);

  // Freehand Pen & Organic Shapes Layer controls (Undo last shape, Clear all shapes, Show/Hide layer)
  const handleUndoLastDrawing = useCallback(() => {
    handleUpdateProject((prev) => {
      const list = prev.drawings || [];
      if (list.length === 0) return prev;
      return {
        ...prev,
        drawings: list.slice(0, -1),
      };
    });
  }, [handleUpdateProject]);

  const handleClearAllDrawings = useCallback(() => {
    handleUpdateProject((prev) => ({
      ...prev,
      drawings: [],
    }));
    showToast(t('تم مسح جميع الأشكال والرسومات الحرة على الشاشة', 'Cleared all freehand shapes on screen'));
  }, [handleUpdateProject, showToast, t]);

  const handleToggleShowDrawings = useCallback(() => {
    handleUpdateProject((prev) => ({
      ...prev,
      overlays: {
        ...prev.overlays,
        showDrawings: prev.overlays.showDrawings === false ? true : false,
      },
    }));
  }, [handleUpdateProject]);

  // Switch interaction tool mode (and immediately activate/deactivate Live Laser on screen)
  const handleSelectToolMode = useCallback(
    (nextMode: CanvasInteractionMode) => {
      if (nextMode === 'laser') {
        if (toolMode === 'laser' && laser?.active) {
          setToolMode('select');
          laserTrailRef.current = [];
          laserDrawnStrokeRef.current = [];
          laserOriginRef.current = null;
          laserDownRef.current = false;
          setLaser(null);
          emitLaserMove({ active: false, x: 0, y: 0, cellKey: null, displayId: null }, true);
          return;
        }
        setToolMode('laser');
        const startCell =
          (hoveredKey && computed.cellMap[hoveredKey]) ||
          computed.cells[Math.floor(computed.cells.length / 2)] ||
          null;
        const startX = startCell
          ? Math.round(startCell.x + startCell.width / 2)
          : Math.round(compWidth / 2);
        const startY = startCell
          ? Math.round(startCell.y + startCell.height / 2)
          : Math.round(compHeight / 2);
        const now = Date.now();
        laserTrailRef.current = [{ x: startX, y: startY, t: now }];
        laserDrawnStrokeRef.current = [];
        laserOriginRef.current = null;
        laserDownRef.current = false;
        const initialLaser: LaserPointerState = {
          active: true,
          isDown: false,
          x: startX,
          y: startY,
          color: laserColor,
          laserMode,
          cellKey: startCell?.key || null,
          displayId: startCell?.displayId || null,
          trail: [{ x: startX, y: startY, t: now }],
          drawnStroke: [],
        };
        setLaser(initialLaser);
        emitLaserMove(initialLaser, true);
      } else {
        setToolMode(nextMode);
        if (nextMode === 'draw') {
          setHoveredKey(null);
          if (showDrawingsOverlay === false) {
            handleUpdateProject((prev) => ({
              ...prev,
              overlays: {
                ...prev.overlays,
                showDrawings: true,
              },
            }));
          }
        }
        if (laser?.active) {
          laserTrailRef.current = [];
          laserDrawnStrokeRef.current = [];
          laserOriginRef.current = null;
          laserDownRef.current = false;
          setLaser(null);
          emitLaserMove({ active: false, x: 0, y: 0, cellKey: null, displayId: null }, true);
        }
      }
    },
    [
      toolMode,
      setToolMode,
      laser?.active,
      laserColor,
      laserMode,
      hoveredKey,
      setHoveredKey,
      computed.cellMap,
      computed.cells,
      compWidth,
      compHeight,
      showDrawingsOverlay,
      handleUpdateProject,
      emitLaserMove,
    ]
  );

  return {
    laser,
    setLaser,
    laserRef,
    laserColor,
    laserMode,
    laserTrailRef,
    laserDrawnStrokeRef,
    laserOriginRef,
    laserDownRef,
    emitLaserMove,
    handleChangeLaserColor,
    handleChangeLaserMode,
    handleClearLaserStroke,
    drawMode,
    setDrawMode,
    drawColor,
    setDrawColor,
    drawStrokeWidth,
    setDrawStrokeWidth,
    draftDrawingRef,
    handleUndoLastDrawing,
    handleClearAllDrawings,
    handleToggleShowDrawings,
    handleSelectToolMode,
  };
}
