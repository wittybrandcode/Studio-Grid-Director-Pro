import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowSquareOut,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowsOutSimple,
  BoundingBox,
  Broadcast,
  Camera,
  CaretDoubleDown,
  CaretDoubleUp,
  ChartBar,
  Check,
  Circle,
  ClipboardText,
  Clock,
  Compass,
  CornersOut,
  Cpu,
  Crosshair,
  Cube,
  Cursor,
  DotsSixVertical,
  Eye,
  EyeSlash,
  FileArrowDown,
  FileArrowUp,
  FloppyDisk,
  Folders,
  FrameCorners,
  HandGrabbing,
  IdentificationBadge,
  Lightning,
  LockKey,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Monitor,
  NotePencil,
  Palette,
  PenNib,
  Plus,
  Polygon,
  PushPin,
  Question,
  Ruler,
  SelectionPlus,
  SquaresFour,
  Tag,
  Target,
  Translate,
  Trash,
  Wall,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import {
  DEFAULT_CABINET_CONFIG,
  DEFAULT_CENTER_CONFIG,
  DEFAULT_NDI_CONFIG,
  DEFAULT_STUDIO_PROJECT,
  FreehandDrawMode,
  LaserModeType,
  PROCESSOR_ZONE_COLORS,
  RESOLUTION_PRESETS,
  RULER_COLOR_PALETTE,
  SELECTION_COLOR_SWATCHES,
  StudioProject,
  StudioRuler,
  TestPatternType,
  UILanguage,
} from './types/studio';
import {
  analyzeCanvasColorMetrics,
  CanvasColorAnalysisResult,
  computeGrid,
  computeQuickFlashYellowIntensity,
  exportScreenNativePixelMapPng,
  renderStudioCanvas,
} from './utils/gridEngine';
import {
  disposeTauriNdiScratchCanvas,
  isTauriRuntime,
  openTauriLiveOutputWindow,
  pushTauriNdiCanvasFrame,
} from './utils/tauriBridge';
import {
  SavedProjectsModal,
  SgdImportDecisionModal,
} from './components/StudioModals';
import { ColorReportModal } from './components/ColorReportModal';
import { ColorPickerModal } from './components/ColorPickerModal';
import {
  TechnicalPatchSheetModal,
  ShortcutsHudModal,
  HelpAndAboutModal,
} from './components/EngineeringModals';
import { ResolumeArenaModal } from './components/ResolumeArenaModal';
import { LiveOutputView } from './components/LiveOutputView';
import { MultiScreenWallStage } from './components/MultiScreenWallStage';
import { ScreensManagerSection } from './components/sidebar/ScreensManagerSection';
import { GridAndNotesSection } from './components/sidebar/GridAndNotesSection';
import { CenterConfigSection } from './components/sidebar/CenterConfigSection';
import { RulersManagerSection } from './components/sidebar/RulersManagerSection';
import { ColorCalibrationSection } from './components/sidebar/ColorCalibrationSection';
import { getStoredLang, useWorkspaceStorage } from './hooks/useWorkspaceStorage';
import { useWorkspaceSync } from './hooks/useWorkspaceSync';
import { CanvasInteractionMode, useLaserAndDrawing } from './hooks/useLaserAndDrawing';
import {
  SampledHoveredPixel,
  useCanvasInteraction,
  ZOOM_MAX,
  ZOOM_MIN,
} from './hooks/useCanvasInteraction';

const SIDEBAR_WIDTH_STORAGE_KEY = 'studio_grid_director_sidebar_width_v1';
const SIDEBAR_TAB_STORAGE_KEY = 'studio_grid_director_sidebar_tab_v1';

type SidebarTabId = 'screens' | 'notes' | 'guides' | 'colors' | 'all';

const SIDEBAR_MIN_WIDTH = 290;
const SIDEBAR_MAX_WIDTH = 680;
const SIDEBAR_DEFAULT_WIDTH = 360;

function parseLiveOutputRoute(hash: string): {
  isLiveOutput: boolean;
  screenId: string | null;
} {
  if (!hash.startsWith('#live-output')) {
    return { isLiveOutput: false, screenId: null };
  }
  const qIndex = hash.indexOf('?');
  if (qIndex !== -1) {
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    return {
      isLiveOutput: true,
      screenId: params.get('screen'),
    };
  }
  const parts = hash.split('/');
  if (parts.length > 1 && parts[1]) {
    return { isLiveOutput: true, screenId: decodeURIComponent(parts[1]) };
  }
  return { isLiveOutput: true, screenId: null };
}

