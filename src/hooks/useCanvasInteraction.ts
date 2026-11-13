import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ComputedCell,
  FreehandDrawingItem,
  FreehandDrawMode,
  LaserModeType,
  LaserPointerState,
  LaserTrailPoint,
  NoteScope,
  RULER_COLOR_PALETTE,
  RulerOrientation,
  SELECTION_COLOR_SWATCHES,
  StudioNoteItem,
  StudioProject,
  StudioRuler,
} from '../types/studio';
import {
  ComputedGridResult,
  findGridIndexFromEdges,
  isPointInPolygon,
  sampleCanvasPixelFast,
} from '../utils/gridEngine';
import { CanvasInteractionMode } from './useLaserAndDrawing';

export const ZOOM_MIN = 0.08;
export const ZOOM_MAX = 6.0;

export interface ContextMenuState {
  clientX: number;
  clientY: number;
  cellKey: string;
  displayId: string;
  effectiveColor: string;
  existingNoteId: string | null;
  draftText: string;
  scope: NoteScope;
  errorMsg: string | null;
}

export interface SampledHoveredPixel {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  hex: string;
  ire: number;
}

export interface UseCanvasInteractionParams {
  project: StudioProject;
  computed: ComputedGridResult;
  rulers: StudioRuler[];
  activeScreenId: string;
  sidebarWidth: number;
  activeSidebarTab: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewportContainerRef: React.RefObject<HTMLDivElement | null>;
  isContinuousGestureRef: React.MutableRefObject<boolean>;
  setProject: (
    updaterOrVal: StudioProject | ((prev: StudioProject) => StudioProject),
    options?: { skipHistory?: boolean }
  ) => void;
  handleUpdateProject: (
    updater: (prev: StudioProject) => StudioProject,
    options?: { skipHistory?: boolean }
  ) => void;
  recordUndoSnapshot: (snapshot: StudioProject) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  toolMode: CanvasInteractionMode;
  setToolMode: React.Dispatch<React.SetStateAction<CanvasInteractionMode>>;
  hoveredKey: string | null;
  setHoveredKey: React.Dispatch<React.SetStateAction<string | null>>;
  isPanoramicWallView: boolean;
  setIsPanoramicWallView: React.Dispatch<React.SetStateAction<boolean>>;
  isPureWallMode: boolean;
  setIsPureWallMode: React.Dispatch<React.SetStateAction<boolean>>;
  isInAppLiveOutput: boolean;
  setIsInAppLiveOutput: React.Dispatch<React.SetStateAction<boolean>>;
  isSearchPopoverOpen: boolean;
  setIsSearchPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  squareSearchQuery: string;
  // Modal Escape handlers
  hasPendingImport: boolean;
  onClearPendingImport: () => void;
  isArenaModalOpen: boolean;
  onCloseArenaModal: () => void;
  isHelpModalOpen: boolean;
  onCloseHelpModal: () => void;
  isShortcutsModalOpen: boolean;
  setIsShortcutsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isPatchSheetModalOpen: boolean;
  onClosePatchSheetModal: () => void;
  isColorReportModalOpen: boolean;
  onCloseColorReportModal: () => void;
  isLibraryModalOpen: boolean;
  onCloseLibraryModal: () => void;
  isNewScreenModalOpen: boolean;
  onCloseNewScreenModal: () => void;
  // Laser & Drawing integration
  laser: LaserPointerState | null;
  setLaser: React.Dispatch<React.SetStateAction<LaserPointerState | null>>;
  laserColor: string;
  laserMode: LaserModeType;
  emitLaserMove: (nextLaser: LaserPointerState, immediate?: boolean) => void;
  laserTrailRef: React.MutableRefObject<LaserTrailPoint[]>;
  laserDrawnStrokeRef: React.MutableRefObject<LaserTrailPoint[]>;
  laserOriginRef: React.MutableRefObject<{ x: number; y: number } | null>;
  laserDownRef: React.MutableRefObject<boolean>;
  drawMode: FreehandDrawMode;
  drawColor: string;
  drawStrokeWidth: number;
  draftDrawingRef: React.MutableRefObject<(FreehandDrawingItem & { isLassoTiles?: boolean }) | null>;
  // Sync & Canvas Paint integration
  handleIdentifyScreen: (targetScreenId: string) => void;
  handleBlinkCellsOnLiveScreen: (cellKeys: string[]) => void;
  onPaintCanvas: () => void;
  onScheduleCanvasPaint: () => void;
  onSampledPixel: (pixel: SampledHoveredPixel | null) => void;
  t: (ar: string, en: string) => string;
  showToast: (msg: string) => void;
}

export function useCanvasInteraction({
  project,
  computed,
  rulers,
  activeScreenId,
  sidebarWidth,
  activeSidebarTab,
  canvasRef,
  viewportContainerRef,
  isContinuousGestureRef,
  setProject,
  handleUpdateProject,
  recordUndoSnapshot,
  handleUndo,
  handleRedo,
  toolMode,
  setToolMode,
  hoveredKey,
  setHoveredKey,
  isPanoramicWallView,
  setIsPanoramicWallView,
  isPureWallMode,
  setIsPureWallMode,
  isInAppLiveOutput,
  setIsInAppLiveOutput,
  isSearchPopoverOpen,
  setIsSearchPopoverOpen,
  squareSearchQuery,
  hasPendingImport,
  onClearPendingImport,
  isArenaModalOpen,
  onCloseArenaModal,
  isHelpModalOpen,
  onCloseHelpModal,
  isShortcutsModalOpen,
  setIsShortcutsModalOpen,
  isPatchSheetModalOpen,
  onClosePatchSheetModal,
  isColorReportModalOpen,
  onCloseColorReportModal,
  isLibraryModalOpen,
  onCloseLibraryModal,
  isNewScreenModalOpen,
  onCloseNewScreenModal,
  laser,
  setLaser,
  laserColor,
  laserMode,
  emitLaserMove,
  laserTrailRef,
  laserDrawnStrokeRef,
  laserOriginRef,
  laserDownRef,
  drawMode,
  drawColor,
  drawStrokeWidth,
  draftDrawingRef,
  handleIdentifyScreen,
  handleBlinkCellsOnLiveScreen,
  onPaintCanvas,
  onScheduleCanvasPaint,
  onSampledPixel,
  t,
  showToast,
}: UseCanvasInteractionParams) {
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);

  // Right-click Context Menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isContextColorPickerOpen, setIsContextColorPickerOpen] = useState<boolean>(false);
  const contextInputRef = useRef<HTMLInputElement | null>(null);

  // Drag Painting state for single-click / drag selection
  const [isPaintingSelection, setIsPaintingSelection] = useState<boolean>(false);
  const [paintMode, setPaintMode] = useState<'select' | 'deselect'>('select');

  // Box / Marquee Selection state
  const [marqueeRect, setMarqueeRect] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

  // Dragging a ruler directly on the canvas & Smart Snapping
  const [draggingRulerId, setDraggingRulerId] = useState<string | null>(null);
  const [snapRulersEnabled, setSnapRulersEnabled] = useState<boolean>(true);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [autoFit, setAutoFit] = useState<boolean>(true);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number }>({
    clientX: 0,
    clientY: 0,
    panX: 0,
    panY: 0,
  });

  // Minimap Radar state
  const [isMinimapOpen, setIsMinimapOpen] = useState<boolean>(true);
  const [isDraggingMinimap, setIsDraggingMinimap] = useState<boolean>(false);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const lastPixelSampleTimeRef = useRef<number>(0);

  // Map of color (UPPERCASE HEX) -> StudioNoteItem that currently owns that color
  const colorToNoteMap = useMemo(() => {
    const map = new Map<string, StudioNoteItem>();
    for (const note of project.notes || []) {
      const noteColor =
        note.targetColor ||
        (note.targetCellKey ? computed.cellMap[note.targetCellKey]?.effectiveColor : undefined);
      if (noteColor) {
        map.set(noteColor.toUpperCase(), note);
      }
    }
    return map;
  }, [project.notes, computed.cellMap]);

  // Helper to find the first unused selection color swatch
  const getNextUnusedSelectionColor = useCallback(
    (excludeHex?: string): string => {
      for (const sw of SELECTION_COLOR_SWATCHES) {
        const up = sw.hex.toUpperCase();
        if (excludeHex && up === excludeHex.toUpperCase()) continue;
        if (!colorToNoteMap.has(up)) {
          return sw.hex;
        }
      }
      return '#FDE047';
    },
    [colorToNoteMap]
  );

  // Focus input when context menu opens
  useEffect(() => {
    if (contextMenu) {
      window.setTimeout(() => {
        contextInputRef.current?.focus();
        contextInputRef.current?.select();
      }, 20);
    }
  }, [contextMenu?.cellKey]);

  // Fit-to-viewport calculation
  const recalculateFitZoom = useCallback(() => {
    const container = viewportContainerRef.current;
    if (!container) return;
    const availW = Math.max(200, container.clientWidth - 48);
    const availH = Math.max(180, container.clientHeight - 48);
    const bestScale = Number(
      Math.max(
        ZOOM_MIN,
        Math.min(2.5, Math.min(availW / project.compWidth, availH / project.compHeight))
      ).toFixed(3)
    );
    setZoom((prev) => (prev === bestScale ? prev : bestScale));
    setPan((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
  }, [viewportContainerRef, project.compWidth, project.compHeight]);

  useEffect(() => {
    if (!autoFit) return undefined;
    recalculateFitZoom();
    const handleResize = () => {
      if (autoFit) recalculateFitZoom();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [autoFit, recalculateFitZoom, activeScreenId, sidebarWidth]);

  // 5-Point Corner & Center Quick-Jump Handler for Giant Screens
  const handleJumpToCornerOrCenter = useCallback(
    (target: 'tl' | 'tr' | 'center' | 'bl' | 'br') => {
      const container = viewportContainerRef.current;
      if (!container) return;
      if (isPanoramicWallView) setIsPanoramicWallView(false);

      if (target === 'center') {
        setPan({ x: 0, y: 0 });
        showToast(t('تم التوسيط إلى مركز الشاشة ◎', 'Centered on Screen ◎'));
        return;
      }

      const availW = Math.max(240, container.clientWidth - 64);
      const availH = Math.max(200, container.clientHeight - 80);
      const fitScale = Math.min(availW / project.compWidth, availH / project.compHeight);
      const targetZoom = Math.max(zoom, Math.min(ZOOM_MAX, Math.max(0.85, fitScale * 2.4)));

      const scaledW = project.compWidth * targetZoom;
      const scaledH = project.compHeight * targetZoom;

      const maxPanX = Math.max(0, (scaledW - availW) / 2 + 24);
      const maxPanY = Math.max(0, (scaledH - availH) / 2 + 24);

      const nextPanX = target === 'tl' || target === 'bl' ? maxPanX : -maxPanX;
      const nextPanY = target === 'tl' || target === 'tr' ? maxPanY : -maxPanY;

      setAutoFit(false);
      setZoom(Number(targetZoom.toFixed(3)));
      setPan({ x: Math.round(nextPanX), y: Math.round(nextPanY) });

      const cornerLabels: Record<string, string> = {
        tl: t('الركن العلوي الأيسر ↖', 'Top-Left Corner ↖'),
        tr: t('الركن العلوي الأيمن ↗', 'Top-Right Corner ↗'),
        bl: t('الركن السفلي الأيسر ↙', 'Bottom-Left Corner ↙'),
        br: t('الركن السفلي الأيمن ↘', 'Bottom-Right Corner ↘'),
      };
      showToast(cornerLabels[target] || '');
    },
    [
      viewportContainerRef,
      isPanoramicWallView,
      setIsPanoramicWallView,
      project.compWidth,
      project.compHeight,
      zoom,
      showToast,
      t,
    ]
  );

  // Quick Square Search & Jump Handler
  const handleQuickJumpToSquare = useCallback(
    (rawQuery?: string) => {
      const q = (rawQuery ?? squareSearchQuery).trim().toUpperCase();
      if (!q) return;

      const matchedCell =
        computed.cells.find((c) => c.displayId.toUpperCase() === q) ||
        computed.cells.find((c) => c.coordId.toUpperCase() === q) ||
        computed.cells.find((c) => String(c.seqIndex) === q.replace(/^0+/, '')) ||
        computed.cells.find((c) => c.key === q);

      if (!matchedCell) {
        showToast(
          t(
            `لم يتم العثور على المربع "${q}" في الشاشة الحالية`,
            `Square "${q}" not found on active screen`
          )
        );
        return;
      }

      if (isPanoramicWallView) setIsPanoramicWallView(false);

      const idealCellScreenPx = 150;
      const minCellDim = Math.max(16, Math.min(matchedCell.width, matchedCell.height));
      const targetZoom = Math.max(
        zoom,
        Math.min(ZOOM_MAX, Math.max(0.75, idealCellScreenPx / minCellDim))
      );

      const cellCenterX = matchedCell.x + matchedCell.width / 2;
      const cellCenterY = matchedCell.y + matchedCell.height / 2;
      const offsetFromCanvasCenterX = project.compWidth / 2 - cellCenterX;
      const offsetFromCanvasCenterY = project.compHeight / 2 - cellCenterY;

      setAutoFit(false);
      setZoom(Number(targetZoom.toFixed(3)));
      setPan({
        x: Math.round(offsetFromCanvasCenterX * targetZoom),
        y: Math.round(offsetFromCanvasCenterY * targetZoom),
      });
      setHoveredKey(matchedCell.key);

      handleBlinkCellsOnLiveScreen([matchedCell.key]);
      showToast(
        t(
          `تم القفز إلى المربع ${matchedCell.displayId} (${matchedCell.coordId}) @ (${matchedCell.x},${matchedCell.y})`,
          `Jumped to Square ${matchedCell.displayId} (${matchedCell.coordId})`
        )
      );
    },
    [
      squareSearchQuery,
      computed.cells,
      isPanoramicWallView,
      setIsPanoramicWallView,
      zoom,
      project.compWidth,
      project.compHeight,
      setHoveredKey,
      handleBlinkCellsOnLiveScreen,
      showToast,
      t,
    ]
  );

  // Interactive Minimap Radar Panning Helper
  const panFromMinimapClientCoords = useCallback(
    (clientX: number, clientY: number, boostZoomIfFullView = false) => {
      const miniEl = minimapCanvasRef.current || minimapRef.current;
      if (!miniEl) return;
      const rect = miniEl.getBoundingClientRect();
      const relX = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      const relY = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));

      const targetCanvasX = relX * project.compWidth;
      const targetCanvasY = relY * project.compHeight;

      const offsetFromCenterX = project.compWidth / 2 - targetCanvasX;
      const offsetFromCenterY = project.compHeight / 2 - targetCanvasY;

      let effectiveZoom = zoom;
      if (boostZoomIfFullView) {
        const stageEl = viewportContainerRef.current;
        const stageW = stageEl ? Math.max(240, stageEl.clientWidth - 48) : 960;
        const stageH = stageEl ? Math.max(180, stageEl.clientHeight - 48) : 640;
        const visW = stageW / Math.max(1, project.compWidth * zoom);
        const visH = stageH / Math.max(1, project.compHeight * zoom);
        if (autoFit || (visW >= 0.92 && visH >= 0.92)) {
          effectiveZoom = Number(
            Math.min(ZOOM_MAX, Math.max(zoom * 1.9, 1.15)).toFixed(3)
          );
          setZoom(effectiveZoom);
        }
      }

      setAutoFit(false);
      setPan({
        x: Math.round(offsetFromCenterX * effectiveZoom),
        y: Math.round(offsetFromCenterY * effectiveZoom),
      });
    },
    [viewportContainerRef, project.compWidth, project.compHeight, zoom, autoFit]
  );

  const handleMinimapWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const miniEl = minimapCanvasRef.current;
      if (!miniEl) return;
      const rect = miniEl.getBoundingClientRect();
      const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));

      const zoomFactor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      const nextZoom = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, Number((zoom * zoomFactor).toFixed(3)))
      );
      if (nextZoom === zoom) return;

      const targetCanvasX = relX * project.compWidth;
      const targetCanvasY = relY * project.compHeight;
      const offsetFromCenterX = project.compWidth / 2 - targetCanvasX;
      const offsetFromCenterY = project.compHeight / 2 - targetCanvasY;

      setAutoFit(false);
      setZoom(nextZoom);
      setPan({
        x: Math.round(offsetFromCenterX * nextZoom),
        y: Math.round(offsetFromCenterY * nextZoom),
      });
    },
    [zoom, project.compWidth, project.compHeight]
  );

  useEffect(() => {
    if (!isDraggingMinimap) return undefined;
    const onMove = (e: MouseEvent) => {
      panFromMinimapClientCoords(e.clientX, e.clientY, false);
    };
    const onUp = () => {
      setIsDraggingMinimap(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingMinimap, panFromMinimapClientCoords]);

  // Wheel Zoom toward cursor
  const handleViewportWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const container = viewportContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const cursorRelX = e.clientX - (rect.left + rect.width / 2);
      const cursorRelY = e.clientY - (rect.top + rect.height / 2);

      const zoomFactor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      const nextZoom = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, Number((zoom * zoomFactor).toFixed(3)))
      );
      if (nextZoom === zoom) return;

      const scaleRatio = nextZoom / zoom;
      setAutoFit(false);
      setZoom(nextZoom);
      setPan({
        x: Math.round(cursorRelX - (cursorRelX - pan.x) * scaleRatio),
        y: Math.round(cursorRelY - (cursorRelY - pan.y) * scaleRatio),
      });
    },
    [viewportContainerRef, zoom, pan]
  );

  // Spacebar Pan, Undo/Redo (Ctrl+Z / Ctrl+Y), & Keyboard Zoom shortcuts
  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (hasPendingImport) {
          onClearPendingImport();
          return;
        }
        if (isContextColorPickerOpen) {
          setIsContextColorPickerOpen(false);
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (isArenaModalOpen) {
          onCloseArenaModal();
          return;
        }
        if (isHelpModalOpen) {
          onCloseHelpModal();
          return;
        }
        if (isShortcutsModalOpen) {
          setIsShortcutsModalOpen(false);
          return;
        }
        if (isPatchSheetModalOpen) {
          onClosePatchSheetModal();
          return;
        }
        if (isColorReportModalOpen) {
          onCloseColorReportModal();
          return;
        }
        if (isLibraryModalOpen) {
          onCloseLibraryModal();
          return;
        }
        if (isNewScreenModalOpen) {
          onCloseNewScreenModal();
          return;
        }
        if (isPureWallMode) {
          setIsPureWallMode(false);
          return;
        }
        if (isInAppLiveOutput) {
          setIsInAppLiveOutput(false);
          return;
        }
        if (isSearchPopoverOpen) {
          setIsSearchPopoverOpen(false);
          return;
        }
        setProject((prev) => (prev.focusedNoteId ? { ...prev, focusedNoteId: null } : prev));
        return;
      }
      if (isInputFocused()) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setAutoFit(false);
        setZoom((z) => Math.min(ZOOM_MAX, Number((z * 1.2).toFixed(3))));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setAutoFit(false);
        setZoom((z) => Math.max(ZOOM_MIN, Number((z / 1.2).toFixed(3))));
      } else if (e.key === '0') {
        e.preventDefault();
        setAutoFit(true);
        recalculateFitZoom();
      } else if (e.key === '?' || e.key === '؟') {
        e.preventDefault();
        setIsShortcutsModalOpen((v) => !v);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'f') {
          e.preventDefault();
          handleIdentifyScreen(project.id);
        } else if (k === 'p') {
          e.preventDefault();
          setIsPanoramicWallView(true);
          setIsPureWallMode((v) => !v);
        } else if (k === 'g') {
          e.preventDefault();
          setIsPanoramicWallView((v) => !v);
        } else if (k === 'm') {
          e.preventDefault();
          setIsMinimapOpen((v) => !v);
        } else if (k === 'l') {
          e.preventDefault();
          setToolMode((prev) => (prev === 'laser' ? 'select' : 'laser'));
        } else if (k === 'd') {
          e.preventDefault();
          setHoveredKey(null);
          setToolMode((prev) => {
            const next = prev === 'draw' ? 'select' : 'draw';
            if (next === 'draw') {
              setProject(
                (p) =>
                  p.overlays.showDrawings === false
                    ? { ...p, overlays: { ...p.overlays, showDrawings: true } }
                    : p,
                { skipHistory: true }
              );
            }
            return next;
          });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    recalculateFitZoom,
    hasPendingImport,
    onClearPendingImport,
    isContextColorPickerOpen,
    contextMenu,
    isArenaModalOpen,
    onCloseArenaModal,
    isHelpModalOpen,
    onCloseHelpModal,
    isShortcutsModalOpen,
    setIsShortcutsModalOpen,
    isPatchSheetModalOpen,
    onClosePatchSheetModal,
    isColorReportModalOpen,
    onCloseColorReportModal,
    isLibraryModalOpen,
    onCloseLibraryModal,
    isNewScreenModalOpen,
    onCloseNewScreenModal,
    isPureWallMode,
    setIsPureWallMode,
    isInAppLiveOutput,
    setIsInAppLiveOutput,
    isSearchPopoverOpen,
    setIsSearchPopoverOpen,
    setIsPanoramicWallView,
    setToolMode,
    setHoveredKey,
    setProject,
    project.id,
    handleIdentifyScreen,
    handleUndo,
    handleRedo,
  ]);

  // Add a Horizontal or Vertical Ruler
  const handleAddRuler = useCallback(
    (orientation: RulerOrientation) => {
      const existingCount = rulers.filter((r) => r.orientation === orientation).length;
      const color = RULER_COLOR_PALETTE[rulers.length % RULER_COLOR_PALETTE.length];
      const defaultPos =
        orientation === 'horizontal'
          ? Math.round(project.compHeight * (0.25 + ((existingCount * 0.2) % 0.6)))
          : Math.round(project.compWidth * (0.25 + ((existingCount * 0.2) % 0.6)));

      const newRuler: StudioRuler = {
        id: `ruler-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name:
          orientation === 'horizontal'
            ? t(`مسطرة أفقية ${existingCount + 1}`, `Horiz Ruler ${existingCount + 1}`)
            : t(`مسطرة عمودية ${existingCount + 1}`, `Vert Ruler ${existingCount + 1}`),
        orientation,
        positionPx: defaultPos,
        color,
        strokeWidth: 3,
        opacity: 95,
        dashed: false,
        showTicks: true,
        visible: true,
        locked: false,
      };

      handleUpdateProject((prev) => ({
        ...prev,
        overlays: {
          ...prev.overlays,
          showRulers: true,
        },
        rulers: [...(prev.rulers || []), newRuler],
      }));
    },
    [rulers, project.compHeight, project.compWidth, t, handleUpdateProject]
  );

  // Spawn a ruler from clicking/dragging the top (Horizontal Y) or side (Vertical X) canvas edge bars
  const handleSpawnRulerFromEdge = useCallback(
    (orientation: RulerOrientation) => {
      const existingCount = rulers.filter((r) => r.orientation === orientation).length;
      const color = RULER_COLOR_PALETTE[rulers.length % RULER_COLOR_PALETTE.length];
      const maxDim = orientation === 'horizontal' ? project.compHeight : project.compWidth;
      const defaultPos = Math.round(maxDim * (0.25 + ((existingCount * 0.2) % 0.6)));

      const newRuler: StudioRuler = {
        id: `ruler-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name:
          orientation === 'horizontal'
            ? t(`مسطرة أفقية ${existingCount + 1}`, `Horiz Ruler ${existingCount + 1}`)
            : t(`مسطرة عمودية ${existingCount + 1}`, `Vert Ruler ${existingCount + 1}`),
        orientation,
        positionPx: defaultPos,
        color,
        strokeWidth: 3,
        opacity: 95,
        dashed: false,
        showTicks: true,
        visible: true,
        locked: false,
      };

      handleUpdateProject((prev) => ({
        ...prev,
        overlays: {
          ...prev.overlays,
          showRulers: true,
        },
        rulers: [...(prev.rulers || []), newRuler],
      }));
      isContinuousGestureRef.current = true;
      setDraggingRulerId(newRuler.id);
    },
    [rulers, project.compHeight, project.compWidth, t, handleUpdateProject, isContinuousGestureRef]
  );

  const handleUpdateRuler = useCallback(
    (
      rulerId: string,
      patchOrUpdater: Partial<StudioRuler> | ((prev: StudioRuler) => StudioRuler)
    ) => {
      handleUpdateProject((prev) => ({
        ...prev,
        rulers: (prev.rulers || []).map((r) => {
          if (r.id !== rulerId) return r;
          return typeof patchOrUpdater === 'function'
            ? patchOrUpdater(r)
            : { ...r, ...patchOrUpdater };
        }),
      }));
    },
    [handleUpdateProject]
  );

  const handleDeleteRuler = useCallback(
    (rulerId: string) => {
      handleUpdateProject((prev) => ({
        ...prev,
        rulers: (prev.rulers || []).filter((r) => r.id !== rulerId),
      }));
    },
    [handleUpdateProject]
  );

  const handleToggleLockAllRulers = useCallback(() => {
    const allLocked = rulers.length > 0 && rulers.every((r) => r.locked);
    handleUpdateProject((prev) => ({
      ...prev,
      rulers: (prev.rulers || []).map((r) => ({ ...r, locked: !allLocked })),
    }));
    showToast(
      !allLocked
        ? t('تم قفل تحريك جميع المساطر على الشاشة 🔒', 'Locked all rulers on canvas 🔒')
        : t('تم فتح قفل المساطر', 'Unlocked all rulers')
    );
  }, [rulers, handleUpdateProject, showToast, t]);

  const handleAddRulersAroundSelection = useCallback(() => {
    const selectedCells = computed.cells.filter((c) => c.hasCustomColor);
    if (selectedCells.length === 0) {
      showToast(t('حدد مربعاً واحداً على الأقل أولاً', 'Select at least one square first'));
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const c of selectedCells) {
      if (c.x < minX) minX = c.x;
      if (c.x + c.width > maxX) maxX = c.x + c.width;
      if (c.y < minY) minY = c.y;
      if (c.y + c.height > maxY) maxY = c.y + c.height;
    }

    const baseId = Date.now();
    const color = '#38BDF8';
    const newRulers: StudioRuler[] = [
      {
        id: `ruler-${baseId}-left`,
        name: t('يسار التحديد', 'Selection Left'),
        orientation: 'vertical',
        positionPx: Math.round(minX),
        color,
        strokeWidth: 3,
        opacity: 95,
        dashed: false,
        showTicks: true,
        visible: true,
        locked: false,
      },
      {
        id: `ruler-${baseId}-right`,
        name: t('يمين التحديد', 'Selection Right'),
        orientation: 'vertical',
        positionPx: Math.round(maxX),
        color,
        strokeWidth: 3,
        opacity: 95,
        dashed: false,
        showTicks: true,
        visible: true,
        locked: false,
      },
      {
        id: `ruler-${baseId}-top`,
        name: t('أعلى التحديد', 'Selection Top'),
        orientation: 'horizontal',
        positionPx: Math.round(minY),
        color,
        strokeWidth: 3,
        opacity: 95,
        dashed: false,
        showTicks: true,
        visible: true,
        locked: false,
      },
      {
        id: `ruler-${baseId}-bottom`,
        name: t('أسفل التحديد', 'Selection Bottom'),
        orientation: 'horizontal',
        positionPx: Math.round(maxY),
        color,
        strokeWidth: 3,
        opacity: 95,
        dashed: false,
        showTicks: true,
        visible: true,
        locked: false,
      },
    ];

    handleUpdateProject((prev) => ({
      ...prev,
      overlays: {
        ...prev.overlays,
        showRulerDistances: true,
      },
      rulers: [...(prev.rulers || []), ...newRulers],
    }));

    showToast(
      t(
        'تمت إحاطة التحديد بـ 4 مساطر وتفعيل قياس المسافات تلقائياً',
        'Added 4 rulers around selection & enabled distance measurement'
      )
    );
  }, [computed.cells, handleUpdateProject, showToast, t]);

  // Invert square selection on the active screen
  const handleInvertSelection = useCallback(() => {
    handleUpdateProject((prev) => {
      const nextOverrides = { ...prev.overrides };
      const activeHex = (prev.selectionColor || '#FDE047').toUpperCase();

      for (const cell of computed.cells) {
        const existing = nextOverrides[cell.key];
        if (cell.hasCustomColor) {
          if (existing) {
            const copy = { ...existing };
            delete copy.color;
            if (!copy.label && !copy.directorNote) {
              delete nextOverrides[cell.key];
            } else {
              nextOverrides[cell.key] = copy;
            }
          }
        } else {
          nextOverrides[cell.key] = {
            ...existing,
            cellKey: cell.key,
            color: activeHex,
            updatedAt: new Date().toISOString(),
          };
        }
      }

      return {
        ...prev,
        overrides: nextOverrides,
        focusedNoteId: null,
      };
    });
    showToast(t('تم عكس التحديد على الشبكة', 'Selection Inverted'));
  }, [computed.cells, handleUpdateProject, showToast, t]);

  // Toggle selection color on a cell
  const applySelectionToCell = useCallback(
    (cellKey: string, mode: 'select' | 'deselect', colorToApply?: string) => {
      setProject((prev) => {
        const nextOverrides = { ...prev.overrides };
        const existing = nextOverrides[cellKey];
        const activeHex = (colorToApply || prev.selectionColor).toUpperCase();

        if (mode === 'select') {
          nextOverrides[cellKey] = {
            ...existing,
            cellKey,
            color: activeHex,
            updatedAt: new Date().toISOString(),
          };
        } else {
          if (existing) {
            const copy = { ...existing };
            delete copy.color;
            if (!copy.label && !copy.directorNote) {
              delete nextOverrides[cellKey];
            } else {
              nextOverrides[cellKey] = copy;
            }
          }
        }
        return {
          ...prev,
          overrides: nextOverrides,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [setProject]
  );

  // Canvas pointer coordinates
  const getCanvasCoords = (
    e: React.MouseEvent<HTMLCanvasElement>
  ): { x: number; y: number; cell: ComputedCell | null } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, cell: null };
    const rect = canvas.getBoundingClientRect();
    const scaleX = project.compWidth / rect.width;
    const scaleY = project.compHeight / rect.height;
    const x = Math.max(
      0,
      Math.min(project.compWidth - 1, Math.round((e.clientX - rect.left) * scaleX))
    );
    const y = Math.max(
      0,
      Math.min(project.compHeight - 1, Math.round((e.clientY - rect.top) * scaleY))
    );
    const col = findGridIndexFromEdges(computed.colEdges, x);
    const row = findGridIndexFromEdges(computed.rowEdges, y);
    const key = `${row}-${col}`;
    return { x, y, cell: computed.cellMap[key] || null };
  };

  // Hit-test if pointer is near a visible & UNLOCKED ruler for direct dragging on canvas
  const findHitRuler = (x: number, y: number): StudioRuler | null => {
    if (project.overlays?.showRulers === false) return null;
    const hitTolerance = Math.max(12, Math.round(14 / zoom));
    for (let i = rulers.length - 1; i >= 0; i--) {
      const r = rulers[i];
      if (r.visible === false || r.locked) continue;
      if (r.orientation === 'horizontal' && Math.abs(y - r.positionPx) <= hitTolerance) {
        return r;
      }
      if (r.orientation === 'vertical' && Math.abs(x - r.positionPx) <= hitTolerance) {
        return r;
      }
    }
    return null;
  };

  // Smart snapping helper for ruler positions
  const computeSnappedRulerPosition = useCallback(
    (rawPx: number, orientation: RulerOrientation, forceSnap: boolean): number => {
      const maxDim = orientation === 'horizontal' ? project.compHeight : project.compWidth;
      const clamped = Math.max(0, Math.min(maxDim, Math.round(rawPx)));
      if (!snapRulersEnabled && !forceSnap) return clamped;

      const snapTolerance = Math.max(10, Math.round(12 / zoom));
      const centerPx = Math.round(maxDim / 2);

      if (Math.abs(clamped - centerPx) <= snapTolerance) {
        return centerPx;
      }

      const edges = orientation === 'horizontal' ? computed.rowEdges : computed.colEdges;
      let bestEdge = clamped;
      let bestDist = snapTolerance + 1;
      for (let i = 0; i < edges.length; i++) {
        const dist = Math.abs(clamped - edges[i]);
        if (dist <= snapTolerance && dist < bestDist) {
          bestDist = dist;
          bestEdge = edges[i];
        }
      }
      if (bestDist <= snapTolerance) {
        return Math.round(bestEdge);
      }

      return clamped;
    },
    [
      project.compHeight,
      project.compWidth,
      snapRulersEnabled,
      zoom,
      computed.rowEdges,
      computed.colEdges,
    ]
  );

  // Global window mousemove/mouseup for dragging rulers
  useEffect(() => {
    if (!draggingRulerId) return undefined;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const targetRuler = rulers.find((r) => r.id === draggingRulerId);
      if (!targetRuler || targetRuler.locked) return;

      if (targetRuler.orientation === 'horizontal') {
        if (e.clientY >= rect.top) {
          const scaleY = project.compHeight / rect.height;
          const rawY = Math.max(
            0,
            Math.min(project.compHeight, Math.round((e.clientY - rect.top) * scaleY))
          );
          const nextPos = computeSnappedRulerPosition(rawY, 'horizontal', e.shiftKey);
          if (targetRuler.positionPx !== nextPos) {
            handleUpdateRuler(draggingRulerId, { positionPx: nextPos });
          }
        }
      } else {
        if (e.clientX >= rect.left) {
          const scaleX = project.compWidth / rect.width;
          const rawX = Math.max(
            0,
            Math.min(project.compWidth, Math.round((e.clientX - rect.left) * scaleX))
          );
          const nextPos = computeSnappedRulerPosition(rawX, 'vertical', e.shiftKey);
          if (targetRuler.positionPx !== nextPos) {
            handleUpdateRuler(draggingRulerId, { positionPx: nextPos });
          }
        }
      }
    };

    const handleWindowMouseUp = () => {
      isContinuousGestureRef.current = false;
      setDraggingRulerId(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [
    canvasRef,
    draggingRulerId,
    rulers,
    project.compHeight,
    project.compWidth,
    computeSnappedRulerPosition,
    handleUpdateRuler,
    isContinuousGestureRef,
  ]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    setContextMenu(null);

    if (toolMode === 'pan' || isSpacePressed || e.button === 1) {
      setIsPanning(true);
      setAutoFit(false);
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }

    const { x, y, cell } = getCanvasCoords(e);

    if (toolMode === 'laser') {
      const now = Date.now();
      laserDownRef.current = true;
      laserOriginRef.current = { x, y };
      laserTrailRef.current = [{ x, y, t: now }];
      laserDrawnStrokeRef.current = [{ x, y, t: now }];
      const nextLaser: LaserPointerState = {
        active: true,
        isDown: true,
        x,
        y,
        originX: x,
        originY: y,
        color: laserColor,
        laserMode,
        cellKey: cell?.key || null,
        displayId: cell?.displayId || null,
        trail: [{ x, y, t: now }],
        drawnStroke: [{ x, y, t: now }],
      };
      setLaser(nextLaser);
      emitLaserMove(nextLaser, true);
      return;
    }

    if (toolMode === 'draw') {
      if (hoveredKey !== null) setHoveredKey(null);
      const isLasso = drawMode === 'lasso_tiles';
      const itemMode: FreehandDrawingItem['mode'] =
        drawMode === 'lasso_tiles' ? 'polygon' : drawMode;
      draftDrawingRef.current = {
        id: `draw-${Date.now()}`,
        mode: itemMode,
        points: [{ x, y }],
        color: isLasso ? project.selectionColor || '#FACC15' : drawColor,
        strokeWidth: drawStrokeWidth,
        closed: drawMode === 'polygon' || isLasso,
        fillOpacity: drawMode === 'polygon' || drawMode === 'ellipse' ? 0.22 : 0,
        isLassoTiles: isLasso,
      };
      onPaintCanvas();
      return;
    }

    const hitRuler = findHitRuler(x, y);
    if (hitRuler) {
      recordUndoSnapshot(project);
      isContinuousGestureRef.current = true;
      setDraggingRulerId(hitRuler.id);
      return;
    }

    if (toolMode === 'box') {
      recordUndoSnapshot(project);
      isContinuousGestureRef.current = true;
      setMarqueeRect({ x1: x, y1: y, x2: x, y2: y });
      return;
    }

    if (!cell) return;

    recordUndoSnapshot(project);
    isContinuousGestureRef.current = true;

    if (project.focusedNoteId) {
      setProject((prev) => ({ ...prev, focusedNoteId: null }), { skipHistory: true });
    }

    const activeSelColor = project.selectionColor.toUpperCase();

    const existingOwnerNote = colorToNoteMap.get(activeSelColor);
    if (
      existingOwnerNote &&
      existingOwnerNote.scope === 'single' &&
      existingOwnerNote.targetCellKey !== cell.key &&
      (!cell.hasCustomColor || cell.effectiveColor.toUpperCase() !== activeSelColor)
    ) {
      const freshColor = getNextUnusedSelectionColor(activeSelColor);
      setProject((prev) => ({ ...prev, selectionColor: freshColor }), { skipHistory: true });
      showToast(
        t(
          'اللون السابق محجوز لملاحظة صندوق فردي — تم التحويل للون تحديد جديد تلقائياً',
          'Previous color is reserved for a single-square note; switched to a new color'
        )
      );
      setPaintMode('select');
      setIsPaintingSelection(true);
      applySelectionToCell(cell.key, 'select', freshColor);
      return;
    }

    const isAlreadySameSelectionColor =
      cell.hasCustomColor && cell.effectiveColor.toUpperCase() === activeSelColor;

    const nextMode: 'select' | 'deselect' = isAlreadySameSelectionColor ? 'deselect' : 'select';
    setPaintMode(nextMode);
    setIsPaintingSelection(true);
    applySelectionToCell(cell.key, nextMode);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPan({
        x: panStartRef.current.panX + (e.clientX - panStartRef.current.clientX),
        y: panStartRef.current.panY + (e.clientY - panStartRef.current.clientY),
      });
      return;
    }

    const { x, y, cell } = getCanvasCoords(e);

    if (toolMode === 'laser') {
      setHoveredKey(cell?.key || null);
      const now = Date.now();
      const prevTrail = laserTrailRef.current.filter((pt) => now - (pt.t || now) < 300);
      const lastPt = prevTrail[prevTrail.length - 1];
      const nextTrail =
        !lastPt || Math.hypot(x - lastPt.x, y - lastPt.y) >= 3
          ? [...prevTrail.slice(-22), { x, y, t: now }]
          : prevTrail;
      laserTrailRef.current = nextTrail;

      if (laserDownRef.current) {
        if (laserMode === 'free') {
          const prevStroke = laserDrawnStrokeRef.current;
          const lastStrokePt = prevStroke[prevStroke.length - 1];
          if (!lastStrokePt || Math.hypot(x - lastStrokePt.x, y - lastStrokePt.y) >= 4) {
            laserDrawnStrokeRef.current = [...prevStroke.slice(-180), { x, y, t: now }];
          }
        } else if (laserMode === 'line' && laserOriginRef.current) {
          laserDrawnStrokeRef.current = [
            { x: laserOriginRef.current.x, y: laserOriginRef.current.y, t: now },
            { x, y, t: now },
          ];
        }
      }

      const nextLaser: LaserPointerState = {
        active: true,
        isDown: laserDownRef.current,
        x,
        y,
        originX: laserOriginRef.current?.x,
        originY: laserOriginRef.current?.y,
        color: laserColor,
        laserMode,
        cellKey: cell?.key || null,
        displayId: cell?.displayId || null,
        trail: nextTrail,
        drawnStroke: laserDrawnStrokeRef.current,
      };
      setLaser(nextLaser);
      emitLaserMove(nextLaser);
      return;
    }

    if (draggingRulerId) {
      const targetRuler = rulers.find((r) => r.id === draggingRulerId);
      if (targetRuler && !targetRuler.locked) {
        const rawCoord = targetRuler.orientation === 'horizontal' ? y : x;
        const nextPos = computeSnappedRulerPosition(
          rawCoord,
          targetRuler.orientation,
          e.shiftKey
        );
        handleUpdateRuler(draggingRulerId, { positionPx: nextPos });
      }
      return;
    }

    if (marqueeRect) {
      setMarqueeRect((prev) => (prev ? { ...prev, x2: x, y2: y } : null));
      return;
    }

    if (toolMode === 'draw') {
      if (hoveredKey !== null) setHoveredKey(null);
      if (draftDrawingRef.current) {
        const currentDraft = draftDrawingRef.current;
        const pts = currentDraft.points;
        const lastPt = pts[pts.length - 1];
        if (currentDraft.mode === 'ellipse' || currentDraft.mode === 'arrow') {
          draftDrawingRef.current = {
            ...currentDraft,
            points: [pts[0], { x, y }],
          };
          onScheduleCanvasPaint();
        } else if (!lastPt || Math.hypot(x - lastPt.x, y - lastPt.y) >= 3) {
          draftDrawingRef.current = {
            ...currentDraft,
            points: [...pts, { x, y }],
          };
          onScheduleCanvasPaint();
        }
      }
      return;
    }

    const nextHoverKey = cell?.key || null;
    if (nextHoverKey !== hoveredKey) {
      setHoveredKey(nextHoverKey);
    }

    if (activeSidebarTab === 'colors' || activeSidebarTab === 'all') {
      const nowMs = performance.now();
      if (nowMs - lastPixelSampleTimeRef.current >= 40) {
        lastPixelSampleTimeRef.current = nowMs;
        const sampled = sampleCanvasPixelFast(canvasRef.current, x, y);
        if (sampled) {
          onSampledPixel(sampled);
        }
      }
    }

    if (isPaintingSelection && cell) {
      const activeSelColor = project.selectionColor.toUpperCase();
      const existingOwnerNote = colorToNoteMap.get(activeSelColor);
      if (existingOwnerNote && existingOwnerNote.scope === 'single') {
        return;
      }
      applySelectionToCell(cell.key, paintMode);
    }
  };

  const handleCanvasMouseUp = () => {
    if (toolMode === 'laser' && laserDownRef.current) {
      laserDownRef.current = false;
      laserOriginRef.current = null;
      if (laser) {
        const releasedLaser: LaserPointerState = {
          ...laser,
          isDown: false,
          originX: undefined,
          originY: undefined,
          color: laserColor,
          laserMode,
          drawnStroke: laserDrawnStrokeRef.current,
        };
        setLaser(releasedLaser);
        emitLaserMove(releasedLaser, true);
      }
    }

    if (marqueeRect) {
      const rx1 = Math.min(marqueeRect.x1, marqueeRect.x2);
      const ry1 = Math.min(marqueeRect.y1, marqueeRect.y2);
      const rx2 = Math.max(marqueeRect.x1, marqueeRect.x2);
      const ry2 = Math.max(marqueeRect.y1, marqueeRect.y2);

      const intersectingCells = computed.cells.filter(
        (c) => c.x < rx2 && c.x + c.width > rx1 && c.y < ry2 && c.y + c.height > ry1
      );

      if (intersectingCells.length > 0) {
        const activeHex = (project.selectionColor || '#FDE047').toUpperCase();
        const allAlreadySelectedWithSameColor = intersectingCells.every(
          (c) => c.hasCustomColor && c.effectiveColor.toUpperCase() === activeHex
        );

        setProject(
          (prev) => {
            const nextOverrides = { ...prev.overrides };
            for (const c of intersectingCells) {
              const existing = nextOverrides[c.key];
              if (allAlreadySelectedWithSameColor) {
                if (existing) {
                  const copy = { ...existing };
                  delete copy.color;
                  if (!copy.label && !copy.directorNote) {
                    delete nextOverrides[c.key];
                  } else {
                    nextOverrides[c.key] = copy;
                  }
                }
              } else {
                nextOverrides[c.key] = {
                  ...existing,
                  cellKey: c.key,
                  color: activeHex,
                  updatedAt: new Date().toISOString(),
                };
              }
            }
            return {
              ...prev,
              overrides: nextOverrides,
              focusedNoteId: null,
              updatedAt: new Date().toISOString(),
            };
          },
          { skipHistory: true }
        );
      }
      setMarqueeRect(null);
    }

    if (draftDrawingRef.current) {
      const completedDraft = draftDrawingRef.current;
      draftDrawingRef.current = null;
      if (completedDraft.points.length >= 2) {
        if (completedDraft.isLassoTiles && completedDraft.points.length >= 3) {
          const matchedCells = computed.cells.filter((c) =>
            isPointInPolygon(c.x + c.width / 2, c.y + c.height / 2, completedDraft.points)
          );
          if (matchedCells.length > 0) {
            recordUndoSnapshot(project);
            const activeHex = (project.selectionColor || '#FDE047').toUpperCase();
            const allAlreadySameColor = matchedCells.every(
              (c) => c.hasCustomColor && c.effectiveColor.toUpperCase() === activeHex
            );
            setProject(
              (prev) => {
                const nextOverrides = { ...prev.overrides };
                for (const c of matchedCells) {
                  const existing = nextOverrides[c.key];
                  if (allAlreadySameColor) {
                    if (existing) {
                      const copy = { ...existing };
                      delete copy.color;
                      if (!copy.label && !copy.directorNote) {
                        delete nextOverrides[c.key];
                      } else {
                        nextOverrides[c.key] = copy;
                      }
                    }
                  } else {
                    nextOverrides[c.key] = {
                      ...existing,
                      cellKey: c.key,
                      color: activeHex,
                      updatedAt: new Date().toISOString(),
                    };
                  }
                }
                return {
                  ...prev,
                  overrides: nextOverrides,
                  focusedNoteId: null,
                  updatedAt: new Date().toISOString(),
                };
              },
              { skipHistory: true }
            );
            showToast(
              t(
                `تم تحديد ${matchedCells.length} بلاطة داخل الشكل الحر`,
                `Selected ${matchedCells.length} tiles inside freeform lasso`
              )
            );
          } else {
            onPaintCanvas();
          }
        } else {
          const cleanItem: FreehandDrawingItem = {
            id: completedDraft.id,
            mode: completedDraft.mode,
            points: completedDraft.points,
            color: completedDraft.color,
            strokeWidth: completedDraft.strokeWidth,
            closed: completedDraft.closed,
            fillOpacity: completedDraft.fillOpacity,
          };
          handleUpdateProject((prev) => ({
            ...prev,
            overlays: {
              ...prev.overlays,
              showDrawings: true,
            },
            drawings: [...(prev.drawings || []), cleanItem],
          }));
        }
      } else {
        onPaintCanvas();
      }
    }

    isContinuousGestureRef.current = false;
    setIsPanning(false);
    setIsPaintingSelection(false);
    setDraggingRulerId(null);
  };

  const handleCanvasMouseLeave = () => {
    isContinuousGestureRef.current = false;
    setIsPanning(false);
    setIsPaintingSelection(false);
    setDraggingRulerId(null);
    setMarqueeRect(null);
    if (draftDrawingRef.current) {
      draftDrawingRef.current = null;
      onPaintCanvas();
    }
    setHoveredKey(null);
    onSampledPixel(null);
    if (toolMode === 'laser' && laser?.active) {
      laserDownRef.current = false;
      laserOriginRef.current = null;
      const parkedLaser: LaserPointerState = {
        ...laser,
        isDown: false,
        originX: undefined,
        originY: undefined,
        color: laserColor,
        laserMode,
        trail: [{ x: laser.x, y: laser.y, t: Date.now() }],
        drawnStroke: laserDrawnStrokeRef.current,
      };
      setLaser(parkedLaser);
      emitLaserMove(parkedLaser, true);
    }
  };

  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { cell } = getCanvasCoords(e);
    if (!cell) return;

    let targetColor = cell.hasCustomColor
      ? cell.effectiveColor.toUpperCase()
      : project.selectionColor.toUpperCase();

    if (!cell.hasCustomColor) {
      const ownerOfCurrentSel = colorToNoteMap.get(targetColor);
      if (ownerOfCurrentSel) {
        targetColor = getNextUnusedSelectionColor(targetColor).toUpperCase();
        setProject((prev) => ({ ...prev, selectionColor: targetColor }));
      }
      applySelectionToCell(cell.key, 'select', targetColor);
    }

    const notesList = project.notes || [];
    const singleNoteOnCell = notesList.find(
      (n) => n.scope === 'single' && n.targetCellKey === cell.key
    );
    const groupNoteOnColor = notesList.find(
      (n) =>
        n.scope === 'color-group' &&
        n.targetColor?.toUpperCase() === targetColor.toUpperCase()
    );

    const activeNote = singleNoteOnCell || groupNoteOnColor || null;

    const menuW = 300;
    const menuH = 290;
    const safeX = Math.max(16, Math.min(window.innerWidth - menuW - 16, e.clientX));
    const safeY = Math.max(16, Math.min(window.innerHeight - menuH - 16, e.clientY));

    setContextMenu({
      clientX: safeX,
      clientY: safeY,
      cellKey: cell.key,
      displayId: cell.displayId,
      effectiveColor: targetColor,
      existingNoteId: activeNote?.id || null,
      draftText: activeNote?.text || '',
      scope: activeNote?.scope || 'color-group',
      errorMsg: null,
    });
  };

  const handleContextMenuColorChange = (newHex: string) => {
    if (!contextMenu) return;
    const upper = newHex.toUpperCase();
    applySelectionToCell(contextMenu.cellKey, 'select', upper);
    setProject((prev) => ({ ...prev, selectionColor: upper }));

    const existingOnNewColor = colorToNoteMap.get(upper);
    setContextMenu((prev) =>
      prev
        ? {
            ...prev,
            effectiveColor: upper,
            existingNoteId: existingOnNewColor?.id || null,
            draftText: existingOnNewColor?.text || prev.draftText,
            errorMsg: null,
          }
        : null
    );
  };

  const handleSaveContextMenuNote = (customText?: string) => {
    if (!contextMenu) return;
    const textToSave = (customText ?? contextMenu.draftText).trim();
    if (!textToSave) return;

    const colorUpper = contextMenu.effectiveColor.toUpperCase();
    const ownerNote = colorToNoteMap.get(colorUpper);

    if (ownerNote && ownerNote.id !== contextMenu.existingNoteId) {
      setContextMenu((prev) =>
        prev
          ? {
              ...prev,
              errorMsg: t(
                `هذا اللون مستخدم بالفعل للملاحظة "${ownerNote.text}". اختر لوناً آخر أدناه.`,
                `This color is already used by note "${ownerNote.text}". Pick another color below.`
              ),
            }
          : null
      );
      return;
    }

    if (contextMenu.scope === 'single') {
      const otherCellsWithSameColor = computed.cells.filter(
        (c) =>
          c.key !== contextMenu.cellKey &&
          c.hasCustomColor &&
          c.effectiveColor.toUpperCase() === colorUpper
      );
      if (otherCellsWithSameColor.length > 0) {
        setContextMenu((prev) =>
          prev
            ? {
                ...prev,
                errorMsg: t(
                  'هذا اللون محدد في صناديق أخرى أيضاً — اختر "لكل الصناديق بنفس اللون" أو اختر لوناً جديداً لهذا الصندوق.',
                  'This color is also used on other squares. Choose "All Same-Color Squares" or pick a unique color below.'
                ),
              }
            : null
        );
        return;
      }
    }

    const nextUnusedColor = getNextUnusedSelectionColor(colorUpper);

    setProject((prev) => {
      const existingNotes = prev.notes || [];
      const filtered = existingNotes.filter((n) => {
        if (contextMenu.existingNoteId && n.id === contextMenu.existingNoteId) return false;
        if (n.targetColor?.toUpperCase() === colorUpper) return false;
        if (contextMenu.scope === 'single' && n.targetCellKey === contextMenu.cellKey) return false;
        return true;
      });

      const newNote: StudioNoteItem = {
        id: contextMenu.existingNoteId || `note-${Date.now()}`,
        text: textToSave,
        scope: contextMenu.scope,
        targetCellKey: contextMenu.scope === 'single' ? contextMenu.cellKey : undefined,
        targetColor: colorUpper,
        createdAt: new Date().toISOString(),
      };

      return {
        ...prev,
        selectionColor: nextUnusedColor,
        notes: [...filtered, newNote],
        updatedAt: new Date().toISOString(),
      };
    });

    setContextMenu(null);
  };

  const handleDeleteNoteById = (noteId: string) => {
    setProject((prev) => ({
      ...prev,
      notes: (prev.notes || []).filter((n) => n.id !== noteId),
      focusedNoteId: prev.focusedNoteId === noteId ? null : prev.focusedNoteId,
      updatedAt: new Date().toISOString(),
    }));
    setContextMenu(null);
  };

  return {
    isSpacePressed,
    contextMenu,
    setContextMenu,
    isContextColorPickerOpen,
    setIsContextColorPickerOpen,
    contextInputRef,
    marqueeRect,
    draggingRulerId,
    snapRulersEnabled,
    setSnapRulersEnabled,
    zoom,
    setZoom,
    autoFit,
    setAutoFit,
    pan,
    setPan,
    isPanning,
    isMinimapOpen,
    setIsMinimapOpen,
    setIsDraggingMinimap,
    minimapRef,
    minimapCanvasRef,
    colorToNoteMap,
    recalculateFitZoom,
    handleJumpToCornerOrCenter,
    handleQuickJumpToSquare,
    panFromMinimapClientCoords,
    handleMinimapWheel,
    handleViewportWheel,
    handleAddRuler,
    handleSpawnRulerFromEdge,
    handleUpdateRuler,
    handleDeleteRuler,
    handleToggleLockAllRulers,
    handleAddRulersAroundSelection,
    handleInvertSelection,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasMouseLeave,
    handleCanvasContextMenu,
    handleContextMenuColorChange,
    handleSaveContextMenuNote,
    handleDeleteNoteById,
  };
}