export function App() {
  const [liveRoute, setLiveRoute] = useState<{
    isLiveOutput: boolean;
    screenId: string | null;
  }>(() => parseLiveOutputRoute(window.location.hash));

  const [isInAppLiveOutput, setIsInAppLiveOutput] = useState<boolean>(false);

  useEffect(() => {
    const onHashChange = () => {
      setLiveRoute(parseLiveOutputRoute(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const [lang, setLang] = useState<UILanguage>(getStoredLang);

  useEffect(() => {
    try {
      localStorage.setItem('studio_grid_lang', lang);
    } catch {
      // ignore storage failure
    }
  }, [lang]);

  const t = useCallback((ar: string, en: string) => (lang === 'en' ? en : ar), [lang]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Freeze Live Output state (allows director to make local changes before pushing to live screens)
  const [isLiveFrozen, setIsLiveFrozen] = useState<boolean>(false);

  // Shared UI & Modal states
  const [toolMode, setToolMode] = useState<CanvasInteractionMode>('select');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const [expandSignal, setExpandSignal] = useState<{ open: boolean; seq: number }>({
    open: true,
    seq: 0,
  });

  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTabId>(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_TAB_STORAGE_KEY) as SidebarTabId | null;
      if (saved && ['screens', 'notes', 'guides', 'colors', 'all'].includes(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'screens';
  });

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
      if (!Number.isNaN(raw) && raw >= SIDEBAR_MIN_WIDTH && raw <= SIDEBAR_MAX_WIDTH) {
        return Math.round(raw);
      }
    } catch {
      // ignore
    }
    return SIDEBAR_DEFAULT_WIDTH;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState<boolean>(false);
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_TAB_STORAGE_KEY, activeSidebarTab);
    } catch {
      // ignore
    }
  }, [activeSidebarTab]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
    } catch {
      // ignore
    }
  }, [sidebarWidth]);

  // Handle Grabbable Vertical Splitter Dragging to Resize Sidebar
  useEffect(() => {
    if (!isResizingSidebar) return undefined;

    const handleMouseMove = (e: MouseEvent) => {
      const asideEl = sidebarRef.current;
      if (!asideEl) return;
      const rect = asideEl.getBoundingClientRect();
      const rawWidth = lang === 'en' ? e.clientX - rect.left : rect.right - e.clientX;
      const clamped = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, Math.round(rawWidth))
      );
      setSidebarWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, lang]);

  // Live Studio Clock 1-second tick for editor preview & custom image load trigger
  const [clockTick, setClockTick] = useState<number>(0);
  const [customImageLoadedSeq, setCustomImageLoadedSeq] = useState<number>(0);

  // Large-Screen Navigation, Multi-Screen Wall Stage & Pure Distraction-Free Mode State
  const [isPanoramicWallView, setIsPanoramicWallView] = useState<boolean>(false);
  const [isPureWallMode, setIsPureWallMode] = useState<boolean>(false);
  const [isSearchPopoverOpen, setIsSearchPopoverOpen] = useState<boolean>(false);
  const [squareSearchQuery, setSquareSearchQuery] = useState<string>('');

  // Modals & Picture-in-Picture Live Broadcast Stream
  const [isColorReportModalOpen, setIsColorReportModalOpen] = useState<boolean>(false);
  const [isPatchSheetModalOpen, setIsPatchSheetModalOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);
  const [isArenaModalOpen, setIsArenaModalOpen] = useState<boolean>(false);
  const [isPipActive, setIsPipActive] = useState<boolean>(false);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipStreamRef = useRef<MediaStream | null>(null);

  // Live Color Telemetry & Hovered Pixel Sample
  const [colorMetrics, setColorMetrics] = useState<CanvasColorAnalysisResult>(() =>
    analyzeCanvasColorMetrics(null)
  );
  const [hoveredPixel, setHoveredPixel] = useState<SampledHoveredPixel | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const paintRafRef = useRef<number | null>(null);

  // Late-bound callback bridges to avoid circular hook initialization order
  const pushSyncRef = useRef<
    (
      nextScreens: StudioProject[],
      nextActiveId: string,
      changedScreen?: StudioProject,
      immediate?: boolean
    ) => void
  >(() => {});
  const resetTransientUiRef = useRef<(options?: { resetAutoFit?: boolean }) => void>(() => {});
  const paintCanvasRef = useRef<() => void>(() => {});
  const scheduleCanvasPaintRef = useRef<() => void>(() => {});

  const stablePushSyncToServer = useCallback(
    (
      nextScreens: StudioProject[],
      nextActiveId: string,
      changedScreen?: StudioProject,
      immediate?: boolean
    ) => {
      pushSyncRef.current(nextScreens, nextActiveId, changedScreen, immediate);
    },
    []
  );

  const stableResetTransientUi = useCallback((options?: { resetAutoFit?: boolean }) => {
    resetTransientUiRef.current(options);
  }, []);

  // 1. Workspace Storage, Multi-Screen CRUD, Per-Screen Undo/Redo & Import/Export
  const storage = useWorkspaceStorage({
    isLiveOutput: liveRoute.isLiveOutput,
    t,
    showToast,
    canvasRef,
    pushSyncToServer: stablePushSyncToServer,
    onResetTransientUi: stableResetTransientUi,
  });

  const {
    screens,
    setScreens,
    screensRef,
    activeScreenId,
    setActiveScreenId,
    project,
    centerConfig,
    colorConfig,
    rulers,
    activePhysicalMetrics,
    isContinuousGestureRef,
    canUndo,
    canRedo,
    recordUndoSnapshot,
    setProject,
    handleUpdateProject,
    handleUndo,
    handleRedo,
    handleUpdateCenterConfig,
    handleUpdateColorConfig,
    handleUpdateScreensPositions,
    isNewScreenModalOpen,
    setIsNewScreenModalOpen,
    newScreenName,
    setNewScreenName,
    newScreenPresetId,
    setNewScreenPresetId,
    handleCreateScreen,
    handleDuplicateScreen,
    handleDeleteScreen,
    handleMoveScreen,
    workspaceName,
    setWorkspaceName,
    savedWorkspaces,
    isLibraryModalOpen,
    setIsLibraryModalOpen,
    pendingImport,
    setPendingImport,
    fileInputRef,
    handleSaveWorkspace,
    handleOverwriteWorkspace,
    handleLoadWorkspace,
    handleDeleteWorkspace,
    handleExportWorkspaceJson,
    handleExportCurrentScreenJson,
    handleExecuteImportDecision,
    handleImportJsonText,
    handleImportArenaScreens,
    handleImportJSONFile,
    handleTriggerImportDialog,
    handleWorkspaceDropFile,
  } = storage;

  // Fine-grained memoization for computeGrid
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

  // Tick every 1 second when Live Studio Clock is enabled
  useEffect(() => {
    if (!project.overlays?.showClock) return undefined;
    const timer = window.setInterval(() => {
      setClockTick((tick) => tick + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [project.overlays?.showClock]);

  // 2. Real-time Workspace Sync (SSE, BroadcastChannel, Tauri Events, Flash/Blink)
  const sync = useWorkspaceSync({
    screens,
    screensRef,
    activeScreenId,
    project,
    setScreens,
    isLiveOutput: liveRoute.isLiveOutput,
    isLiveFrozen,
    t,
    showToast,
  });

  const {
    broadcastChannelRef,
    editorBlinkingKeys,
    clearEditorBlinkingKeys,
    editorBlinkPhaseOn,
    editorIdentifyFlash,
    flashingScreenId,
    editorIdentifyFlashIntensityRef,
    identifyFlashStartRef,
    pushSyncToServer,
    sendImmediateProjectUpdate,
    handleIdentifyScreen,
    handleTogglePinIdentifyScreen,
    handleBlinkCellsOnLiveScreen,
    isScreenLiveOpen,
  } = sync;

  pushSyncRef.current = pushSyncToServer;

  // 3. Live Laser Pointer & Freehand Vector Drawing Layer
  const laserAndDrawing = useLaserAndDrawing({
    projectId: project.id,
    compWidth: project.compWidth,
    compHeight: project.compHeight,
    showDrawingsOverlay: project.overlays?.showDrawings,
    computed,
    broadcastChannelRef,
    toolMode,
    setToolMode,
    hoveredKey,
    setHoveredKey,
    handleUpdateProject,
    t,
    showToast,
  });

  const {
    laser,
    setLaser,
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
  } = laserAndDrawing;

  // 4. Canvas Interaction (Coordinates, Marquee, Paint, Zoom/Pan, Minimap, Rulers, Context Menu, Shortcuts)
  const interaction = useCanvasInteraction({
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
    hasPendingImport: Boolean(pendingImport),
    onClearPendingImport: useCallback(() => setPendingImport(null), [setPendingImport]),
    isArenaModalOpen,
    onCloseArenaModal: useCallback(() => setIsArenaModalOpen(false), []),
    isHelpModalOpen,
    onCloseHelpModal: useCallback(() => setIsHelpModalOpen(false), []),
    isShortcutsModalOpen,
    setIsShortcutsModalOpen,
    isPatchSheetModalOpen,
    onClosePatchSheetModal: useCallback(() => setIsPatchSheetModalOpen(false), []),
    isColorReportModalOpen,
    onCloseColorReportModal: useCallback(() => setIsColorReportModalOpen(false), []),
    isLibraryModalOpen,
    onCloseLibraryModal: useCallback(() => setIsLibraryModalOpen(false), [setIsLibraryModalOpen]),
    isNewScreenModalOpen,
    onCloseNewScreenModal: useCallback(
      () => setIsNewScreenModalOpen(false),
      [setIsNewScreenModalOpen]
    ),
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
    onPaintCanvas: useCallback(() => paintCanvasRef.current(), []),
    onScheduleCanvasPaint: useCallback(() => scheduleCanvasPaintRef.current(), []),
    onSampledPixel: setHoveredPixel,
    t,
    showToast,
  });

  const {
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
  } = interaction;

  resetTransientUiRef.current = (options?: { resetAutoFit?: boolean }) => {
    setContextMenu(null);
    clearEditorBlinkingKeys();
    if (options?.resetAutoFit) {
      setAutoFit(true);
    }
  };

  // Stop active Picture-in-Picture MediaStream tracks and release dedicated offscreen canvas memory
  const stopPipBroadcast = useCallback(async (exitPiP = false) => {
    if (pipStreamRef.current) {
      pipStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop failures on already-ended streams
        }
      });
      pipStreamRef.current = null;
    }

    const video = pipVideoRef.current;
    if (video) {
      video.onleavepictureinpicture = null;
      try {
        video.pause();
      } catch {
        // Ignore pause errors
      }
      video.srcObject = null;
    }

    const pipCanvas = pipCanvasRef.current;
    if (pipCanvas) {
      pipCanvas.width = 0;
      pipCanvas.height = 0;
    }

    if (exitPiP && document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
      } catch {
        // Ignore exitPictureInPicture errors if already closed
      }
    }

    setIsPipActive(false);
  }, []);

  // Ensure PiP stream and tracks are released on component unmount or when entering full-window live output
  useEffect(() => {
    return () => {
      void stopPipBroadcast(true);
    };
  }, [stopPipBroadcast]);

  useEffect(() => {
    if ((liveRoute.isLiveOutput || isInAppLiveOutput) && isPipActive) {
      void stopPipBroadcast(true);
    }
  }, [liveRoute.isLiveOutput, isInAppLiveOutput, isPipActive, stopPipBroadcast]);

  // Paint dedicated hidden clean broadcast canvas for PiP (without editor hover, marquee, or lock badges)
  const paintPipCanvas = useCallback(
    (flashIntensityOverride?: number, forceRender = false) => {
      if (!forceRender && (!isPipActive || isLiveFrozen)) return;
      const pipCanvas = pipCanvasRef.current;
      if (!pipCanvas) return;

      if (pipCanvas.width !== project.compWidth) {
        pipCanvas.width = project.compWidth;
      }
      if (pipCanvas.height !== project.compHeight) {
        pipCanvas.height = project.compHeight;
      }

      const pCtx = pipCanvas.getContext('2d');
      if (!pCtx) return;

      const screenOrderIndex = Math.max(
        0,
        screens.findIndex((s) => s.id === project.id)
      );
      const effectiveFlashIntensity =
        typeof flashIntensityOverride === 'number'
          ? flashIntensityOverride
          : editorIdentifyFlashIntensityRef.current;

      renderStudioCanvas(pCtx, project, computed, {
        hoveredCellKey: null,
        blinkingCellKeys: editorBlinkingKeys,
        blinkPhaseOn: editorBlinkPhaseOn,
        identifyFlashActive:
          editorIdentifyFlash && (!flashingScreenId || flashingScreenId === project.id),
        identifyFlashIntensity: effectiveFlashIntensity,
        laser,
        isLiveOutput: true,
        marqueeRect: null,
        activeDraftDrawing: null,
        screenOrderIndex,
        lang,
        onAsyncImageLoad: () => setCustomImageLoadedSeq((s) => s + 1),
      });
    },
    [
      isPipActive,
      isLiveFrozen,
      project,
      computed,
      screens,
      editorBlinkingKeys,
      editorBlinkPhaseOn,
      editorIdentifyFlash,
      flashingScreenId,
      laser,
      lang,
    ]
  );

  // Draw main editor canvas + minimap radar canvas + isolated PiP stream canvas directly
  const paintEditorAndMinimapCanvases = useCallback(
    (flashIntensityOverride?: number) => {
      paintPipCanvas(flashIntensityOverride);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const screenOrderIndex = Math.max(
            0,
            screens.findIndex((s) => s.id === project.id)
          );
          const effectiveFlashIntensity =
            typeof flashIntensityOverride === 'number'
              ? flashIntensityOverride
              : editorIdentifyFlashIntensityRef.current;

          renderStudioCanvas(ctx, project, computed, {
            hoveredCellKey: toolMode === 'draw' ? null : hoveredKey,
            blinkingCellKeys: editorBlinkingKeys,
            blinkPhaseOn: editorBlinkPhaseOn,
            identifyFlashActive:
              editorIdentifyFlash && (!flashingScreenId || flashingScreenId === project.id),
            identifyFlashIntensity: effectiveFlashIntensity,
            laser,
            isLiveOutput: false,
            marqueeRect,
            activeDraftDrawing: draftDrawingRef.current,
            screenOrderIndex,
            lang,
            onAsyncImageLoad: () => setCustomImageLoadedSeq((s) => s + 1),
          });
        }
      }

      if (!isMinimapOpen || isPanoramicWallView) return;
      const mainCanvas = canvasRef.current;
      const miniCanvas = minimapCanvasRef.current;
      if (!mainCanvas || !miniCanvas) return;
      const mCtx = miniCanvas.getContext('2d');
      if (!mCtx) return;

      const mW = miniCanvas.width;
      const mH = miniCanvas.height;
      mCtx.clearRect(0, 0, mW, mH);

      // 1. Draw exact live miniature mirror of the studio screen canvas
      mCtx.drawImage(mainCanvas, 0, 0, mW, mH);

      // 2. Compute exact stage viewport frustum in normalized [0..1] canvas coordinates
      const stageEl = viewportContainerRef.current;
      const stageW = stageEl ? Math.max(200, stageEl.clientWidth - 48) : 960;
      const stageH = stageEl ? Math.max(180, stageEl.clientHeight - 48) : 640;
      const scaledW = Math.max(1, project.compWidth * zoom);
      const scaledH = Math.max(1, project.compHeight * zoom);

      const viewWFrac = stageW / scaledW;
      const viewHFrac = stageH / scaledH;
      const centerFracX = 0.5 - pan.x / scaledW;
      const centerFracY = 0.5 - pan.y / scaledH;

      const rawLeft = centerFracX - viewWFrac / 2;
      const rawTop = centerFracY - viewHFrac / 2;
      const rawRight = rawLeft + viewWFrac;
      const rawBottom = rawTop + viewHFrac;

      const vx1 = Math.max(0, Math.min(mW, rawLeft * mW));
      const vy1 = Math.max(0, Math.min(mH, rawTop * mH));
      const vx2 = Math.max(0, Math.min(mW, rawRight * mW));
      const vy2 = Math.max(0, Math.min(mH, rawBottom * mH));
      const vw = Math.max(0, vx2 - vx1);
      const vh = Math.max(0, vy2 - vy1);

      // 3. Dim areas outside the current viewport frustum so visible region pops clearly
      mCtx.fillStyle = 'rgba(6, 9, 15, 0.62)';
      if (vy1 > 0) mCtx.fillRect(0, 0, mW, vy1);
      if (vy2 < mH) mCtx.fillRect(0, vy2, mW, mH - vy2);
      if (vx1 > 0 && vh > 0) mCtx.fillRect(0, vy1, vx1, vh);
      if (vx2 < mW && vh > 0) mCtx.fillRect(vx2, vy1, mW - vx2, vh);

      // 4. Draw live Laser Beam & Sight Lines on the Minimap Radar when active
      if (laser && laser.active) {
        const lx = (laser.x / project.compWidth) * mW;
        const ly = (laser.y / project.compHeight) * mH;
        const lCol = laser.color || '#FF2424';
        mCtx.save();
        mCtx.strokeStyle = lCol;
        mCtx.globalAlpha = 0.82;
        mCtx.lineWidth = 1.5;
        mCtx.beginPath();
        mCtx.moveTo(0, ly);
        mCtx.lineTo(mW, ly);
        mCtx.moveTo(lx, 0);
        mCtx.lineTo(lx, mH);
        mCtx.stroke();
        mCtx.globalAlpha = 1;

        mCtx.fillStyle = lCol;
        mCtx.beginPath();
        mCtx.arc(lx, ly, 4.5, 0, Math.PI * 2);
        mCtx.fill();
        mCtx.fillStyle = '#FFFFFF';
        mCtx.beginPath();
        mCtx.arc(lx, ly, 2, 0, Math.PI * 2);
        mCtx.fill();
        mCtx.restore();
      }

      // 5. Draw High-Contrast Camera Viewport Frame + Corner Brackets
      if (vw > 1 && vh > 1) {
        mCtx.save();
        mCtx.strokeStyle = 'rgba(9, 13, 22, 0.9)';
        mCtx.lineWidth = 4;
        mCtx.strokeRect(vx1 + 1, vy1 + 1, Math.max(2, vw - 2), Math.max(2, vh - 2));

        mCtx.strokeStyle = '#FEF08A';
        mCtx.lineWidth = 2;
        mCtx.strokeRect(vx1 + 1, vy1 + 1, Math.max(2, vw - 2), Math.max(2, vh - 2));

        const cLen = Math.min(10, Math.max(4, Math.min(vw, vh) * 0.25));
        mCtx.strokeStyle = '#38BDF8';
        mCtx.lineWidth = 3;
        mCtx.beginPath();
        mCtx.moveTo(vx1 + 1, vy1 + 1 + cLen);
        mCtx.lineTo(vx1 + 1, vy1 + 1);
        mCtx.lineTo(vx1 + 1 + cLen, vy1 + 1);
        mCtx.moveTo(vx2 - 1 - cLen, vy1 + 1);
        mCtx.lineTo(vx2 - 1, vy1 + 1);
        mCtx.lineTo(vx2 - 1, vy1 + 1 + cLen);
        mCtx.moveTo(vx1 + 1, vy2 - 1 - cLen);
        mCtx.lineTo(vx1 + 1, vy2 - 1);
        mCtx.lineTo(vx1 + 1 + cLen, vy2 - 1);
        mCtx.moveTo(vx2 - 1 - cLen, vy2 - 1);
        mCtx.lineTo(vx2 - 1, vy2 - 1);
        mCtx.lineTo(vx2 - 1, vy2 - 1 - cLen);
        mCtx.stroke();
        mCtx.restore();
      }

      // 6. Draw Camera Center Aim Reticle (+)
      const aimX = Math.max(4, Math.min(mW - 4, centerFracX * mW));
      const aimY = Math.max(4, Math.min(mH - 4, centerFracY * mH));
      mCtx.save();
      mCtx.strokeStyle = '#38BDF8';
      mCtx.lineWidth = 1.5;
      mCtx.beginPath();
      mCtx.moveTo(aimX - 6, aimY);
      mCtx.lineTo(aimX + 6, aimY);
      mCtx.moveTo(aimX, aimY - 6);
      mCtx.lineTo(aimX, aimY + 6);
      mCtx.stroke();
      mCtx.restore();
    },
    [
      paintPipCanvas,
      screens,
      project,
      computed,
      toolMode,
      hoveredKey,
      editorBlinkingKeys,
      editorBlinkPhaseOn,
      editorIdentifyFlash,
      flashingScreenId,
      laser,
      marqueeRect,
      isMinimapOpen,
      isPanoramicWallView,
      zoom,
      pan,
      lang,
    ]
  );

  // Coalesced requestAnimationFrame scheduler so rapid 240Hz mouse/state updates never paint more than once per display frame
  const scheduleCanvasPaint = useCallback(() => {
    if (paintRafRef.current !== null) return;
    paintRafRef.current = window.requestAnimationFrame(() => {
      paintRafRef.current = null;
      paintEditorAndMinimapCanvases();
    });
  }, [paintEditorAndMinimapCanvases]);

  // Paint editor & minimap canvases on state/clock changes (coalesced into next animation frame)
  useEffect(() => {
    scheduleCanvasPaint();
    return () => {
      if (paintRafRef.current !== null) {
        window.cancelAnimationFrame(paintRafRef.current);
        paintRafRef.current = null;
      }
    };
  }, [scheduleCanvasPaint, clockTick, customImageLoadedSeq]);

  // Zero-React-State 60fps canvas animation loop for Quick Flash yellow glow & Moving Sync Bar
  useEffect(() => {
    const needsRaf = Boolean(editorIdentifyFlash || project.overlays?.movingSyncBar);
    if (!needsRaf) {
      editorIdentifyFlashIntensityRef.current = 0;
      return undefined;
    }

    let rafId = 0;
    const step = () => {
      if (editorIdentifyFlash) {
        const elapsed = performance.now() - identifyFlashStartRef.current;
        editorIdentifyFlashIntensityRef.current = computeQuickFlashYellowIntensity(elapsed);
      } else {
        editorIdentifyFlashIntensityRef.current = 0;
      }
      paintEditorAndMinimapCanvases(editorIdentifyFlashIntensityRef.current);
      rafId = window.requestAnimationFrame(step);
    };
    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [editorIdentifyFlash, project.overlays?.movingSyncBar, paintEditorAndMinimapCanvases]);

  paintCanvasRef.current = paintEditorAndMinimapCanvases;
  scheduleCanvasPaintRef.current = scheduleCanvasPaint;

  // Native Tauri NDI Frame Streamer Loop (pushes RGBA8 frames from active screen canvas at configured FPS when NDI is enabled)
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

  // Compute Color Telemetry debounced when project or colorCalibration changes (only when Color tab or Report modal is open)
  useEffect(() => {
    if (activeSidebarTab !== 'colors' && activeSidebarTab !== 'all' && !isColorReportModalOpen) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setColorMetrics(analyzeCanvasColorMetrics(canvas, colorConfig));
    }, 90);
    return () => window.clearTimeout(timer);
  }, [
    project,
    computed,
    colorConfig,
    customImageLoadedSeq,
    activeSidebarTab,
    isColorReportModalOpen,
  ]);

  // (Extracted handlers live in useWorkspaceStorage, useWorkspaceSync, useLaserAndDrawing, useCanvasInteraction)

  // Dedicated Pure Live Output Window (bound to its specific screenId)
  if (liveRoute.isLiveOutput || isInAppLiveOutput) {
    const targetId = isInAppLiveOutput ? project.id : liveRoute.screenId;
    const initialForOutput =
      screens.find((s) => s.id === targetId) || project;
    return (
      <LiveOutputView
        screenId={targetId}
        initialProject={initialForOutput}
        onExitLiveOutput={
          isInAppLiveOutput
            ? () => setIsInAppLiveOutput(false)
            : () => {
                window.location.hash = '';
                setLiveRoute({ isLiveOutput: false, screenId: null });
              }
        }
      />
    );
  }

  const effectivePanMode = toolMode === 'pan' || isSpacePressed;
  const activePresetId =
    RESOLUTION_PRESETS.find(
      (p) => p.width === project.compWidth && p.height === project.compHeight
    )?.id || 'custom';

  const selectedCellsCount = computed.cells.filter((c) => c.hasCustomColor).length;

  const sameColorCount = contextMenu
    ? computed.cells.filter(
        (c) =>
          c.hasCustomColor &&
          c.effectiveColor.toUpperCase() === contextMenu.effectiveColor.toUpperCase()
      ).length
    : 0;

  const activeScreenIsLive = isScreenLiveOpen(project.id);

  // Keep PiP hidden broadcast canvas + video persistently mounted across Normal, Panoramic, and Pure Wall modes
  return (
    <>
      <video
        ref={pipVideoRef}
        muted
        playsInline
        aria-hidden="true"
        className="fixed -top-[9999px] -left-[9999px] w-1 h-1 opacity-0 pointer-events-none"
      />
      <canvas
        ref={pipCanvasRef}
        aria-hidden="true"
        className="fixed -top-[9999px] -left-[9999px] opacity-0 pointer-events-none"
      />
      {isPureWallMode ? (
        <div
          dir={lang === 'en' ? 'ltr' : 'rtl'}
          className="h-screen w-screen overflow-hidden bg-[#070A10] select-none"
        >
          <MultiScreenWallStage
            screens={screens}
            activeScreenId={project.id}
            isPureMode={true}
            lang={lang}
            activeLaser={laser}
            editorBlinkingKeys={editorBlinkingKeys}
            editorBlinkPhaseOn={editorBlinkPhaseOn}
            editorIdentifyFlash={editorIdentifyFlash}
            flashingScreenId={flashingScreenId}
            editorIdentifyFlashIntensity={editorIdentifyFlashIntensityRef.current}
            clockTick={clockTick}
            isScreenLiveOpen={isScreenLiveOpen}
            onSelectScreen={(scrId) => setActiveScreenId(scrId)}
            onFocusSingleScreen={(scrId) => {
              setActiveScreenId(scrId);
              setIsPureWallMode(false);
              setIsPanoramicWallView(false);
              setAutoFit(true);
            }}
            onFlashScreen={(scrId) => handleIdentifyScreen(scrId)}
            onUpdateScreensPositions={handleUpdateScreensPositions}
            onTogglePureMode={(nextPure) => setIsPureWallMode(Boolean(nextPure))}
            onExitWallView={() => {
              setIsPureWallMode(false);
              setIsPanoramicWallView(false);
            }}
          />
        </div>
      ) : (
    <div
      dir={lang === 'en' ? 'ltr' : 'rtl'}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
        }
      }}
      onDrop={handleWorkspaceDropFile}
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#22252A] text-[#DCE0E8] select-none"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".sgd,.json,.xml,application/json,application/xml,text/xml,application/octet-stream"
        onChange={handleImportJSONFile}
        className="hidden"
      />

      {/* Top Bar — Unified Single-Side Layout: Radiant Green SGD Badge + Smartly Grouped Task Icons */}
      <header className="h-11 shrink-0 flex items-center justify-start gap-1.5 px-3 bg-[#2A2E37] border-b border-[#434853] overflow-x-auto">
        {/* Brand Badge: SGD with Thick Radiant Green (#8CC63F) Letters & Click to Open Help/About Modal */}
        <button
          type="button"
          onClick={() => setIsHelpModalOpen(true)}
          title={t(
            'حول التطبيق ومعلومات التواصل مع المطور — Studio Grid Director Pro',
            'About & Developer Contact — Studio Grid Director Pro'
          )}
          className="group relative h-8 px-3 bg-[#181B20] hover:bg-[#222730] border border-[#8CC63F]/65 hover:border-[#8CC63F] rounded-none flex items-center justify-center cursor-pointer select-none shrink-0 transition-colors"
        >
          <span
            dir="ltr"
            style={{
              color: '#8CC63F',
              WebkitTextStroke: '0.45px #8CC63F',
              textShadow: '0 0 8px rgba(140, 198, 63, 0.38)',
            }}
            className="font-display text-[15px] font-black tracking-[0.14em] leading-none"
          >
            SGD
          </span>
          <div
            dir="ltr"
            className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute top-full mt-1.5 start-0 z-50 px-2.5 py-1 bg-[#14171C] border border-[#8CC63F] text-[11px] font-mono font-bold text-[#8CC63F] whitespace-nowrap shadow-xl rounded-none"
          >
            Studio Grid Director Pro — Help &amp; Info
          </div>
        </button>

        <div className="h-5 w-px bg-[#434853] mx-0.5 shrink-0" />

        {/* Group 1: Project & File Management (Cyan Theme — Library, Save, Export .sgd, Import .sgd) */}
        <div className="flex items-center gap-1 p-0.5 bg-[#14202B] border border-[#263E52] border-t-2 border-t-[#38BDF8] shrink-0">
          <button
            type="button"
            onClick={() => setIsLibraryModalOpen(true)}
            className="w-7 h-7 flex items-center justify-center rounded-none bg-[#1B2C3B] hover:bg-[#274056] border border-[#2C4C66] text-[#7DD3FC] hover:text-[#E0F2FE] shrink-0 cursor-pointer transition-colors"
            title={t(
              `[ملفات المشروع] مكتبة المشاريع وحزم (.sgd) — ${workspaceName} (${screens.length})`,
              `[Project Files] Projects & .sgd Bundle Library — ${workspaceName} (${screens.length})`
            )}
          >
            <Folders weight="bold" className="w-4 h-4 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => handleSaveWorkspace()}
            className="w-7 h-7 flex items-center justify-center rounded-none bg-[#1B2C3B] hover:bg-[#274056] border border-[#2C4C66] text-[#7DD3FC] hover:text-[#E0F2FE] shrink-0 cursor-pointer transition-colors"
            title={t('[ملفات المشروع] حفظ سريع للمشروع الحالي', '[Project Files] Quick save current project')}
          >
            <FloppyDisk weight="bold" className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleExportWorkspaceJson()}
            className="w-7 h-7 flex items-center justify-center rounded-none bg-[#1B2C3B] hover:bg-[#274056] border border-[#2C4C66] text-[#7DD3FC] hover:text-[#E0F2FE] shrink-0 cursor-pointer transition-colors"
            title={t(
              '[ملفات المشروع] تصدير المشروع كحزمة مضغوطة (.sgd) مع جميع الشاشات والصور المرفوعة',
              '[Project Files] Export compressed project bundle (.sgd) with all screens & images'
            )}
          >
            <FileArrowDown weight="bold" className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => void handleTriggerImportDialog()}
            className="w-7 h-7 flex items-center justify-center rounded-none bg-[#1B2C3B] hover:bg-[#274056] border border-[#2C4C66] text-[#7DD3FC] hover:text-[#E0F2FE] shrink-0 cursor-pointer transition-colors"
            title={t(
              '[ملفات المشروع] استيراد حزمة مشروع (.sgd أو .json) — يدعم السحب والإفلات المباشر',
              '[Project Files] Import project bundle (.sgd or .json) — supports Drag & Drop'
            )}
          >
            <FileArrowUp weight="bold" className="w-4 h-4" />
          </button>
        </div>

        {/* Group 2: Engineering Patch Sheet, Color Calibration Reports & 1:1 PNG Export (Amber Gold Theme) */}
        <div className="flex items-center gap-1 p-0.5 bg-[#241C11] border border-[#4D391D] border-t-2 border-t-[#F59E0B] shrink-0">
          <button
            type="button"
            onClick={() => {
              exportScreenNativePixelMapPng(project);
              showToast(
                t(
                  `تم تصدير خريطة الشاشة (${project.name}) بدقة 1:1 الحقيقية (${project.compWidth}×${project.compHeight})`,
                  `Exported 1:1 Native Pixel Map (${project.compWidth}×${project.compHeight})`
                )
              );
            }}
            className="w-7 h-7 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] hover:text-[#FEF3C7] shrink-0 cursor-pointer transition-colors"
            title={t(
              '[التصدير والتقارير] تصدير خريطة الشاشة PNG بدقة البكسل الحقيقية 1:1 لبرامج العرض (Resolume / Disguise / Novastar)',
              '[Export & Reports] Export 1:1 Native-Resolution PNG Pixel Map'
            )}
          >
            <Camera weight="bold" className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsPatchSheetModalOpen(true)}
            className="w-7 h-7 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] hover:text-[#FEF3C7] shrink-0 cursor-pointer transition-colors"
            title={t(
              '[التصدير والتقارير] بطاقة التسليم الهندسي للشاشات (الأمتار، الكهرباء kW/Amps، المنافذ، والطباعة)',
              '[Export & Reports] Open LED Engineering Patch & Spec Sheet (Meters, kW/Amps, Ports, Print)'
            )}
          >
            <ClipboardText weight="bold" className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsColorReportModalOpen(true)}
            className="w-7 h-7 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] hover:text-[#FEF3C7] shrink-0 cursor-pointer transition-colors"
            title={t('[التصدير والتقارير] فتح تقرير الألوان والمعايرة', '[Export & Reports] Open Color & Calibration Report')}
          >
            <ChartBar weight="bold" className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsArenaModalOpen(true)}
            className="h-7 px-2 flex items-center justify-center gap-1 rounded-none bg-[#0F2922] hover:bg-[#163D33] border border-[#10B981] text-[#34D399] hover:text-[#A7F3D0] shrink-0 cursor-pointer transition-colors"
            title={t(
              '[Resolume Arena] جسر التكامل مع Arena: تصدير واستيراد الشاشات (.XML) + خريطة الـ Composition + الربط الحي',
              '[Resolume Arena] Arena Bridge: Export/Import Advanced Output (.XML) + Composition Atlas + Live API'
            )}
          >
            <Broadcast weight="bold" className="w-3.5 h-3.5" />
            <span dir="ltr" className="text-[10px] font-mono font-bold tracking-wider">
              ARENA
            </span>
          </button>
        </div>

        {/* Group 3: Shortcuts HUD & UI Language (Slate Silver Theme) */}
        <div className="flex items-center gap-1 p-0.5 bg-[#1D2028] border border-[#3B4252] border-t-2 border-t-[#94A3B8] shrink-0">
          <button
            type="button"
            onClick={() => setIsShortcutsModalOpen(true)}
            className="w-7 h-7 flex items-center justify-center rounded-none bg-[#282D38] hover:bg-[#373E4D] border border-[#475061] text-[#CBD5E1] hover:text-[#FFFFFF] shrink-0 cursor-pointer transition-colors"
            title={t('[النظام والمساعدة] لوحة اختصارات المخرج السريعة (?)', '[System & Help] Live Director Shortcuts HUD (?)')}
          >
            <Question weight="bold" className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setLang((l) => (l === 'en' ? 'ar' : 'en'))}
            className="w-7 h-7 flex items-center justify-center rounded-none bg-[#282D38] hover:bg-[#373E4D] border border-[#475061] text-[#CBD5E1] hover:text-[#FFFFFF] shrink-0 cursor-pointer transition-colors"
            title={t('[النظام والمساعدة] تغيير لغة الواجهة (عربي / EN)', '[System & Help] Switch UI Language (AR / EN)')}
          >
            <Translate weight="bold" className="w-4 h-4" />
          </button>
        </div>

        {/* Far-Left Header Telemetry Box: Active Screen Name, Resolution, Physical Meters, Cells & Live Status */}
        <div className="ms-auto h-8 flex items-center gap-2.5 px-3 rounded-none bg-[#1E2128] border border-[#434853] text-xs whitespace-nowrap shrink-0">
          <span
            className={`w-2 h-2 rounded-none shrink-0 ${
              activeScreenIsLive ? 'bg-[#8CC63F]' : 'bg-[#8E95A2]'
            }`}
          />
          <span className="font-bold text-[#DCE0E8] truncate max-w-[160px]">{project.name}</span>
          <span dir="ltr" className="font-mono text-[11px] text-[#B8BEC9]">
            {project.compWidth}×{project.compHeight}px
          </span>
          <span dir="ltr" className="font-mono text-[11px] text-[#FEF08A] font-bold">
            ({activePhysicalMetrics.widthMeters}m × {activePhysicalMetrics.heightMeters}m · P
            {activePhysicalMetrics.pixelPitchMm})
          </span>
          <span dir="ltr" className="font-mono text-[10px] text-[#38BDF8]">
            {computed.cells.length} {t('مربع', 'cells')}
          </span>
          <span className="text-[11px] text-[#9FA6B3]">
            {activeScreenIsLive
              ? t('• متصل بالعرض المباشر', '• Live Synced')
              : t('• جاهز للعرض', '• Ready')}
          </span>
        </div>
      </header>

      {/* Main Content: Tabbed & Resizable Sidebar + Vertical Splitter + Large Canvas */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Tabbed & Resizable Sidebar */}
        <aside
          ref={sidebarRef}
          style={{ width: `${sidebarWidth}px` }}
          className="relative z-20 shrink-0 bg-[#242830] flex flex-col h-full overflow-hidden"
        >
          {/* Sticky Single-Row Icon-Only Functional Tabs + Expand/Collapse Bar */}
          <div className="shrink-0 bg-[#202328] border-b border-[#434853] flex items-center justify-between px-1.5 h-9 gap-1">
            {/* 5 Icon-Only Functional Tabs */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {(
                [
                  {
                    id: 'screens' as const,
                    label: t('الشاشات وتقسيم الشبكة (Screens & Grid)', 'Screens & Grid Setup'),
                    Icon: Monitor,
                    badge: screens.length,
                  },
                  {
                    id: 'notes' as const,
                    label: t('التحديد والملاحظات (Selection & Notes)', 'Selection & Studio Notes'),
                    Icon: NotePencil,
                    badge: (project.notes || []).length,
                  },
                  {
                    id: 'guides' as const,
                    label: t('المركز والمساطر (Guides & Rulers)', 'Center Crosshair & Rulers'),
                    Icon: Ruler,
                    badge: rulers.length,
                  },
                  {
                    id: 'colors' as const,
                    label: t('مختبر الألوان والتقارير (Color Lab)', 'Color Lab & Calibration'),
                    Icon: Palette,
                    badge: null,
                  },
                  {
                    id: 'all' as const,
                    label: t('عرض جميع الأدوات (All Panels)', 'All Control Panels'),
                    Icon: SquaresFour,
                    badge: null,
                  },
                ] as const
              ).map(({ id, label, Icon, badge }) => {
                const isActive = activeSidebarTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSidebarTab(id)}
                    title={label}
                    className={`relative flex-1 h-7 flex items-center justify-center gap-1 rounded-none border cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-[#1B2C3B] text-[#38BDF8] border-[#38BDF8]'
                        : 'bg-[#262A32] hover:bg-[#303540] text-[#AEB5C2] hover:text-[#FFFFFF] border-[#3A3E47]'
                    }`}
                  >
                    <Icon weight={isActive ? 'fill' : 'bold'} className="w-4 h-4 shrink-0" />
                    {badge !== null && badge > 0 && (
                      <span
                        dir="ltr"
                        className={`px-1 text-[9px] font-mono font-bold leading-tight rounded-none ${
                          isActive
                            ? 'bg-[#38BDF8] text-[#09131C]'
                            : 'bg-[#181A20] text-[#DCE0E8]'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#38BDF8]" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="h-4 w-px bg-[#3A3E47] shrink-0" />

            {/* Compact Icon-Only Expand/Collapse All + Width Reset */}
            <div className="flex items-center gap-1 shrink-0">
              {sidebarWidth !== SIDEBAR_DEFAULT_WIDTH && (
                <button
                  type="button"
                  onClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
                  title={t(
                    `إعادة عرض القائمة للحجم القياسي (${sidebarWidth}px → 360px)`,
                    `Reset sidebar width (${sidebarWidth}px → 360px)`
                  )}
                  className="h-7 px-1.5 rounded-none bg-[#282C35] hover:bg-[#3E4452] border border-[#3A3E47] text-[9px] font-mono font-bold text-[#38BDF8] cursor-pointer transition-colors"
                >
                  ↺
                </button>
              )}
              <button
                type="button"
                onClick={() => setExpandSignal({ open: true, seq: Date.now() })}
                className="w-7 h-7 rounded-none bg-[#282C35] hover:bg-[#3E4452] border border-[#3A3E47] text-[#AEB5C2] hover:text-[#FFFFFF] flex items-center justify-center cursor-pointer transition-colors"
                title={t('فتح جميع الصناديق (Expand All)', 'Expand all panels')}
              >
                <CaretDoubleDown weight="bold" className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setExpandSignal({ open: false, seq: Date.now() })}
                className="w-7 h-7 rounded-none bg-[#282C35] hover:bg-[#3E4452] border border-[#3A3E47] text-[#AEB5C2] hover:text-[#FFFFFF] flex items-center justify-center cursor-pointer transition-colors"
                title={t('طي جميع الصناديق (Collapse All)', 'Collapse all panels')}
              >
                <CaretDoubleUp weight="bold" className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Scrollable Tab Content Area */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
            {/* TAB 1 (or ALL): Screens Manager */}
            {(activeSidebarTab === 'screens' || activeSidebarTab === 'all') && (
              <ScreensManagerSection
                screens={screens}
                activeProject={project}
                lang={lang}
                expandSignal={expandSignal}
                isPanoramicWallView={isPanoramicWallView}
                onTogglePanoramicWallView={() => setIsPanoramicWallView((v) => !v)}
                onEnterPureWallMode={() => {
                  setIsPanoramicWallView(true);
                  setIsPureWallMode(true);
                }}
                isLiveFrozen={isLiveFrozen}
                onToggleLiveFrozen={() => {
                  const next = !isLiveFrozen;
                  setIsLiveFrozen(next);
                  if (!next) {
                    sendImmediateProjectUpdate();
                    showToast(
                      t(
                        'تم استئناف البث وإرسال التعديلات للشاشة الحية',
                        'Resumed Live Sync & pushed updates'
                      )
                    );
                  } else {
                    showToast(
                      t(
                        'تم تجميد شاشة العرض المباشر مؤقتاً للتعديل المحلي',
                        'Live Output frozen temporarily for local editing'
                      )
                    );
                  }
                }}
                isNewScreenModalOpen={isNewScreenModalOpen}
                setIsNewScreenModalOpen={setIsNewScreenModalOpen}
                newScreenName={newScreenName}
                setNewScreenName={setNewScreenName}
                newScreenPresetId={newScreenPresetId}
                setNewScreenPresetId={setNewScreenPresetId}
                onSelectScreen={(scrId) => {
                  setActiveScreenId(scrId);
                  setContextMenu(null);
                  setAutoFit(true);
                }}
                onCreateScreen={handleCreateScreen}
                onDuplicateScreen={handleDuplicateScreen}
                onDeleteScreen={handleDeleteScreen}
                onMoveScreen={handleMoveScreen}
                onRenameActiveScreen={(newName) =>
                  handleUpdateProject((prev) => ({
                    ...prev,
                    name: newName,
                  }))
                }
                onToggleScreenSlate={() =>
                  handleUpdateProject((prev) => ({
                    ...prev,
                    overlays: {
                      ...prev.overlays,
                      showScreenSlate: !prev.overlays?.showScreenSlate,
                    },
                  }))
                }
                onToggleClock={() =>
                  handleUpdateProject((prev) => ({
                    ...prev,
                    overlays: {
                      ...prev.overlays,
                      showClock: !prev.overlays?.showClock,
                    },
                  }))
                }
                onToggleSafeMargins={() =>
                  handleUpdateProject((prev) => ({
                    ...prev,
                    overlays: {
                      ...prev.overlays,
                      safeMargins: !prev.overlays?.safeMargins,
                    },
                  }))
                }
                onSetTestPattern={(pattern: TestPatternType) =>
                  handleUpdateProject((prev) => ({
                    ...prev,
                    overlays: {
                      ...prev.overlays,
                      testPattern: pattern,
                    },
                  }))
                }
                onUpdateOverlays={(patch) =>
                  handleUpdateProject((prev) => ({
                    ...prev,
                    overlays: {
                      ...prev.overlays,
                      ...patch,
                    },
                  }))
                }
                onUpdateNdiConfig={(patch) =>
                  handleUpdateProject((prev) => ({
                    ...prev,
                    ndiConfig: {
                      ...DEFAULT_NDI_CONFIG,
                      ...(prev.ndiConfig || {}),
                      ...patch,
                    },
                  }))
                }
                onIdentifyScreen={handleIdentifyScreen}
                onTogglePinIdentifyScreen={handleTogglePinIdentifyScreen}
                onSyncBeforeOpenOutput={(scr) => {
                  pushSyncToServer(screens, activeScreenId, scr, true);
                }}
                isScreenLiveOpen={isScreenLiveOpen}
              />
            )}

            {/* TAB 1, TAB 2, or ALL: Grid Dimensions & Selection/Notes */}
            {(activeSidebarTab === 'screens' ||
              activeSidebarTab === 'notes' ||
              activeSidebarTab === 'all') && (
              <GridAndNotesSection
                project={project}
                computed={computed}
                lang={lang}
                expandSignal={expandSignal}
                activePresetId={activePresetId}
                selectedCellsCount={selectedCellsCount}
                colorToNoteMap={colorToNoteMap}
                canvasRef={canvasRef}
                displaySection={
                  activeSidebarTab === 'screens'
                    ? 'grid'
                    : activeSidebarTab === 'notes'
                    ? 'notes'
                    : 'both'
                }
                onUpdateProject={handleUpdateProject}
                onDeleteNoteById={handleDeleteNoteById}
                onBlinkCellsOnLiveScreen={handleBlinkCellsOnLiveScreen}
                onInvertSelection={handleInvertSelection}
              />
            )}

            {/* TAB 3 (or ALL): Center Crosshair & Rulers Manager */}
            {(activeSidebarTab === 'guides' || activeSidebarTab === 'all') && (
              <>
                <CenterConfigSection
                  centerConfig={centerConfig}
                  compWidth={project.compWidth}
                  compHeight={project.compHeight}
                  lang={lang}
                  expandSignal={expandSignal}
                  canvasRef={canvasRef}
                  onUpdateCenterConfig={handleUpdateCenterConfig}
                />

                <RulersManagerSection
                  project={project}
                  rulers={rulers}
                  lang={lang}
                  expandSignal={expandSignal}
                  selectedCellsCount={selectedCellsCount}
                  snapRulersEnabled={snapRulersEnabled}
                  onToggleSnapRulers={() => setSnapRulersEnabled((v) => !v)}
                  onToggleShowDistances={() =>
                    handleUpdateProject((prev) => ({
                      ...prev,
                      overlays: {
                        ...prev.overlays,
                        showRulerDistances: prev.overlays?.showRulerDistances === false,
                      },
                    }))
                  }
                  onAddRuler={handleAddRuler}
                  onAddRulersAroundSelection={handleAddRulersAroundSelection}
                  onUpdateRuler={handleUpdateRuler}
                  onDeleteRuler={handleDeleteRuler}
                  onToggleLockAllRulers={handleToggleLockAllRulers}
                  onUpdateOverlays={(patch) =>
                    handleUpdateProject((prev) => ({
                      ...prev,
                      overlays: {
                        ...prev.overlays,
                        ...patch,
                      },
                    }))
                  }
                />
              </>
            )}

            {/* TAB 4 (or ALL): Color Calibration, Test Image & Reports */}
            {(activeSidebarTab === 'colors' || activeSidebarTab === 'all') && (
              <ColorCalibrationSection
                colorConfig={colorConfig}
                colorMetrics={colorMetrics}
                hoveredPixel={hoveredPixel}
                lang={lang}
                expandSignal={expandSignal}
                canvasRef={canvasRef}
                onUpdateColorConfig={handleUpdateColorConfig}
                onOpenReportModal={() => setIsColorReportModalOpen(true)}
              />
            )}
          </div>
        </aside>

        {/* Grabbable Vertical Splitter to Resize Sidebar */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingSidebar(true);
          }}
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
          title={t(
            'اسحب لتوسيع أو تضييق القائمة الجانبية (انقر مرتين لإعادة الضبط)',
            'Drag to resize sidebar (Double-click to reset)'
          )}
          className={`w-2.5 shrink-0 relative z-30 cursor-col-resize select-none flex flex-col items-center justify-center border-x border-[#434853] group transition-colors ${
            isResizingSidebar
              ? 'bg-[#C8CDD8]'
              : 'bg-[#202328] hover:bg-[#32363F]'
          }`}
        >
          {/* Central Tactile Grip Handle */}
          <div
            className={`h-16 w-full flex items-center justify-center border-y border-[#3A3E47] transition-colors ${
              isResizingSidebar
                ? 'bg-[#DCE0E8] text-[#1C1E22]'
                : 'bg-[#2C3038] group-hover:bg-[#C8CDD8] text-[#B8BEC9] group-hover:text-[#1C1E22]'
            }`}
          >
            <DotsSixVertical weight="bold" className="w-3.5 h-3.5" />
          </div>

          {/* Live Width Badge while Dragging */}
          {isResizingSidebar && (
            <div
              dir="ltr"
              className="absolute top-1/2 -translate-y-12 px-2 py-0.5 bg-[#1C1E22] border border-[#C8CDD8] text-[10px] font-mono font-bold text-[#DCE0E8] whitespace-nowrap shadow-lg pointer-events-none"
            >
              {sidebarWidth}px
            </div>
          )}
        </div>

        {/* Main Spacious Canvas Stage */}
        <main
          ref={viewportContainerRef}
          onWheel={isPanoramicWallView ? undefined : handleViewportWheel}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setContextMenu(null);
            }
          }}
          className={`flex-1 relative overflow-hidden flex items-center justify-center ${
            isPanoramicWallView ? 'p-0' : 'p-6'
          } bg-[#1E2126]`}
          style={{
            backgroundImage:
              'radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
          {isPanoramicWallView ? (
            <MultiScreenWallStage
              screens={screens}
              activeScreenId={project.id}
              isPureMode={false}
              lang={lang}
              activeLaser={laser}
              editorBlinkingKeys={editorBlinkingKeys}
              editorBlinkPhaseOn={editorBlinkPhaseOn}
              editorIdentifyFlash={editorIdentifyFlash}
              flashingScreenId={flashingScreenId}
              editorIdentifyFlashIntensity={editorIdentifyFlashIntensityRef.current}
              clockTick={clockTick}
              isScreenLiveOpen={isScreenLiveOpen}
              onSelectScreen={(scrId) => {
                setActiveScreenId(scrId);
                setContextMenu(null);
              }}
              onFocusSingleScreen={(scrId) => {
                setActiveScreenId(scrId);
                setContextMenu(null);
                setIsPanoramicWallView(false);
                setAutoFit(true);
              }}
              onFlashScreen={(scrId) => handleIdentifyScreen(scrId)}
              onUpdateScreensPositions={handleUpdateScreensPositions}
              onTogglePureMode={(nextPure) => setIsPureWallMode(Boolean(nextPure))}
              onExitWallView={() => setIsPanoramicWallView(false)}
            />
          ) : (
            /* Single Active Screen Transform Container */
            <div
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
                width: `${Math.round(project.compWidth * zoom)}px`,
                height: `${Math.round(project.compHeight * zoom)}px`,
              }}
              className="relative shadow-2xl ring-1 ring-[#494F5C] bg-[#181A1F] shrink-0 rounded-none"
            >
              {/* Top Edge Interactive Ruler Strip: Click or drag down to spawn a Horizontal (Y) Ruler */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleSpawnRulerFromEdge('horizontal');
                }}
                title={t(
                  'انقر أو اسحب للأسفل لإنشاء مسطرة أفقية (Y)',
                  'Click or drag down to spawn a Horizontal (Y) Ruler'
                )}
                className="absolute -top-3.5 left-0 right-0 h-3.5 bg-[#242830]/95 hover:bg-[#32363F] border border-[#494F5C] flex items-center justify-between px-2 text-[8px] font-mono text-[#AEB5C2] cursor-row-resize select-none"
              >
                <span>0px</span>
                <span>
                  {t(
                    '+ انقر أو اسحب لإضافة مسطرة أفقية (Y)',
                    '+ Click or drag for Horizontal Ruler (Y)'
                  )}
                </span>
                <span>{project.compWidth}px</span>
              </div>

              {/* Left Edge Interactive Ruler Strip: Click or drag across to spawn a Vertical (X) Ruler */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleSpawnRulerFromEdge('vertical');
                }}
                title={t(
                  'انقر أو اسحب لليمين لإنشاء مسطرة عمودية (X)',
                  'Click or drag across to spawn a Vertical (X) Ruler'
                )}
                className="absolute top-0 bottom-0 -left-3.5 w-3.5 bg-[#242830]/95 hover:bg-[#32363F] border border-[#494F5C] flex flex-col items-center justify-between py-2 text-[8px] font-mono text-[#AEB5C2] cursor-col-resize select-none"
              >
                <span>0</span>
                <span className="[writing-mode:vertical-rl] rotate-180">
                  {t('+ مسطرة عمودية (X)', '+ Vertical Ruler (X)')}
                </span>
                <span>{project.compHeight}</span>
              </div>

              <canvas
                ref={canvasRef}
                width={project.compWidth}
                height={project.compHeight}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseLeave}
                onContextMenu={handleCanvasContextMenu}
                className={`w-full h-full block ${
                  draggingRulerId
                    ? 'cursor-move'
                    : effectivePanMode
                    ? isPanning
                      ? 'cursor-grabbing'
                      : 'cursor-grab'
                    : toolMode === 'laser' || toolMode === 'draw'
                    ? 'cursor-crosshair'
                    : 'cursor-pointer'
                }`}
              />
            </div>
          )}

          {/* Upgraded Live Canvas Minimap Radar (High-Precision Navigator for Large & Zoomed Screens) */}
          {!isPanoramicWallView && isMinimapOpen && (() => {
            const maxMiniW = 240;
            const maxMiniH = 142;
            const aspect = project.compWidth / Math.max(1, project.compHeight);
            let miniW = maxMiniW;
            let miniH = Math.round(maxMiniW / aspect);
            if (miniH > maxMiniH) {
              miniH = maxMiniH;
              miniW = Math.round(maxMiniH * aspect);
            }
            miniW = Math.max(110, miniW);
            miniH = Math.max(62, miniH);

            const scaledW = Math.max(1, project.compWidth * zoom);
            const scaledH = Math.max(1, project.compHeight * zoom);
            const aimX = Math.max(
              0,
              Math.min(project.compWidth, Math.round((0.5 - pan.x / scaledW) * project.compWidth))
            );
            const aimY = Math.max(
              0,
              Math.min(project.compHeight, Math.round((0.5 - pan.y / scaledH) * project.compHeight))
            );
            const aimCol = Math.min(
              computed.cols - 1,
              Math.max(0, Math.floor(aimX / Math.max(1, computed.baseCellWidth)))
            );
            const aimRow = Math.min(
              computed.rows - 1,
              Math.max(0, Math.floor(aimY / Math.max(1, computed.baseCellHeight)))
            );
            const aimCell = computed.cellMap[`${aimRow}-${aimCol}`];

            return (
              <div
                ref={minimapRef}
                className="absolute bottom-3 left-3 z-20 flex flex-col bg-[#202329]/95 border border-[#494F5C] shadow-2xl rounded-none select-none"
              >
                {/* Radar Header with Icon-Only Quick Controls */}
                <div className="flex items-center justify-between gap-2 px-2 py-1 bg-[#2A2E37] border-b border-[#494F5C]">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#DCE0E8]">
                    <Compass weight="fill" className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span dir="ltr" className="font-mono text-[#DCE0E8]">
                      {project.compWidth}×{project.compHeight}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAutoFit(false);
                        setZoom((z) => Math.min(ZOOM_MAX, Number(Math.max(1.5, z * 1.6).toFixed(3))));
                      }}
                      title={t('تكبير الفحص على الرادار (Zoom In)', 'Zoom In Inspection')}
                      className="w-5 h-5 flex items-center justify-center studio-btn-elevated border rounded-none cursor-pointer"
                    >
                      <MagnifyingGlassPlus weight="bold" className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAutoFit(true);
                        recalculateFitZoom();
                      }}
                      title={t('احتواء كامل الشاشة (Fit)', 'Fit Screen')}
                      className="w-5 h-5 flex items-center justify-center studio-btn-elevated border rounded-none cursor-pointer"
                    >
                      <CornersOut weight="bold" className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPan({ x: 0, y: 0 })}
                      title={t('توسيط الكاميرا (Center)', 'Center Camera')}
                      className="w-5 h-5 flex items-center justify-center studio-btn-elevated border rounded-none cursor-pointer"
                    >
                      <Crosshair weight="bold" className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMinimapOpen(false)}
                      title={t('إغلاق الرادار المصغر', 'Close Minimap Radar')}
                      className="w-5 h-5 flex items-center justify-center studio-btn border rounded-none cursor-pointer"
                    >
                      <X weight="bold" className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Live High-DPI Radar Canvas Stage */}
                <div className="p-2 bg-[#16181D] flex flex-col gap-1.5">
                  <div
                    style={{ width: `${miniW}px`, height: `${miniH}px` }}
                    className="relative border border-[#494F5C] bg-[#090D16] overflow-hidden"
                  >
                    <canvas
                      ref={minimapCanvasRef}
                      width={miniW * 2}
                      height={miniH * 2}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setIsDraggingMinimap(true);
                        panFromMinimapClientCoords(e.clientX, e.clientY, true);
                      }}
                      onWheel={handleMinimapWheel}
                      title={t(
                        'انقر أو اسحب للتنقل الفوري، أو مرر عجلة الماوس للتكبير والتصغير',
                        'Click/drag to pan & zoom, or scroll wheel to zoom'
                      )}
                      className="w-full h-full block cursor-crosshair"
                    />
                  </div>

                  {/* Live Radar Coordinate & Square Telemetry Footer */}
                  <div
                    dir="ltr"
                    className="flex items-center justify-between gap-2 px-1 text-[9px] font-mono text-[#B8BEC9]"
                  >
                    <span className="text-[#FEF08A] font-bold">
                      {aimCell ? `[${aimCell.displayId}]` : ''} X:{aimX} Y:{aimY}
                    </span>
                    <span className="text-[#38BDF8] font-bold">
                      {Math.round(zoom * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Right-Click Context Menu for Attaching Notes (Sharp 0px corners, Soft Charcoal + Soft Silver Buttons) */}
          {contextMenu && (
            <div
              style={{
                left: `${contextMenu.clientX}px`,
                top: `${contextMenu.clientY}px`,
              }}
              onClick={(e) => e.stopPropagation()}
              className="fixed z-50 w-76 rounded-none bg-[#2A2D34] border border-[#494F5C] shadow-2xl p-3 space-y-2.5"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#3F444E] pb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-none border border-[#DCE0E8]"
                    style={{ backgroundColor: contextMenu.effectiveColor }}
                  />
                  <span className="text-xs font-bold text-[#DCE0E8]">
                    {t('ملاحظة للمربع', 'Square Note')}{' '}
                    <span dir="ltr" className="font-mono text-[#B8BEC9]">
                      {contextMenu.displayId}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setContextMenu(null)}
                  className="p-1 studio-btn-elevated border rounded-none cursor-pointer"
                >
                  <X weight="bold" className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Color Swatches inside Context Menu */}
              <div className="space-y-1">
                <span className="block text-[10px] text-[#B8BEC9]">
                  {t('لون هذه الملاحظة (لون فريد لكل ملاحظة):', 'Unique Note Color:')}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {SELECTION_COLOR_SWATCHES.map((sw) => {
                    const up = sw.hex.toUpperCase();
                    const owner = colorToNoteMap.get(up);
                    const isUsedByOther =
                      Boolean(owner) && owner!.id !== contextMenu.existingNoteId;
                    const isSelectedColor =
                      contextMenu.effectiveColor.toUpperCase() === up;

                    return (
                      <button
                        key={sw.hex}
                        type="button"
                        disabled={isUsedByOther}
                        onClick={() => handleContextMenuColorChange(sw.hex)}
                        style={{ backgroundColor: sw.hex }}
                        title={
                          isUsedByOther
                            ? `${t('مستخدم في:', 'Used by:')} ${owner?.text}`
                            : lang === 'en'
                            ? sw.nameEn
                            : sw.nameAr
                        }
                        className={`relative w-5 h-5 rounded-none border flex items-center justify-center ${
                          isUsedByOther
                            ? 'opacity-30 cursor-not-allowed border-[#3F444E]'
                            : isSelectedColor
                            ? 'border-[#DCE0E8] ring-2 ring-[#DCE0E8] scale-110 cursor-pointer'
                            : 'border-[#494F5C] cursor-pointer'
                        }`}
                      >
                        {isUsedByOther && (
                          <LockKey weight="bold" className="w-3 h-3 text-[#1C1E22]" />
                        )}
                      </button>
                    );
                  })}

                  {/* Pro Color Picker Trigger inside Context Menu */}
                  <button
                    type="button"
                    onClick={() => setIsContextColorPickerOpen(true)}
                    className="flex items-center gap-1 px-1.5 h-5 rounded-none studio-btn-elevated border text-[10px] font-bold cursor-pointer"
                    title={t('منتقي ألوان احترافي', 'Pro Color Picker')}
                  >
                    <Palette weight="bold" className="w-3 h-3" />
                    <span>{t('مخصص', 'Custom')}</span>
                  </button>
                </div>
              </div>

              {/* Scope Selection: Single Square vs All Selected of Same Color */}
              <div className="space-y-1">
                <label className="block text-[10px] text-[#B8BEC9]">
                  {t('نطاق تطبيق الملاحظة:', 'Note Target Scope:')}
                </label>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() =>
                      setContextMenu((prev) =>
                        prev ? { ...prev, scope: 'single', errorMsg: null } : null
                      )
                    }
                    className={`w-full text-right px-2.5 py-1.5 rounded-none border text-xs font-bold flex items-center justify-between cursor-pointer ${
                      contextMenu.scope === 'single'
                        ? 'studio-btn-active'
                        : 'studio-btn'
                    }`}
                  >
                    <span>
                      {t(
                        `هذا الصندوق فقط (${contextMenu.displayId})`,
                        `This Square Only (${contextMenu.displayId})`
                      )}
                    </span>
                    {contextMenu.scope === 'single' && (
                      <Check weight="bold" className="w-3.5 h-3.5 shrink-0" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setContextMenu((prev) =>
                        prev ? { ...prev, scope: 'color-group', errorMsg: null } : null
                      )
                    }
                    className={`w-full text-right px-2.5 py-1.5 rounded-none border text-xs font-bold flex items-center justify-between cursor-pointer ${
                      contextMenu.scope === 'color-group'
                        ? 'studio-btn-active'
                        : 'studio-btn'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-none border border-[#3A3E47]"
                        style={{ backgroundColor: contextMenu.effectiveColor }}
                      />
                      <span>
                        {t(
                          `كل الصناديق المحددة بنفس اللون (${sameColorCount})`,
                          `All Same-Color Squares (${sameColorCount})`
                        )}
                      </span>
                    </span>
                    {contextMenu.scope === 'color-group' && (
                      <Check weight="bold" className="w-3.5 h-3.5 shrink-0" />
                    )}
                  </button>
                </div>
              </div>

              {/* Note Text Input */}
              <div className="space-y-1.5">
                <input
                  ref={contextInputRef}
                  type="text"
                  placeholder={t('اكتب الملاحظة هنا...', 'Type note...')}
                  value={contextMenu.draftText}
                  onChange={(e) =>
                    setContextMenu((prev) =>
                      prev ? { ...prev, draftText: e.target.value, errorMsg: null } : null
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveContextMenuNote();
                    } else if (e.key === 'Escape') {
                      setContextMenu(null);
                    }
                  }}
                  className="w-full bg-[#202328] border border-[#434853] focus:border-[#B8BEC9] rounded-none px-2.5 py-1.5 text-xs text-[#DCE0E8] placeholder-[#8A919E] outline-none"
                />

                {/* Quick Chips */}
                <div className="flex items-center gap-1 flex-wrap">
                  {[
                    t('موقع الصحفي', 'Anchor'),
                    t('موقع الضيف', 'Guest'),
                    t('الطاولة', 'Desk'),
                    t('كاميرا 1', 'Cam 1'),
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleSaveContextMenuNote(chip)}
                      className="px-2 py-0.5 rounded-none studio-btn-elevated border text-[10px] font-bold cursor-pointer"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Validation Error if Color is Already Used */}
              {contextMenu.errorMsg && (
                <div className="p-2 rounded-none bg-[#3A2226] border border-[#8C4A52] text-[11px] text-[#DCE0E8] flex items-start gap-1.5 leading-snug">
                  <WarningCircle weight="bold" className="w-3.5 h-3.5 text-[#DCE0E8] shrink-0 mt-0.5" />
                  <span>{contextMenu.errorMsg}</span>
                </div>
              )}

              {/* Quick Select Entire Row or Entire Column with Current Color */}
              <div className="grid grid-cols-2 gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const targetCell = computed.cellMap[contextMenu.cellKey];
                    if (!targetCell) return;
                    const colorHex = contextMenu.effectiveColor.toUpperCase();
                    handleUpdateProject((prev) => {
                      const nextOverrides = { ...prev.overrides };
                      for (let c = 0; c < computed.cols; c++) {
                        const k = `${targetCell.row}-${c}`;
                        nextOverrides[k] = {
                          ...nextOverrides[k],
                          cellKey: k,
                          color: colorHex,
                          updatedAt: new Date().toISOString(),
                        };
                      }
                      return { ...prev, overrides: nextOverrides };
                    });
                    showToast(t('تم تلوين وتحديد الصف بالكامل', 'Selected entire row'));
                  }}
                  className="py-1 px-1.5 rounded-none studio-btn-elevated border text-[10px] font-bold cursor-pointer"
                >
                  {t('تحديد الصف بالكامل ↔', 'Select Entire Row ↔')}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const targetCell = computed.cellMap[contextMenu.cellKey];
                    if (!targetCell) return;
                    const colorHex = contextMenu.effectiveColor.toUpperCase();
                    handleUpdateProject((prev) => {
                      const nextOverrides = { ...prev.overrides };
                      for (let r = 0; r < computed.rows; r++) {
                        const k = `${r}-${targetCell.col}`;
                        nextOverrides[k] = {
                          ...nextOverrides[k],
                          cellKey: k,
                          color: colorHex,
                          updatedAt: new Date().toISOString(),
                        };
                      }
                      return { ...prev, overrides: nextOverrides };
                    });
                    showToast(t('تم تلوين وتحديد العمود بالكامل', 'Selected entire column'));
                  }}
                  className="py-1 px-1.5 rounded-none studio-btn-elevated border text-[10px] font-bold cursor-pointer"
                >
                  {t('تحديد العمود بالكامل ↕', 'Select Entire Col ↕')}
                </button>
              </div>

              {/* Save / Delete Buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleSaveContextMenuNote()}
                  className="flex-1 py-1.5 rounded-none studio-btn-elevated border font-bold text-xs cursor-pointer"
                >
                  {t('حفظ الملاحظة', 'Save Note')}
                </button>
                {contextMenu.existingNoteId && (
                  <button
                    type="button"
                    onClick={() => handleDeleteNoteById(contextMenu.existingNoteId!)}
                    className="p-1.5 rounded-none studio-btn border cursor-pointer"
                    title={t('حذف الملاحظة', 'Delete Note')}
                  >
                    <Trash weight="bold" className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 100% Icon-Only Floating Bottom Control Bar (Zero Text Labels, Sharp 0px Corners) */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2 py-1.5 rounded-none bg-[#2A2E37] border border-[#494F5C] shadow-2xl">
            {/* Floating Laser Color & Mode Selector (appears right above the bar when Laser is active) */}
            {toolMode === 'laser' && (
              <div className="absolute bottom-full mb-1.5 right-0 flex items-center gap-1.5 px-2 py-1 rounded-none bg-[#1F232B] border border-[#525866] shadow-2xl">
                {/* 5 High-Contrast Laser Color Swatches: Red, Yellow, White, Green, Cyan */}
                <div className="flex items-center gap-1">
                  {[
                    { hex: '#FF2424', label: t('ليزر أحمر', 'Red Laser') },
                    { hex: '#FACC15', label: t('ليزر أصفر', 'Yellow Laser') },
                    { hex: '#FFFFFF', label: t('ليزر أبيض', 'White Laser') },
                    { hex: '#10B981', label: t('ليزر أخضر', 'Green Laser') },
                    { hex: '#38BDF8', label: t('ليزر سماوي', 'Cyan Laser') },
                  ].map((c) => {
                    const isSelected = laserColor.toUpperCase() === c.hex.toUpperCase();
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        title={c.label}
                        onClick={() => handleChangeLaserColor(c.hex)}
                        style={{ backgroundColor: c.hex }}
                        className={`w-5 h-5 rounded-none border cursor-pointer transition-transform ${
                          isSelected
                            ? 'border-[#1C1E22] ring-2 ring-[#FEF08A] scale-110'
                            : 'border-[#3A3E47] opacity-85 hover:opacity-100'
                        }`}
                      />
                    );
                  })}
                </div>

                <div className="h-4 w-px bg-[#434853]" />

                {/* 3 Laser Beam Modes: Free Trail/Draw, Straight Line, Crosshair Axis */}
                <div className="flex items-center gap-1">
                  {[
                    {
                      id: 'free' as LaserModeType,
                      title: t(
                        'مؤشر ليزر انسيابي + رسم خط حر عند السحب (Free Laser & Draw)',
                        'Free Laser Pointer & Smooth Draw on Drag'
                      ),
                      Icon: Target,
                    },
                    {
                      id: 'line' as LaserModeType,
                      title: t(
                        'خط ليزر مستقيم بين نقطتين مع القياس (Straight Laser Line)',
                        'Straight Point-to-Point Laser Line'
                      ),
                      Icon: Ruler,
                    },
                    {
                      id: 'crosshair' as LaserModeType,
                      title: t(
                        'تقاطع ليزر محوري كامل الشاشة (Full-Screen Laser Crosshair)',
                        'Full-Screen Laser Crosshair'
                      ),
                      Icon: Crosshair,
                    },
                  ].map(({ id, title, Icon }) => {
                    const isModeActive = laserMode === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        title={title}
                        onClick={() => handleChangeLaserMode(id)}
                        className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer ${
                          isModeActive
                            ? 'studio-btn-active ring-1 ring-[#FEF08A]'
                            : 'studio-btn'
                        }`}
                      >
                        <Icon weight={isModeActive ? 'fill' : 'bold'} className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </div>

                {/* Clear Drawn Laser Line button when a stroke is on screen */}
                {(laser?.drawnStroke?.length || 0) >= 2 && (
                  <>
                    <div className="h-4 w-px bg-[#434853]" />
                    <button
                      type="button"
                      onClick={handleClearLaserStroke}
                      title={t('مسح خط الليزر المرسوم', 'Clear Drawn Laser Line')}
                      className="w-6 h-6 flex items-center justify-center rounded-none studio-btn-elevated hover:bg-[#EF4444] hover:text-[#FFFFFF] border cursor-pointer"
                    >
                      <Trash weight="bold" className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Floating Freehand Pen & Organic Shape Sub-Toolbar (when 'draw' mode is active) */}
            {toolMode === 'draw' && (
              <div className="absolute bottom-full mb-1.5 right-0 flex items-center gap-1.5 px-2 py-1 rounded-none bg-[#1F232B] border border-[#525866] shadow-2xl">
                {/* 5 Freehand & Shape Modes: Closed Polygon, Freehand Lasso-to-Tiles, Freehand Pen, Ellipse, Arrow */}
                <div className="flex items-center gap-1">
                  {[
                    {
                      id: 'polygon' as FreehandDrawMode,
                      title: t(
                        'منطقة شكل حر مغلقة ومظللة فوق البلاطات مع حساب الأبعاد تلقائياً (Freeform Closed Shape)',
                        'Freeform Closed Shape with Fill & Auto Dimensions'
                      ),
                      Icon: Polygon,
                    },
                    {
                      id: 'lasso_tiles' as FreehandDrawMode,
                      title: t(
                        'الحبل الحر لتحديد وتلوين البلاطات الواقعة داخل الشكل المرسوم تلقائياً (Freehand Lasso Tile Select)',
                        'Freehand Lasso to Select Grid Tiles Inside Shape'
                      ),
                      Icon: SelectionPlus,
                    },
                    {
                      id: 'freehand' as FreehandDrawMode,
                      title: t(
                        'قلم رسم حر مفتوح للتأشير فوق البلاطات (Freehand Pen Stroke)',
                        'Freehand Pen Stroke Above Tiles'
                      ),
                      Icon: PenNib,
                    },
                    {
                      id: 'ellipse' as FreehandDrawMode,
                      title: t(
                        'رسم دائرة أو قطع ناقص حر فوق البلاطات (Freeform Circle / Ellipse)',
                        'Freeform Circle / Ellipse'
                      ),
                      Icon: Circle,
                    },
                    {
                      id: 'arrow' as FreehandDrawMode,
                      title: t(
                        'رسم سهم توجيهي فوق البلاطات (Directional Vector Arrow)',
                        'Directional Vector Arrow'
                      ),
                      Icon: ArrowUpRight,
                    },
                  ].map(({ id, title, Icon }) => {
                    const isSubActive = drawMode === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        title={title}
                        onClick={() => setDrawMode(id)}
                        className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                          isSubActive
                            ? 'bg-[#38BDF8] text-[#111317] border-[#FFFFFF] ring-1 ring-[#FEF08A]'
                            : 'bg-[#2C3038] hover:bg-[#434956] text-[#DCE0E8] border-[#3F4552]'
                        }`}
                      >
                        <Icon weight={isSubActive ? 'fill' : 'bold'} className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </div>

                <div className="h-4 w-px bg-[#434853]" />

                {/* 6 High-Contrast Pen & Shape Color Swatches */}
                <div className="flex items-center gap-1">
                  {[
                    { hex: '#38BDF8', label: t('سماوي هندسي', 'Cyan') },
                    { hex: '#FACC15', label: t('أصفر تحذيري', 'Yellow') },
                    { hex: '#FF2424', label: t('أحمر بث', 'Red') },
                    { hex: '#10B981', label: t('أخضر زمردي', 'Emerald') },
                    { hex: '#A855F7', label: t('بنفسجي', 'Purple') },
                    { hex: '#FFFFFF', label: t('أبيض نقي', 'White') },
                  ].map((c) => {
                    const isSelected = drawColor.toUpperCase() === c.hex.toUpperCase();
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        title={c.label}
                        onClick={() => setDrawColor(c.hex)}
                        style={{ backgroundColor: c.hex }}
                        className={`w-4.5 h-4.5 rounded-none border cursor-pointer transition-transform ${
                          isSelected
                            ? 'border-[#1C1E22] ring-2 ring-[#FEF08A] scale-110'
                            : 'border-[#3A3E47] opacity-80 hover:opacity-100'
                        }`}
                      />
                    );
                  })}
                </div>

                <div className="h-4 w-px bg-[#434853]" />

                {/* 3 Stroke Thickness Presets (3px, 5px, 8px) */}
                <div className="flex items-center gap-1">
                  {[
                    { w: 3, dotClass: 'w-1.5 h-1.5', title: t('سمك خط رفيع (3px)', 'Thin Stroke (3px)') },
                    { w: 5, dotClass: 'w-2 h-2', title: t('سمك خط متوسط (5px)', 'Medium Stroke (5px)') },
                    { w: 8, dotClass: 'w-2.5 h-2.5', title: t('سمك خط عريض (8px)', 'Thick Stroke (8px)') },
                  ].map(({ w, dotClass, title }) => {
                    const isSelected = drawStrokeWidth === w;
                    return (
                      <button
                        key={w}
                        type="button"
                        title={title}
                        onClick={() => setDrawStrokeWidth(w)}
                        className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                          isSelected
                            ? 'studio-btn-active'
                            : 'bg-[#2C3038] hover:bg-[#434956] text-[#DCE0E8] border-[#3F4552]'
                        }`}
                      >
                        <span className={`${dotClass} rounded-none bg-current`} />
                      </button>
                    );
                  })}
                </div>

                {/* Show/Hide Layer, Undo Last Shape, Clear All Shapes */}
                {(project.drawings?.length || 0) > 0 && (
                  <>
                    <div className="h-4 w-px bg-[#434853]" />
                    <button
                      type="button"
                      onClick={handleToggleShowDrawings}
                      title={
                        project.overlays.showDrawings === false
                          ? t('إظهار طبقة الأشكال الحرة', 'Show Freehand Layer')
                          : t('إخفاء طبقة الأشكال الحرة مؤقتاً', 'Hide Freehand Layer')
                      }
                      className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                        project.overlays.showDrawings === false
                          ? 'bg-[#2C3038] text-[#8E95A5] border-[#3F4552]'
                          : 'bg-[#2C3038] hover:bg-[#38BDF8] hover:text-[#111317] text-[#38BDF8] border-[#3F4552]'
                      }`}
                    >
                      {project.overlays.showDrawings === false ? (
                        <EyeSlash weight="bold" className="w-3.5 h-3.5" />
                      ) : (
                        <Eye weight="bold" className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleUndoLastDrawing}
                      title={t('التراجع عن آخر شكل حر مرسوم', 'Undo Last Freehand Shape')}
                      className="w-6 h-6 flex items-center justify-center rounded-none bg-[#2C3038] hover:bg-[#FACC15] hover:text-[#111317] border border-[#3F4552] text-[#DCE0E8] cursor-pointer transition-colors"
                    >
                      <ArrowCounterClockwise weight="bold" className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllDrawings}
                      title={t(
                        `مسح جميع الأشكال الحرة (${project.drawings?.length || 0})`,
                        `Clear All Freehand Shapes (${project.drawings?.length || 0})`
                      )}
                      className="w-6 h-6 flex items-center justify-center rounded-none bg-[#2C3038] hover:bg-[#EF4444] hover:text-[#FFFFFF] border border-[#3F4552] text-[#DCE0E8] cursor-pointer transition-colors"
                    >
                      <Trash weight="bold" className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Group 1: Primary Interaction, Drawing & Pointing Tools — CYAN THEME (#38BDF8) */}
            <div className="flex items-center gap-1 p-0.5 bg-[#14202B] border border-[#263E52] border-t-2 border-t-[#38BDF8]">
              {[
                {
                  id: 'select' as const,
                  title: t('[أدوات التفاعل] أداة التحديد الفردي والسحب (Select)', '[Tools] Select Squares'),
                  Icon: Cursor,
                },
                {
                  id: 'box' as const,
                  title: t('[أدوات التفاعل] أداة التحديد المستطيل (Box Select)', '[Tools] Box Marquee Select'),
                  Icon: SelectionPlus,
                },
                {
                  id: 'draw' as const,
                  title: t(
                    '[أدوات التفاعل] طبقة الرسم الحر والأشكال فوق البلاطات (D) — لتحديد مناطق حرة أو تحديد البلاطات بالحبل الحر',
                    '[Tools] Freehand Pen & Organic Shapes Layer (D)'
                  ),
                  Icon: PenNib,
                },
                {
                  id: 'laser' as const,
                  title: t(
                    '[أدوات التفاعل] مؤشر وخط الليزر الحي المباشر — انقر للتشغيل واختيار اللون ونمط الخط',
                    '[Tools] Live Laser Beam & Line'
                  ),
                  Icon: Target,
                },
                {
                  id: 'pan' as const,
                  title: t('[أدوات التفاعل] أداة تحريك الشاشة (Pan / Space)', '[Tools] Pan Canvas (Space)'),
                  Icon: HandGrabbing,
                },
              ].map(({ id, title, Icon }) => {
                const isActive =
                  (id === 'pan' && effectivePanMode) || (toolMode === id && !isSpacePressed);
                const isLaserActive = id === 'laser' && isActive;
                const isDrawActive = id === 'draw' && isActive;
                return (
                  <button
                    key={id}
                    type="button"
                    title={title}
                    onClick={() => handleSelectToolMode(id)}
                    className={`relative w-7 h-7 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                      isLaserActive
                        ? 'bg-[#111720] text-[#FFFFFF] border-[#FEF08A] ring-1 ring-[#FEF08A]'
                        : isDrawActive
                        ? 'bg-[#111720] text-[#38BDF8] border-[#38BDF8] ring-1 ring-[#38BDF8]'
                        : isActive
                        ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE] ring-1 ring-[#38BDF8]'
                        : 'bg-[#1B2C3B] hover:bg-[#274056] text-[#7DD3FC] hover:text-[#E0F2FE] border-[#2C4C66]'
                    }`}
                  >
                    <Icon
                      weight={isActive ? 'fill' : 'bold'}
                      style={
                        isLaserActive
                          ? { color: laserColor }
                          : isDrawActive
                          ? { color: drawColor }
                          : undefined
                      }
                      className="w-4 h-4"
                    />
                    {(isLaserActive || isDrawActive) && (
                      <span
                        style={{ backgroundColor: isLaserActive ? laserColor : drawColor }}
                        className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-none"
                      />
                    )}
                    {id === 'draw' && (project.drawings?.length || 0) > 0 && !isDrawActive && (
                      <span className="absolute -top-1 -left-1 px-0.5 min-w-[12px] h-3 flex items-center justify-center bg-[#38BDF8] text-[#09131C] text-[8px] font-mono font-bold rounded-none">
                        {project.drawings?.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Group 2: Edit History (Undo / Redo) — SLATE SILVER THEME (#94A3B8) */}
            <div className="flex items-center gap-1 p-0.5 bg-[#1D2028] border border-[#3B4252] border-t-2 border-t-[#94A3B8]">
              <button
                type="button"
                disabled={!canUndo}
                onClick={handleUndo}
                title={t('[سجل التعديلات] تراجع عن آخر تعديل (Ctrl+Z)', '[History] Undo (Ctrl+Z)')}
                className="w-7 h-7 flex items-center justify-center rounded-none bg-[#282D38] hover:bg-[#373E4D] border border-[#475061] text-[#CBD5E1] hover:text-[#FFFFFF] disabled:opacity-35 disabled:pointer-events-none cursor-pointer transition-colors"
              >
                <ArrowCounterClockwise weight="bold" className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={handleRedo}
                title={t('[سجل التعديلات] إعادة التعديل (Ctrl+Y)', '[History] Redo (Ctrl+Y)')}
                className="w-7 h-7 flex items-center justify-center rounded-none bg-[#282D38] hover:bg-[#373E4D] border border-[#475061] text-[#CBD5E1] hover:text-[#FFFFFF] disabled:opacity-35 disabled:pointer-events-none cursor-pointer transition-colors"
              >
                <ArrowClockwise weight="bold" className="w-4 h-4" />
              </button>
            </div>

            {/* Group 3: Zoom, Scale & Canvas Navigation (Search & Radar) — AMBER GOLD THEME (#F59E0B) */}
            <div className="relative flex items-center gap-1 p-0.5 bg-[#241C11] border border-[#4D391D] border-t-2 border-t-[#F59E0B]">
              <div dir="ltr" className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setAutoFit(false);
                    setZoom((z) => Math.max(ZOOM_MIN, Number((z / 1.2).toFixed(3))));
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] hover:text-[#FEF3C7] cursor-pointer transition-colors"
                  title={t(`[التكبير والملاحة] تصغير (${Math.round(zoom * 100)}%)`, `[Zoom & Nav] Zoom Out (${Math.round(zoom * 100)}%)`)}
                >
                  <MagnifyingGlassMinus weight="bold" className="w-4 h-4" />
                </button>

                <input
                  type="range"
                  min={10}
                  max={400}
                  step={5}
                  value={Math.min(400, Math.max(10, Math.round(zoom * 100)))}
                  onChange={(e) => {
                    setAutoFit(false);
                    setZoom(Number(e.target.value) / 100);
                  }}
                  title={`${Math.round(zoom * 100)}%`}
                  className="w-20 cursor-pointer mx-0.5 accent-[#F59E0B]"
                />

                <button
                  type="button"
                  onClick={() => {
                    setAutoFit(false);
                    setZoom((z) => Math.min(ZOOM_MAX, Number((z * 1.2).toFixed(3))));
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] hover:text-[#FEF3C7] cursor-pointer transition-colors"
                  title={t(`[التكبير والملاحة] تكبير (${Math.round(zoom * 100)}%)`, `[Zoom & Nav] Zoom In (${Math.round(zoom * 100)}%)`)}
                >
                  <MagnifyingGlassPlus weight="bold" className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAutoFit(true);
                  recalculateFitZoom();
                }}
                title={t('[التكبير والملاحة] احتواء كامل الشاشة (Fit - 0)', '[Zoom & Nav] Fit to Screen (0)')}
                className={`w-7 h-7 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                  autoFit
                    ? 'bg-[#F59E0B] text-[#140E05] border-[#FEF3C7] ring-1 ring-[#FBBF24]'
                    : 'bg-[#332615] hover:bg-[#47351D] text-[#FCD34D] hover:text-[#FEF3C7] border-[#664B24]'
                }`}
              >
                <CornersOut weight={autoFit ? 'fill' : 'bold'} className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setAutoFit(false);
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                title={t('[التكبير والملاحة] الحجم الحقيقي 1:1 (100%)', '[Zoom & Nav] Actual Pixel Size 1:1 (100%)')}
                className={`w-7 h-7 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                  !autoFit && Math.abs(zoom - 1) < 0.01
                    ? 'bg-[#F59E0B] text-[#140E05] border-[#FEF3C7] ring-1 ring-[#FBBF24]'
                    : 'bg-[#332615] hover:bg-[#47351D] text-[#FCD34D] hover:text-[#FEF3C7] border-[#664B24]'
                }`}
              >
                <FrameCorners weight="bold" className="w-4 h-4" />
              </button>

              {(pan.x !== 0 || pan.y !== 0) && (
                <button
                  type="button"
                  onClick={() => setPan({ x: 0, y: 0 })}
                  className="w-7 h-7 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] hover:text-[#FEF3C7] cursor-pointer transition-colors"
                  title={t('[التكبير والملاحة] إعادة توسيط اللوحة (Center)', '[Zoom & Nav] Reset Pan / Center')}
                >
                  <ArrowCounterClockwise weight="bold" className="w-4 h-4" />
                </button>
              )}

              {/* Search Square & Corner Jump Popover */}
              {isSearchPopoverOpen && (
                <div className="absolute bottom-9 left-1/2 -translate-x-1/2 flex flex-col gap-1.5 p-2 bg-[#202329] border border-[#664B24] shadow-2xl rounded-none z-30">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleQuickJumpToSquare();
                      setIsSearchPopoverOpen(false);
                    }}
                    className="flex items-center gap-1"
                  >
                    <input
                      type="text"
                      dir="ltr"
                      autoFocus
                      value={squareSearchQuery}
                      onChange={(e) => setSquareSearchQuery(e.target.value)}
                      placeholder="A12 / 05"
                      className="w-28 bg-[#14171C] border border-[#664B24] focus:border-[#F59E0B] px-2 py-1 text-xs font-mono text-[#DCE0E8] placeholder-[#8A919E] outline-none rounded-none"
                    />
                    <button
                      type="submit"
                      title={t('انتقال ووميض للمربع (Enter)', 'Jump & Flash Square')}
                      className="w-7 h-7 flex items-center justify-center rounded-none bg-[#F59E0B] hover:bg-[#FBBF24] border border-[#FEF3C7] text-[#140E05] cursor-pointer"
                    >
                      <Check weight="bold" className="w-3.5 h-3.5" />
                    </button>
                  </form>

                  {/* 5-Point Corner & Center Quick-Jump Matrix inside Search Popover */}
                  <div dir="ltr" className="grid grid-cols-5 gap-1 pt-0.5 border-t border-[#3A3E47]">
                    <button
                      type="button"
                      onClick={() => handleJumpToCornerOrCenter('tl')}
                      title={t('قفز إلى الركن العلوي الأيسر (Top-Left)', 'Jump to Top-Left Corner')}
                      className="h-6 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] cursor-pointer transition-colors"
                    >
                      <ArrowUpLeft weight="bold" className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleJumpToCornerOrCenter('tr')}
                      title={t('قفز إلى الركن العلوي الأيمن (Top-Right)', 'Jump to Top-Right Corner')}
                      className="h-6 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] cursor-pointer transition-colors"
                    >
                      <ArrowUpRight weight="bold" className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleJumpToCornerOrCenter('center')}
                      title={t('قفز إلى مركز الشاشة (Center)', 'Jump to Screen Center')}
                      className="h-6 flex items-center justify-center rounded-none bg-[#F59E0B] hover:bg-[#FBBF24] border border-[#FEF3C7] text-[#140E05] cursor-pointer transition-colors"
                    >
                      <Crosshair weight="bold" className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleJumpToCornerOrCenter('bl')}
                      title={t('قفز إلى الركن السفلي الأيسر (Bottom-Left)', 'Jump to Bottom-Left Corner')}
                      className="h-6 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] cursor-pointer transition-colors"
                    >
                      <ArrowDownLeft weight="bold" className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleJumpToCornerOrCenter('br')}
                      title={t('قفز إلى الركن السفلي الأيمن (Bottom-Right)', 'Jump to Bottom-Right Corner')}
                      className="h-6 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] cursor-pointer transition-colors"
                    >
                      <ArrowDownRight weight="bold" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsSearchPopoverOpen((v) => !v)}
                title={t(
                  '[التكبير والملاحة] بحث وقفز فوري لرقم المربع أو زوايا الشاشة (Search Square & Corner Jump)',
                  '[Zoom & Nav] Quick Search Square & Corner Jump'
                )}
                className={`w-7 h-7 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                  isSearchPopoverOpen
                    ? 'bg-[#F59E0B] text-[#140E05] border-[#FEF3C7] ring-1 ring-[#FBBF24]'
                    : 'bg-[#332615] hover:bg-[#47351D] text-[#FCD34D] hover:text-[#FEF3C7] border-[#664B24]'
                }`}
              >
                <MagnifyingGlass weight="bold" className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsMinimapOpen((v) => !v)}
                title={t('[التكبير والملاحة] إظهار / إخفاء رادار الشاشة المصغر (Minimap Radar)', '[Zoom & Nav] Toggle Minimap Radar')}
                className={`relative w-7 h-7 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                  isMinimapOpen
                    ? 'bg-[#F59E0B] text-[#140E05] border-[#FEF3C7] ring-1 ring-[#FBBF24]'
                    : 'bg-[#332615] hover:bg-[#47351D] text-[#FCD34D] hover:text-[#FEF3C7] border-[#664B24]'
                }`}
              >
                <Compass weight={isMinimapOpen ? 'fill' : 'bold'} className="w-4 h-4" />
              </button>
            </div>

            {/* Group 4: Dedicated Show/Hide Elements Strip (إظهار وإخفاء عناصر الشاشة) — RADIANT GREEN THEME (#8CC63F) */}
            <div className="flex items-center gap-1 p-0.5 bg-[#162011] border border-[#304622] border-t-2 border-t-[#8CC63F]">
              {[
                {
                  id: 'center_lines',
                  active: Boolean(project.overlays?.centerCrosshair !== false && centerConfig.showLines),
                  title: t(
                    centerConfig.showLines
                      ? '[إظهار/إخفاء] إخفاء الخطين المتقاطعين للمركز (الخطان ظاهران ✓)'
                      : '[إظهار/إخفاء] إظهار الخطين المتقاطعين للمركز (X/Y Crosshair)',
                    centerConfig.showLines
                      ? '[Show/Hide] Hide Center Crosshair Lines (Shown ✓)'
                      : '[Show/Hide] Show Center Crosshair Lines'
                  ),
                  Icon: Plus,
                  onClick: () => {
                    const next = !(project.overlays?.centerCrosshair !== false && centerConfig.showLines);
                    handleUpdateProject((prev) => ({
                      ...prev,
                      overlays: { ...prev.overlays, centerCrosshair: true },
                      centerConfig: {
                        ...DEFAULT_CENTER_CONFIG,
                        ...(prev.centerConfig || {}),
                        showLines: next,
                      },
                    }));
                  },
                },
                {
                  id: 'center_circle',
                  active: Boolean(project.overlays?.centerCrosshair !== false && centerConfig.showCircle),
                  title: t(
                    centerConfig.showCircle
                      ? '[إظهار/إخفاء] إخفاء الدائرة الوسطى (الدائرة ظاهرة ✓)'
                      : '[إظهار/إخفاء] إظهار الدائرة الوسطى (Center Circle)',
                    centerConfig.showCircle
                      ? '[Show/Hide] Hide Center Circle (Shown ✓)'
                      : '[Show/Hide] Show Center Circle'
                  ),
                  Icon: Circle,
                  onClick: () => {
                    const next = !(project.overlays?.centerCrosshair !== false && centerConfig.showCircle);
                    handleUpdateProject((prev) => ({
                      ...prev,
                      overlays: { ...prev.overlays, centerCrosshair: true },
                      centerConfig: {
                        ...DEFAULT_CENTER_CONFIG,
                        ...(prev.centerConfig || {}),
                        showCircle: next,
                      },
                    }));
                  },
                },
                {
                  id: 'rulers',
                  active: Boolean(
                    project.overlays?.showRulers !== false &&
                      rulers.length > 0 &&
                      rulers.some((r) => r.visible !== false)
                  ),
                  title: t(
                    project.overlays?.showRulers !== false &&
                      rulers.length > 0 &&
                      rulers.some((r) => r.visible !== false)
                      ? `[إظهار/إخفاء] إخفاء المساطر وقياساتها (${rulers.length} مساطر ظاهرة ✓)`
                      : '[إظهار/إخفاء] إظهار المساطر الأفقية والعمودية وقياسات المسافات (Rulers)',
                    '[Show/Hide] Toggle Rulers & Distance Measurements Visibility'
                  ),
                  Icon: Ruler,
                  onClick: () => {
                    const currentlyShown =
                      project.overlays?.showRulers !== false &&
                      rulers.length > 0 &&
                      rulers.some((r) => r.visible !== false);

                    if (rulers.length === 0) {
                      const now = Date.now();
                      const defaultRulers: StudioRuler[] = [
                        {
                          id: `ruler-${now}-h`,
                          name: t('مسطرة أفقية 1', 'Horiz Ruler 1'),
                          orientation: 'horizontal',
                          positionPx: Math.round(project.compHeight * 0.25),
                          color: RULER_COLOR_PALETTE[0],
                          strokeWidth: 3,
                          opacity: 95,
                          dashed: false,
                          showTicks: true,
                          visible: true,
                          locked: false,
                        },
                        {
                          id: `ruler-${now}-v`,
                          name: t('مسطرة عمودية 1', 'Vert Ruler 1'),
                          orientation: 'vertical',
                          positionPx: Math.round(project.compWidth * 0.25),
                          color: RULER_COLOR_PALETTE[1],
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
                        overlays: { ...prev.overlays, showRulers: true },
                        rulers: defaultRulers,
                      }));
                    } else {
                      handleUpdateProject((prev) => ({
                        ...prev,
                        overlays: { ...prev.overlays, showRulers: !currentlyShown },
                        rulers: !currentlyShown
                          ? (prev.rulers || []).map((r) => ({ ...r, visible: true }))
                          : prev.rulers,
                      }));
                    }
                  },
                },
                {
                  id: 'note_labels',
                  active: Boolean(project.overlays?.showAllNoteLabels),
                  title: t(
                    project.overlays?.showAllNoteLabels
                      ? '[إظهار/إخفاء] إخفاء عناوين الملاحظات فوق المربعات (العناوين ظاهرة ✓)'
                      : '[إظهار/إخفاء] إظهار عناوين جميع الملاحظات فوق مربعاتها دائماً (Note Labels)',
                    '[Show/Hide] Show/Hide All Note Titles Over Squares'
                  ),
                  Icon: Tag,
                  onClick: () =>
                    handleUpdateProject((prev) => ({
                      ...prev,
                      overlays: {
                        ...prev.overlays,
                        showAllNoteLabels: !prev.overlays?.showAllNoteLabels,
                      },
                    })),
                },
                {
                  id: 'drawings',
                  active: Boolean(
                    project.overlays?.showDrawings !== false &&
                      (project.drawings?.length || 0) > 0
                  ),
                  title: t(
                    project.overlays?.showDrawings !== false
                      ? `[إظهار/إخفاء] إخفاء طبقة الأشكال والرسم الحر (${project.drawings?.length || 0} شكل)`
                      : '[إظهار/إخفاء] إظهار طبقة الأشكال والرسم الحر فوق البلاطات (Freehand Layer)',
                    '[Show/Hide] Show/Hide Freehand Drawings & Shapes Layer'
                  ),
                  Icon: Polygon,
                  onClick: handleToggleShowDrawings,
                },
                {
                  id: 'led_cabinets',
                  active: Boolean(project.cabinetConfig?.enabled),
                  title: t(
                    project.cabinetConfig?.enabled
                      ? '[إظهار/إخفاء] إخفاء شبكة كابينات وموديولات الـ LED (الكابينات ظاهرة ✓)'
                      : '[إظهار/إخفاء] إظهار شبكة كابينات وموديولات الـ LED وترقيمها (LED Cabinets)',
                    '[Show/Hide] Show/Hide LED Cabinets & Modules Grid'
                  ),
                  Icon: Cube,
                  onClick: () =>
                    handleUpdateProject((prev) => ({
                      ...prev,
                      cabinetConfig: {
                        ...DEFAULT_CABINET_CONFIG,
                        ...(prev.cabinetConfig || {}),
                        enabled: !prev.cabinetConfig?.enabled,
                      },
                    })),
                },
                {
                  id: 'processor_zones',
                  active: Boolean(
                    project.overlays?.showProcessorZones !== false &&
                      (project.processorZones?.length || 0) > 0
                  ),
                  title: t(
                    project.overlays?.showProcessorZones !== false &&
                      (project.processorZones?.length || 0) > 0
                      ? '[إظهار/إخفاء] إخفاء مناطق ومخارج المعالجات (المناطق ظاهرة ✓)'
                      : '[إظهار/إخفاء] إظهار مناطق ومخارج المعالجات وسعة المنافذ (Processor Zones)',
                    '[Show/Hide] Show/Hide Processor Zones & Port Mapping'
                  ),
                  Icon: Cpu,
                  onClick: () => {
                    const zones = project.processorZones || [];
                    const currentlyShown =
                      project.overlays?.showProcessorZones !== false && zones.length > 0;
                    if (zones.length === 0) {
                      const hw = Math.round(project.compWidth / 2);
                      const now = Date.now();
                      handleUpdateProject((prev) => ({
                        ...prev,
                        overlays: { ...prev.overlays, showProcessorZones: true },
                        processorZones: [
                          {
                            id: `z-${now}-1`,
                            portLabel: 'PORT 1',
                            name: t('نصف أيسر (Left)', 'Left Half'),
                            x: 0,
                            y: 0,
                            width: hw,
                            height: project.compHeight,
                            color: PROCESSOR_ZONE_COLORS[0],
                            visible: true,
                          },
                          {
                            id: `z-${now}-2`,
                            portLabel: 'PORT 2',
                            name: t('نصف أيمن (Right)', 'Right Half'),
                            x: hw,
                            y: 0,
                            width: project.compWidth - hw,
                            height: project.compHeight,
                            color: PROCESSOR_ZONE_COLORS[1],
                            visible: true,
                          },
                        ],
                      }));
                    } else {
                      handleUpdateProject((prev) => ({
                        ...prev,
                        overlays: {
                          ...prev.overlays,
                          showProcessorZones: !currentlyShown,
                        },
                      }));
                    }
                  },
                },
                {
                  id: 'safe_margins',
                  active: Boolean(project.overlays?.safeMargins),
                  title: t(
                    project.overlays?.safeMargins
                      ? '[إظهار/إخفاء] إخفاء مناطق الأمان للبث 90%/80% (ظاهرة ✓)'
                      : '[إظهار/إخفاء] إظهار مناطق الأمان للبث والكاميرا 90%/80% (Safe Margins)',
                    '[Show/Hide] Show/Hide Broadcast Safe Margins (90% / 80%)'
                  ),
                  Icon: BoundingBox,
                  onClick: () =>
                    handleUpdateProject((prev) => ({
                      ...prev,
                      overlays: {
                        ...prev.overlays,
                        safeMargins: !prev.overlays?.safeMargins,
                      },
                    })),
                },
                {
                  id: 'screen_slate',
                  active: Boolean(project.overlays?.showScreenSlate),
                  title: t(
                    project.overlays?.showScreenSlate
                      ? '[إظهار/إخفاء] إخفاء بطاقة اسم الشاشة والدقة (البطاقة ظاهرة ✓)'
                      : '[إظهار/إخفاء] إظهار بطاقة اسم الشاشة والدقة وسط اللوحة (Screen Slate)',
                    '[Show/Hide] Show/Hide Screen ID Slate Overlay'
                  ),
                  Icon: IdentificationBadge,
                  onClick: () =>
                    handleUpdateProject((prev) => ({
                      ...prev,
                      overlays: {
                        ...prev.overlays,
                        showScreenSlate: !prev.overlays?.showScreenSlate,
                      },
                    })),
                },
                {
                  id: 'live_clock',
                  active: Boolean(project.overlays?.showClock),
                  title: t(
                    project.overlays?.showClock
                      ? '[إظهار/إخفاء] إخفاء الساعة الرقمية الحية (الساعة ظاهرة ✓)'
                      : '[إظهار/إخفاء] إظهار الساعة الرقمية الحية على الشاشة (Live Clock)',
                    '[Show/Hide] Show/Hide Live Studio Clock Overlay'
                  ),
                  Icon: Clock,
                  onClick: () =>
                    handleUpdateProject((prev) => ({
                      ...prev,
                      overlays: {
                        ...prev.overlays,
                        showClock: !prev.overlays?.showClock,
                      },
                    })),
                },
              ].map(({ id, active, title, Icon, onClick }) => (
                <button
                  key={id}
                  type="button"
                  onClick={onClick}
                  title={title}
                  className={`relative w-7 h-7 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB] ring-1 ring-[#8CC63F]'
                      : 'bg-[#1D2817] hover:bg-[#2A3B21] text-[#8CC63F]/80 hover:text-[#BEF264] border-[#384F2A]'
                  }`}
                >
                  <Icon weight={active ? 'fill' : 'bold'} className="w-4 h-4" />
                  {active && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-[#0E1706] rounded-none" />
                  )}
                </button>
              ))}
            </div>

            {/* Group 5: Multi-Screen Stage, Pure Mode & Fullscreen Views — VIOLET THEME (#A855F7) */}
            <div className="flex items-center gap-1 p-0.5 bg-[#21152B] border border-[#492C61] border-t-2 border-t-[#A855F7]">
              <button
                type="button"
                onClick={() => setIsPanoramicWallView((v) => !v)}
                title={t(
                  '[أوضاع العرض والمسرح] جمع كل الشاشات أمام بعضها والتحكم في مواقعها معاً (Multi-Screen Stage)',
                  '[Stage & Views] Combine All Screens & Control Positions (Multi-Screen Stage)'
                )}
                className={`w-7 h-7 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                  isPanoramicWallView
                    ? 'bg-[#A855F7] text-[#FFFFFF] border-[#F3E8FF] ring-1 ring-[#C084FC]'
                    : 'bg-[#2D1D3E] hover:bg-[#3E2754] text-[#D8B4FE] hover:text-[#F3E8FF] border-[#58387A]'
                }`}
              >
                <Wall weight={isPanoramicWallView ? 'fill' : 'bold'} className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPanoramicWallView(true);
                  setIsPureWallMode(true);
                }}
                title={t(
                  '[أوضاع العرض والمسرح] الوضع النقي: إظهار الشاشات في مواقعها دون أيقونات أو أطراف تعديل أو مشتتات (Esc للخروج)',
                  '[Stage & Views] Pure Mode: Show screens in their positions without icons, borders, or distractions (Esc to exit)'
                )}
                className="w-7 h-7 flex items-center justify-center rounded-none bg-[#2D1D3E] hover:bg-[#3E2754] border border-[#58387A] text-[#D8B4FE] hover:text-[#F3E8FF] cursor-pointer transition-colors"
              >
                <Eye weight="bold" className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsInAppLiveOutput(true)}
                className="w-7 h-7 flex items-center justify-center rounded-none bg-[#2D1D3E] hover:bg-[#3E2754] border border-[#58387A] text-[#D8B4FE] hover:text-[#F3E8FF] cursor-pointer transition-colors"
                title={t('[أوضاع العرض والمسرح] ملء الشاشة للشاشة الحالية (Esc للخروج)', '[Stage & Views] Single Screen Fullscreen (Esc to exit)')}
              >
                <ArrowsOutSimple weight="bold" className="w-4 h-4" />
              </button>
            </div>

            {/* Group 6: Live Output & Screen Identification — BROADCAST CRIMSON THEME (#F43F5E) */}
            <div className="flex items-center gap-1 p-0.5 bg-[#29141C] border border-[#5E283A] border-t-2 border-t-[#F43F5E]">
              <button
                type="button"
                onClick={() => handleIdentifyScreen(project.id)}
                title={t(
                  '[البث المباشر والتعريف] إرسال ومضة تعريفية مؤقتة لشاشة العرض المباشر (Flash)',
                  '[Live Output] Flash identification banner on Live Output monitor (Timed)'
                )}
                className="w-7 h-7 flex items-center justify-center rounded-none bg-[#3B1B25] hover:bg-[#522433] border border-[#733244] text-[#FDA4AF] hover:text-[#FFE4E6] cursor-pointer transition-colors"
              >
                <Lightning weight="fill" className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleTogglePinIdentifyScreen(project.id)}
                title={t(
                  project.overlays?.pinnedIdentify
                    ? '[البث المباشر والتعريف] إلغاء تثبيت الومضة التعريفية (Hold Flash ✓)'
                    : '[البث المباشر والتعريف] تثبيت الومضة التعريفية بالنقر بدون مؤقت (Hold Flash)',
                  project.overlays?.pinnedIdentify
                    ? '[Live Output] Unpin identification banner (Hold Flash ✓)'
                    : '[Live Output] Toggle identification banner ON/OFF by click (No timer)'
                )}
                className={`w-7 h-7 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                  project.overlays?.pinnedIdentify
                    ? 'bg-[#F43F5E] text-[#FFFFFF] border-[#FFE4E6] ring-1 ring-[#FB7185]'
                    : 'bg-[#3B1B25] hover:bg-[#522433] text-[#FDA4AF] hover:text-[#FFE4E6] border-[#733244]'
                }`}
              >
                <PushPin
                  weight={project.overlays?.pinnedIdentify ? 'fill' : 'bold'}
                  className="w-4 h-4"
                />
              </button>

              <a
                href={`#live-output?screen=${encodeURIComponent(project.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  pushSyncToServer(screens, activeScreenId, project, true);
                  if (isTauriRuntime()) {
                    e.preventDefault();
                    void openTauriLiveOutputWindow(project);
                  }
                }}
                title={t(`[البث المباشر والتعريف] فتح شاشة العرض المباشر: ${project.name}`, `[Live Output] Open Live Display: ${project.name}`)}
                className="w-7 h-7 flex items-center justify-center text-[#FFFFFF] bg-[#E11D48] hover:bg-[#F43F5E] border border-[#FDA4AF] rounded-none shrink-0 transition-colors"
              >
                <ArrowSquareOut weight="bold" className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Toast Notification */}
          {toastMessage && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-none bg-[#2A2E37] border border-[#C8CDD8] text-xs font-bold text-[#DCE0E8] shadow-xl">
              {toastMessage}
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <SavedProjectsModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        workspaceName={workspaceName}
        onWorkspaceNameChange={setWorkspaceName}
        currentScreens={screens}
        savedWorkspaces={savedWorkspaces}
        lang={lang}
        onSaveWorkspace={handleSaveWorkspace}
        onOverwriteWorkspace={handleOverwriteWorkspace}
        onLoadWorkspace={handleLoadWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onExportWorkspaceJson={handleExportWorkspaceJson}
        onExportCurrentScreenJson={handleExportCurrentScreenJson}
        onImportJsonClick={() => void handleTriggerImportDialog()}
        onImportJsonText={handleImportJsonText}
        onLoadSingleTemplate={(proj) => {
          setProject((prev) => ({
            ...DEFAULT_STUDIO_PROJECT,
            ...proj,
            id: prev.id,
            selectionColor: proj.selectionColor || '#FEF08A',
            notes: Array.isArray(proj.notes) ? proj.notes : [],
            centerConfig: {
              ...DEFAULT_CENTER_CONFIG,
              ...(proj.centerConfig || {}),
            },
            rulers: Array.isArray(proj.rulers) ? proj.rulers : [],
            focusedNoteId: null,
          }));
          showToast(t('تم تطبيق القالب على الشاشة الحالية', 'Template Applied to Active Screen'));
        }}
      />

      {/* SGD / Project Import Organization Decision Modal */}
      <SgdImportDecisionModal
        pendingImport={pendingImport}
        currentWorkspaceName={workspaceName}
        currentScreensCount={screens.length}
        lang={lang}
        onCancel={() => setPendingImport(null)}
        onDecision={handleExecuteImportDecision}
      />

      {/* Full Color & Display Calibration Report Modal */}
      <ColorReportModal
        isOpen={isColorReportModalOpen}
        onClose={() => setIsColorReportModalOpen(false)}
        project={project}
        computed={computed}
        colorMetrics={colorMetrics}
        canvasRef={canvasRef}
        lang={lang}
        onUpdateColorConfig={handleUpdateColorConfig}
      />

      {/* Pro Color Picker Modal for Context Menu Square Note Color */}
      {contextMenu && (
        <ColorPickerModal
          isOpen={isContextColorPickerOpen}
          onClose={() => setIsContextColorPickerOpen(false)}
          initialColor={contextMenu.effectiveColor}
          onApply={(newHex) => handleContextMenuColorChange(newHex)}
          title={t(
            `تخصيص لون ملاحظة المربع (${contextMenu.displayId})`,
            `Custom Note Color (${contextMenu.displayId})`
          )}
          lang={lang}
          canvasRef={canvasRef}
          lockedColorsMap={(() => {
            const map = new Map<string, string>();
            colorToNoteMap.forEach((noteItem, hexKey) => {
              if (noteItem.id !== contextMenu.existingNoteId) {
                map.set(hexKey, noteItem.text);
              }
            });
            return map;
          })()}
        />
      )}

      {/* Engineering Technical Patch & Spec Sheet Modal */}
      <TechnicalPatchSheetModal
        isOpen={isPatchSheetModalOpen}
        onClose={() => setIsPatchSheetModalOpen(false)}
        screens={screens}
        activeScreen={project}
        lang={lang}
      />

      {/* Live Director Shortcuts HUD Modal */}
      <ShortcutsHudModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
        lang={lang}
        onTriggerFlash={() => handleIdentifyScreen(project.id)}
        onTogglePureMode={() => {
          setIsPanoramicWallView(true);
          setIsPureWallMode((v) => !v);
        }}
        onToggleMultiStage={() => setIsPanoramicWallView((v) => !v)}
        onToggleMinimap={() => setIsMinimapOpen((v) => !v)}
        onToggleLaser={() =>
          setToolMode((prev) => (prev === 'laser' ? 'select' : 'laser'))
        }
        onOpenPatchSheet={() => setIsPatchSheetModalOpen(true)}
        onExport1to1Png={() => exportScreenNativePixelMapPng(project)}
      />

      {/* Application Guide & Developer Contact Modal (Opened by clicking the SGD Logo) */}
      <HelpAndAboutModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        lang={lang}
      />

      {/* Resolume Arena Integration Bridge Modal */}
      <ResolumeArenaModal
        isOpen={isArenaModalOpen}
        onClose={() => setIsArenaModalOpen(false)}
        screens={screens}
        activeScreen={project}
        workspaceName={workspaceName}
        lang={lang}
        isLiveConnected={activeScreenIsLive}
        isPipActive={isPipActive}
        onSyncBeforeOpenOutput={() => {
          pushSyncToServer(screens, activeScreenId, project, true);
        }}
        onTogglePipStream={async () => {
          try {
            if (
              document.pictureInPictureElement ||
              isPipActive ||
              pipStreamRef.current
            ) {
              await stopPipBroadcast(true);
              return;
            }
            const pipCanvas = pipCanvasRef.current;
            const video = pipVideoRef.current;
            if (!pipCanvas || !video || typeof pipCanvas.captureStream !== 'function') {
              showToast(
                t(
                  'المتصفح الحالي لا يدعم نافذة الفيديو العائمة PiP — استخدم زر فتح النافذة المستقلة',
                  'Browser does not support PiP — use Open Separate Window instead'
                )
              );
              return;
            }
            await stopPipBroadcast(false);
            paintPipCanvas(undefined, true);
            const stream = pipCanvas.captureStream(30);
            pipStreamRef.current = stream;
            video.srcObject = stream;
            video.onleavepictureinpicture = () => {
              void stopPipBroadcast(false);
            };
            await video.play();
            await video.requestPictureInPicture();
            setIsPipActive(true);
            setIsArenaModalOpen(false);
            showToast(
              t(
                'تم تشغيل نافذة البث العائمة المتزامنة (PiP) — يمكنك الآن التحكم في الشاشة ومشاهدتها حياً!',
                'Launched floating synchronous PiP window — control your screen live!'
              )
            );
          } catch {
            await stopPipBroadcast(true);
            showToast(
              t(
                'تعذر فتح نافذة PiP داخل المعاينة — اضغط على (فتح شاشة البث في نافذة مستقلة)',
                'Could not open PiP here — click Open Live Output in Separate Window'
              )
            );
          }
        }}
        onImportArenaScreens={handleImportArenaScreens}
        onMatchActiveScreenResolution={(w, h) => {
          handleUpdateProject((prev) => ({
            ...prev,
            compWidth: Math.max(64, Math.min(16384, Math.round(w))),
            compHeight: Math.max(64, Math.min(16384, Math.round(h))),
          }));
          showToast(
            t(
              `تمت مطابقة أبعاد الشاشة النشطة مع Arena Composition (${w}×${h}px)`,
              `Matched active screen resolution to Arena Composition (${w}×${h}px)`
            )
          );
        }}
        onUpdateActiveNdiConfig={(patch) => {
          handleUpdateProject((prev) => ({
            ...prev,
            ndiConfig: {
              ...DEFAULT_NDI_CONFIG,
              ...(prev.ndiConfig || {}),
              ...patch,
            },
          }));
          showToast(
            t(
              `تم ضبط وضع البث المتزامن (${patch.onlySelectedAndGuidesInAlpha ? 'شفافية التحديد والليزر' : 'شبكة كاملة'}) لبرنامج Resolume Arena`,
              `Updated live sync output mode for Resolume Arena`
            )
          );
        }}
      />
    </div>
      )}
    </>
  );
}

export default App;
