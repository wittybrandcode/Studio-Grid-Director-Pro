import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  CenterOverlayConfig,
  ColorCalibrationConfig,
  ComputedCell,
  DEFAULT_CABINET_CONFIG,
  DEFAULT_CENTER_CONFIG,
  DEFAULT_COLOR_CALIBRATION,
  DEFAULT_STUDIO_PROJECT,
  FreehandDrawingItem,
  FreehandDrawMode,
  LaserModeType,
  LaserPointerState,
  LaserTrailPoint,
  NoteScope,
  PRESET_PROJECT_TEMPLATES,
  PROCESSOR_ZONE_COLORS,
  RESOLUTION_PRESETS,
  RULER_COLOR_PALETTE,
  RulerOrientation,
  SavedWorkspaceProject,
  SELECTION_COLOR_SWATCHES,
  StudioNoteItem,
  StudioProject,
  StudioRuler,
  SyncPayload,
  TestPatternType,
  UILanguage,
} from './types/studio';
import {
  analyzeCanvasColorMetrics,
  CanvasColorAnalysisResult,
  computeGrid,
  computePhysicalWallMetrics,
  computeQuickFlashYellowIntensity,
  exportScreenNativePixelMapPng,
  findGridIndexFromEdges,
  isPointInPolygon,
  pruneStudioCaches,
  renderStudioCanvas,
  sampleCanvasPixelFast,
} from './utils/gridEngine';
import {
  buildSingleScreenSgdArchive,
  buildWorkspaceSgdArchive,
  ParsedSgdImportResult,
  parseRawJsonString,
  readSgdOrJsonFile,
  triggerSgdDownload,
} from './utils/sgdArchive';
import {
  SavedProjectsModal,
  SgdImportDecisionModal,
  SgdImportDecisionMode,
} from './components/StudioModals';
import { ColorReportModal } from './components/ColorReportModal';
import { ColorPickerModal } from './components/ColorPickerModal';
import { TechnicalPatchSheetModal, ShortcutsHudModal } from './components/EngineeringModals';
import { LiveOutputView } from './components/LiveOutputView';
import { MultiScreenWallStage } from './components/MultiScreenWallStage';
import { ScreensManagerSection } from './components/sidebar/ScreensManagerSection';
import { GridAndNotesSection } from './components/sidebar/GridAndNotesSection';
import { CenterConfigSection } from './components/sidebar/CenterConfigSection';
import { RulersManagerSection } from './components/sidebar/RulersManagerSection';
import { ColorCalibrationSection } from './components/sidebar/ColorCalibrationSection';

const WORKSPACE_NAME_KEY = 'studio_grid_director_workspace_name_v4';
const WORKSPACES_LIBRARY_KEY = 'studio_grid_director_workspaces_v4';
const SCREENS_STORAGE_KEY = 'studio_grid_director_screens_v4';
const ACTIVE_SCREEN_ID_KEY = 'studio_grid_director_active_screen_id_v4';
const ACTIVE_STORAGE_KEY = 'studio_grid_director_active_project_v3';
const LIBRARY_STORAGE_KEY = 'studio_grid_director_library_v3';
const SIDEBAR_WIDTH_STORAGE_KEY = 'studio_grid_director_sidebar_width_v1';
const SIDEBAR_TAB_STORAGE_KEY = 'studio_grid_director_sidebar_tab_v1';
const CHANNEL_NAME = 'studio_calibration_channel';

type CanvasInteractionMode = 'select' | 'box' | 'draw' | 'pan' | 'laser';
type SidebarTabId = 'screens' | 'notes' | 'guides' | 'colors' | 'all';

const SIDEBAR_MIN_WIDTH = 290;
const SIDEBAR_MAX_WIDTH = 680;
const SIDEBAR_DEFAULT_WIDTH = 360;

const ZOOM_MIN = 0.08;
const ZOOM_MAX = 6.0;
const MAX_HISTORY_STEPS = 40;

interface ScreenHistoryStack {
  past: StudioProject[];
  future: StudioProject[];
}

interface ContextMenuState {
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

function normalizeScreen(raw: Partial<StudioProject>, fallbackIndex = 1): StudioProject {
  return {
    ...DEFAULT_STUDIO_PROJECT,
    ...raw,
    id: raw.id || `screen-${Date.now()}-${fallbackIndex}`,
    name: raw.name || `الشاشة ${fallbackIndex}`,
    selectionColor: raw.selectionColor || '#FEF08A',
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    focusedNoteId: raw.focusedNoteId ?? null,
    overrides: raw.overrides || {},
    overlays: {
      ...DEFAULT_STUDIO_PROJECT.overlays,
      ...(raw.overlays || {}),
    },
    centerConfig: {
      ...DEFAULT_CENTER_CONFIG,
      ...(raw.centerConfig || {}),
    },
    colorCalibration: {
      ...DEFAULT_COLOR_CALIBRATION,
      ...(raw.colorCalibration || {}),
    },
    cabinetConfig: {
      ...DEFAULT_CABINET_CONFIG,
      ...(raw.cabinetConfig || {}),
    },
    processorZones: Array.isArray(raw.processorZones) ? raw.processorZones : [],
    rulers: Array.isArray(raw.rulers) ? raw.rulers : [],
    drawings: Array.isArray(raw.drawings) ? raw.drawings : [],
  };
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

  // Multi-Screen State
  const [screens, setScreens] = useState<StudioProject[]>(() => {
    try {
      const savedScreens = localStorage.getItem(SCREENS_STORAGE_KEY);
      if (savedScreens) {
        const parsed = JSON.parse(savedScreens);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s, idx) => normalizeScreen(s, idx + 1));
        }
      }
      const legacy = localStorage.getItem(ACTIVE_STORAGE_KEY);
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (parsedLegacy && parsedLegacy.compWidth) {
          const first = normalizeScreen(
            {
              ...parsedLegacy,
              id: 'screen-1',
              name: parsedLegacy.name || 'الشاشة 1 — الرئيسية',
            },
            1
          );
          const second = normalizeScreen(PRESET_PROJECT_TEMPLATES[1], 2);
          return [first, second];
        }
      }
    } catch {
      // ignore
    }
    return PRESET_PROJECT_TEMPLATES.map((t, idx) => normalizeScreen(t, idx + 1));
  });

  const [activeScreenId, setActiveScreenId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(ACTIVE_SCREEN_ID_KEY);
      if (savedId) return savedId;
    } catch {
      // ignore
    }
    return 'screen-1';
  });

  // Per-Screen Undo/Redo History Stacks
  const [historyByScreen, setHistoryByScreen] = useState<Record<string, ScreenHistoryStack>>({});
  const isContinuousGestureRef = useRef<boolean>(false);

  // Track connected Live Output Windows per screenId (from SSE server + BroadcastChannel)
  const [serverConnectedCounts, setServerConnectedCounts] = useState<Record<string, number>>({});
  const [liveOutputHeartbeats, setLiveOutputHeartbeats] = useState<Record<string, number>>({});

  // Quick Create Screen Modal/Inline Form State
  const [isNewScreenModalOpen, setIsNewScreenModalOpen] = useState<boolean>(false);
  const [newScreenName, setNewScreenName] = useState<string>('');
  const [newScreenPresetId, setNewScreenPresetId] = useState<string>('fhd');

  // Dragging a ruler directly on the canvas & Smart Snapping
  const [draggingRulerId, setDraggingRulerId] = useState<string | null>(null);
  const [snapRulersEnabled, setSnapRulersEnabled] = useState<boolean>(true);

  // Local editor visual feedback when flashing/blinking Live Output
  const [editorBlinkingKeys, setEditorBlinkingKeys] = useState<Set<string>>(new Set());
  const [editorBlinkPhaseOn, setEditorBlinkPhaseOn] = useState<boolean>(false);
  const [editorIdentifyFlash, setEditorIdentifyFlash] = useState<boolean>(false);
  const [flashingScreenId, setFlashingScreenId] = useState<string | null>(null);
  const editorIdentifyFlashIntensityRef = useRef<number>(0);
  const blinkTimeoutRef = useRef<number | null>(null);
  const identifyTimeoutRef = useRef<number | null>(null);
  const identifyFlashStartRef = useRef<number>(0);

  // Active Screen derived from screens + activeScreenId
  const project = useMemo(() => {
    return screens.find((s) => s.id === activeScreenId) || screens[0] || DEFAULT_STUDIO_PROJECT;
  }, [screens, activeScreenId]);

  const centerConfig: CenterOverlayConfig = useMemo(
    () => ({
      ...DEFAULT_CENTER_CONFIG,
      ...(project.centerConfig || {}),
    }),
    [project.centerConfig]
  );

  const colorConfig: ColorCalibrationConfig = useMemo(
    () => ({
      ...DEFAULT_COLOR_CALIBRATION,
      ...(project.colorCalibration || {}),
    }),
    [project.colorCalibration]
  );

  const rulers: StudioRuler[] = useMemo(() => project.rulers || [], [project.rulers]);

  // Fine-grained memoization for computeGrid so ruler drags, color sliders, crosshair offsets, and freehand drawings never recompute cells
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

  const [workspaceName, setWorkspaceName] = useState<string>(() => {
    try {
      return localStorage.getItem(WORKSPACE_NAME_KEY) || 'مشروع الاستوديو الرئيسي';
    } catch {
      return 'مشروع الاستوديو الرئيسي';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACE_NAME_KEY, workspaceName);
    } catch {
      // ignore
    }
  }, [workspaceName]);

  const [savedWorkspaces, setSavedWorkspaces] = useState<SavedWorkspaceProject[]>(() => {
    try {
      const raw = localStorage.getItem(WORKSPACES_LIBRARY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
      const legacyRaw = localStorage.getItem(LIBRARY_STORAGE_KEY);
      if (legacyRaw) {
        const legacyList = JSON.parse(legacyRaw) as StudioProject[];
        if (Array.isArray(legacyList) && legacyList.length > 0) {
          return legacyList.map((p, i) => ({
            id: p.id || `ws-migrated-${i}`,
            name: p.name || `مشروع محفوظ ${i + 1}`,
            updatedAt: p.updatedAt || new Date().toISOString(),
            activeScreenId: p.id || 'screen-1',
            screens: [normalizeScreen(p, 1)],
          }));
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  // Load saved workspaces from server on mount if local is empty
  useEffect(() => {
    fetch('/api/projects', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.projects) && data.projects.length > 0) {
          setSavedWorkspaces((prev) => (prev.length === 0 ? data.projects : prev));
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const [lang, setLang] = useState<UILanguage>('ar');
  const [toolMode, setToolMode] = useState<CanvasInteractionMode>('select');
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Right-click Context Menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isContextColorPickerOpen, setIsContextColorPickerOpen] = useState<boolean>(false);

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

  // Freeze Live Output state (allows director to make local changes before pushing to live screens)
  const [isLiveFrozen, setIsLiveFrozen] = useState<boolean>(false);

  // Global Expand / Collapse signal for sidebar accordion sections
  const [expandSignal, setExpandSignal] = useState<{ open: boolean; seq: number }>({
    open: true,
    seq: 0,
  });

  // Sidebar Functional Tab & Resizable Width State
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

  // Live Studio Clock 1-second tick for editor preview & custom image load trigger
  const [clockTick, setClockTick] = useState<number>(0);
  const [customImageLoadedSeq, setCustomImageLoadedSeq] = useState<number>(0);

  // Live Laser state, color, mode & trail/stroke refs
  const [laser, setLaser] = useState<LaserPointerState | null>(null);
  const [laserColor, setLaserColor] = useState<string>('#FF2424');
  const [laserMode, setLaserMode] = useState<LaserModeType>('free');
  const laserTrailRef = useRef<LaserTrailPoint[]>([]);
  const laserDrawnStrokeRef = useRef<LaserTrailPoint[]>([]);
  const laserOriginRef = useRef<{ x: number; y: number } | null>(null);
  const laserDownRef = useRef<boolean>(false);

  // Freehand Pen & Organic Shape Layer state & 60fps zero-lag draft ref
  const [drawMode, setDrawMode] = useState<FreehandDrawMode>('polygon');
  const [drawColor, setDrawColor] = useState<string>('#38BDF8');
  const [drawStrokeWidth, setDrawStrokeWidth] = useState<number>(4);
  const draftDrawingRef = useRef<(FreehandDrawingItem & { isLassoTiles?: boolean }) | null>(null);

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

  // Large-Screen Navigation, Multi-Screen Wall Stage & Pure Distraction-Free Mode State
  const [isPanoramicWallView, setIsPanoramicWallView] = useState<boolean>(false);
  const [isPureWallMode, setIsPureWallMode] = useState<boolean>(false);
  const [isMinimapOpen, setIsMinimapOpen] = useState<boolean>(true);
  const [isDraggingMinimap, setIsDraggingMinimap] = useState<boolean>(false);
  const [isSearchPopoverOpen, setIsSearchPopoverOpen] = useState<boolean>(false);
  const [squareSearchQuery, setSquareSearchQuery] = useState<string>('');
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Update spatial positions (wallPosX, wallPosY, wallZIndex) of screens on the Multi-Screen Stage
  const handleUpdateScreensPositions = useCallback(
    (positions: Record<string, { x: number; y: number; zIndex?: number }>) => {
      setScreens((prev) =>
        prev.map((s) => {
          const pos = positions[s.id];
          if (!pos) return s;
          return {
            ...s,
            wallPosX: Math.round(pos.x),
            wallPosY: Math.round(pos.y),
            wallZIndex: typeof pos.zIndex === 'number' ? pos.zIndex : s.wallZIndex,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    []
  );

  const activePhysicalMetrics = useMemo(
    () => computePhysicalWallMetrics(project),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.compWidth, project.compHeight, project.cabinetConfig]
  );

  // Modals
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState<boolean>(false);
  const [isColorReportModalOpen, setIsColorReportModalOpen] = useState<boolean>(false);
  const [isPatchSheetModalOpen, setIsPatchSheetModalOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);
  const [pendingImport, setPendingImport] = useState<
    Extract<ParsedSgdImportResult, { ok: true }> | null
  >(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live Color Telemetry & Hovered Pixel Sample
  const [colorMetrics, setColorMetrics] = useState<CanvasColorAnalysisResult>(() =>
    analyzeCanvasColorMetrics(null)
  );
  const [hoveredPixel, setHoveredPixel] = useState<{
    x: number;
    y: number;
    r: number;
    g: number;
    b: number;
    hex: string;
    ire: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contextInputRef = useRef<HTMLInputElement | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Throttling refs for high-frequency network sync (25ms / 40fps)
  const syncTimerRef = useRef<number | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const pendingSyncRef = useRef<{
    screens: StudioProject[];
    activeScreenId: string;
    screen?: StudioProject;
  } | null>(null);

  const laserTimerRef = useRef<number | null>(null);
  const lastLaserTimeRef = useRef<number>(0);
  const paintRafRef = useRef<number | null>(null);
  const lastPixelSampleTimeRef = useRef<number>(0);
  const storageSaveTimerRef = useRef<number | null>(null);

  const t = useCallback(
    (ar: string, en: string) => (lang === 'en' ? en : ar),
    [lang]
  );

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
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
    if (liveRoute.isLiveOutput) return undefined;

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
  }, [liveRoute.isLiveOutput]);

  // BroadcastChannel setup
  useEffect(() => {
    try {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      broadcastChannelRef.current = ch;

      ch.onmessage = (event: MessageEvent<SyncPayload>) => {
        const payload = event.data;
        if (!payload) return;
        if (payload.type === 'OUTPUT_HEARTBEAT' && payload.screenId) {
          setLiveOutputHeartbeats((prev) => ({
            ...prev,
            [payload.screenId!]: Date.now(),
          }));
        }
      };

      ch.postMessage({
        type: 'PING',
        timestamp: Date.now(),
      } satisfies SyncPayload);

      return () => {
        ch.close();
        broadcastChannelRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, []);

  // Broadcast updates immediately to Live Output windows, prune stale caches, and debounce heavy localStorage JSON serialization (250ms)
  useEffect(() => {
    if (liveRoute.isLiveOutput) return;

    if (storageSaveTimerRef.current) {
      window.clearTimeout(storageSaveTimerRef.current);
    }
    storageSaveTimerRef.current = window.setTimeout(() => {
      storageSaveTimerRef.current = null;
      // Prune offscreen canvas and custom image caches for any removed screens/images
      pruneStudioCaches(
        screens.map((s) => s.id),
        screens.map((s) => s.colorCalibration?.customImageDataUrl || '').filter(Boolean)
      );

      try {
        localStorage.setItem(SCREENS_STORAGE_KEY, JSON.stringify(screens));
        localStorage.setItem(ACTIVE_SCREEN_ID_KEY, activeScreenId);
        localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(project));
      } catch {
        // QuotaExceededError fallback: strip heavy base64 image data for localStorage while keeping full state in RAM & Server
        try {
          const lightScreens = screens.map((s) =>
            s.colorCalibration?.customImageDataUrl
              ? {
                  ...s,
                  colorCalibration: {
                    ...s.colorCalibration,
                    customImageDataUrl: null,
                  },
                }
              : s
          );
          localStorage.setItem(SCREENS_STORAGE_KEY, JSON.stringify(lightScreens));
          localStorage.setItem(ACTIVE_SCREEN_ID_KEY, activeScreenId);
        } catch {
          // ignore
        }
      }
    }, 250);

    // If Live Output is frozen by the director, keep edits local until unfrozen
    if (isLiveFrozen) return;

    const syncMsg: SyncPayload = {
      type: 'PROJECT_UPDATE',
      screenId: project.id,
      project,
      timestamp: Date.now(),
    };
    broadcastChannelRef.current?.postMessage(syncMsg);
    pushSyncToServer(screens, activeScreenId, project);
  }, [screens, activeScreenId, project, liveRoute.isLiveOutput, isLiveFrozen, pushSyncToServer]);

  // Tick every 1 second when Live Studio Clock is enabled
  useEffect(() => {
    if (!project.overlays?.showClock) return undefined;
    const timer = window.setInterval(() => {
      setClockTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [project.overlays?.showClock]);

  // Keep a ref to screens so undo history recording never calls setState inside another setState updater
  const screensRef = useRef<StudioProject[]>(screens);
  screensRef.current = screens;

  // Record a snapshot into the active screen's undo stack
  const recordUndoSnapshot = useCallback((snapshot: StudioProject) => {
    setHistoryByScreen((prev) => {
      const cur = prev[snapshot.id] || { past: [], future: [] };
      const last = cur.past[cur.past.length - 1];
      if (last && last.updatedAt === snapshot.updatedAt) {
        return prev;
      }
      return {
        ...prev,
        [snapshot.id]: {
          past: [...cur.past.slice(-(MAX_HISTORY_STEPS - 1)), snapshot],
          future: [],
        },
      };
    });
  }, []);

  // Helper to update the currently selected screen (with automatic Undo history tracking)
  const setProject = useCallback(
    (
      updaterOrVal: StudioProject | ((prev: StudioProject) => StudioProject),
      options?: { skipHistory?: boolean }
    ) => {
      const currentSnapshot =
        screensRef.current.find((s) => s.id === activeScreenId) ||
        screensRef.current[0] ||
        DEFAULT_STUDIO_PROJECT;

      if (!options?.skipHistory && !isContinuousGestureRef.current) {
        recordUndoSnapshot(currentSnapshot);
      }

      setScreens((prevScreens) => {
        const current =
          prevScreens.find((s) => s.id === activeScreenId) ||
          prevScreens[0] ||
          DEFAULT_STUDIO_PROJECT;
        const nextScreen =
          typeof updaterOrVal === 'function' ? updaterOrVal(current) : updaterOrVal;

        const nextList = prevScreens.map((s) => (s.id === current.id ? nextScreen : s));
        screensRef.current = nextList;
        return nextList;
      });
    },
    [activeScreenId, recordUndoSnapshot]
  );

  const handleUpdateProject = useCallback(
    (updater: (prev: StudioProject) => StudioProject, options?: { skipHistory?: boolean }) => {
      setProject(
        (prev) => ({
          ...updater(prev),
          updatedAt: new Date().toISOString(),
        }),
        options
      );
    },
    [setProject]
  );

  // Undo & Redo handlers for the active screen
  const activeHistory = historyByScreen[project.id] || { past: [], future: [] };
  const canUndo = activeHistory.past.length > 0;
  const canRedo = activeHistory.future.length > 0;

  const handleUndo = useCallback(() => {
    const stack = historyByScreen[project.id];
    if (!stack || stack.past.length === 0) return;
    const previousState = stack.past[stack.past.length - 1];
    const remainingPast = stack.past.slice(0, -1);

    setHistoryByScreen((prev) => ({
      ...prev,
      [project.id]: {
        past: remainingPast,
        future: [project, ...stack.future].slice(0, MAX_HISTORY_STEPS),
      },
    }));

    setScreens((prevScreens) =>
      prevScreens.map((s) => (s.id === project.id ? previousState : s))
    );
    showToast(t('تم التراجع (Undo)', 'Undone'));
  }, [historyByScreen, project, showToast, t]);

  const handleRedo = useCallback(() => {
    const stack = historyByScreen[project.id];
    if (!stack || stack.future.length === 0) return;
    const nextState = stack.future[0];
    const remainingFuture = stack.future.slice(1);

    setHistoryByScreen((prev) => ({
      ...prev,
      [project.id]: {
        past: [...stack.past, project].slice(-MAX_HISTORY_STEPS),
        future: remainingFuture,
      },
    }));

    setScreens((prevScreens) =>
      prevScreens.map((s) => (s.id === project.id ? nextState : s))
    );
    showToast(t('تمت الإعادة (Redo)', 'Redone'));
  }, [historyByScreen, project, showToast, t]);

  // Update Center Crosshair & Circle Config (supports both partial object and updater function)
  const handleUpdateCenterConfig = useCallback(
    (
      patchOrUpdater:
        | Partial<CenterOverlayConfig>
        | ((prev: CenterOverlayConfig) => CenterOverlayConfig)
    ) => {
      handleUpdateProject((prev) => {
        const currentCenter: CenterOverlayConfig = {
          ...DEFAULT_CENTER_CONFIG,
          ...(prev.centerConfig || {}),
        };
        const nextCenter: CenterOverlayConfig =
          typeof patchOrUpdater === 'function'
            ? patchOrUpdater(currentCenter)
            : { ...currentCenter, ...patchOrUpdater };

        return {
          ...prev,
          overlays: {
            ...prev.overlays,
            centerCrosshair: true,
          },
          centerConfig: nextCenter,
        };
      });
    },
    [handleUpdateProject]
  );

  // Update Color Calibration & Test Image Config (supports both partial object and updater function)
  const handleUpdateColorConfig = useCallback(
    (
      patchOrUpdater:
        | Partial<ColorCalibrationConfig>
        | ((prev: ColorCalibrationConfig) => ColorCalibrationConfig)
    ) => {
      handleUpdateProject((prev) => {
        const currentColor: ColorCalibrationConfig = {
          ...DEFAULT_COLOR_CALIBRATION,
          ...(prev.colorCalibration || {}),
        };
        const nextColor: ColorCalibrationConfig =
          typeof patchOrUpdater === 'function'
            ? patchOrUpdater(currentColor)
            : { ...currentColor, ...patchOrUpdater };

        return {
          ...prev,
          colorCalibration: nextColor,
        };
      });
    },
    [handleUpdateProject]
  );

  // Add a Horizontal or Vertical Ruler
  const handleAddRuler = (orientation: RulerOrientation) => {
    const existingCount = rulers.filter((r) => r.orientation === orientation).length;
    const color = RULER_COLOR_PALETTE[rulers.length % RULER_COLOR_PALETTE.length];
    const defaultPos =
      orientation === 'horizontal'
        ? Math.round(project.compHeight * (0.25 + (existingCount * 0.2) % 0.6))
        : Math.round(project.compWidth * (0.25 + (existingCount * 0.2) % 0.6));

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
  };

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
    [rulers, project.compHeight, project.compWidth, t, handleUpdateProject]
  );

  // Update a Ruler (supports both partial object and updater function)
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

  // Add 4 Rulers (Left, Right, Top, Bottom) framing the bounding box of currently selected squares
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

  // Trigger visual identification flash on a Live Output screen
  const handleIdentifyScreen = useCallback(
    (targetScreenId: string) => {
      const msg: SyncPayload = {
        type: 'IDENTIFY_SCREEN',
        screenId: targetScreenId,
        timestamp: Date.now(),
      };
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
    [activeScreenId, isLiveFrozen, pushSyncToServer, showToast, t]
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
      return;
    }
    setEditorBlinkPhaseOn(true);
    const interval = window.setInterval(() => {
      setEditorBlinkPhaseOn((p) => !p);
    }, 240);
    return () => window.clearInterval(interval);
  }, [editorBlinkingKeys]);

  // Create a new screen with chosen name & preset dimensions
  const handleCreateScreen = (openOutputImmediately = false) => {
    const nextNum = screens.length + 1;
    const newId = `screen-${Date.now()}`;
    const preset =
      RESOLUTION_PRESETS.find((p) => p.id === newScreenPresetId) || RESOLUTION_PRESETS[0];
    const finalName =
      newScreenName.trim() || t(`الشاشة ${nextNum}`, `Screen ${nextNum}`);

    const newScreen: StudioProject = {
      ...DEFAULT_STUDIO_PROJECT,
      id: newId,
      name: finalName,
      compWidth: preset.width,
      compHeight: preset.height,
      squareSizePx: preset.recommendedSquarePx,
      updatedAt: new Date().toISOString(),
      selectionColor: '#FEF08A',
      notes: [],
      focusedNoteId: null,
      centerConfig: { ...DEFAULT_CENTER_CONFIG },
      rulers: [],
      overrides: {},
    };

    const nextScreens = [...screens, newScreen];
    setScreens(nextScreens);
    setActiveScreenId(newId);
    setContextMenu(null);
    setAutoFit(true);
    setIsNewScreenModalOpen(false);
    setNewScreenName('');

    try {
      localStorage.setItem(SCREENS_STORAGE_KEY, JSON.stringify(nextScreens));
      localStorage.setItem(ACTIVE_SCREEN_ID_KEY, newId);
    } catch {
      // ignore
    }
    pushSyncToServer(nextScreens, newId, newScreen, true);

    if (openOutputImmediately) {
      const a = document.createElement('a');
      a.href = `#live-output?screen=${encodeURIComponent(newId)}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    showToast(t(`تم إنشاء "${finalName}" وربطها بنجاح`, `Created "${finalName}"`));
  };

  // Duplicate current screen
  const handleDuplicateScreen = () => {
    const newId = `screen-${Date.now()}`;
    const cloned: StudioProject = {
      ...project,
      id: newId,
      name: `${project.name} (${t('نسخة', 'Copy')})`,
      updatedAt: new Date().toISOString(),
      notes: (project.notes || []).map((n, i) => ({
        ...n,
        id: `note-${Date.now()}-${i}`,
      })),
      rulers: (project.rulers || []).map((r, i) => ({
        ...r,
        id: `ruler-${Date.now()}-${i}`,
      })),
      centerConfig: { ...centerConfig },
      overrides: { ...project.overrides },
      focusedNoteId: null,
    };
    const nextScreens = [...screens, cloned];
    setScreens(nextScreens);
    setActiveScreenId(newId);
    setContextMenu(null);
    pushSyncToServer(nextScreens, newId, cloned, true);
    showToast(t('تم نسخ الشاشة', 'Screen Duplicated'));
  };

  // Delete a screen (minimum 1 screen kept)
  const handleDeleteScreen = (targetId: string) => {
    if (screens.length <= 1) return;
    const nextScreens = screens.filter((s) => s.id !== targetId);
    const nextActive = activeScreenId === targetId ? nextScreens[0].id : activeScreenId;
    setScreens(nextScreens);
    setActiveScreenId(nextActive);
    setContextMenu(null);
    pushSyncToServer(nextScreens, nextActive, nextScreens[0], true);
    showToast(t('تم حذف الشاشة', 'Screen Deleted'));
  };

  // Reorder screens up or down
  const handleMoveScreen = useCallback(
    (targetId: string, direction: 'up' | 'down') => {
      setScreens((prev) => {
        const idx = prev.findIndex((s) => s.id === targetId);
        if (idx === -1) return prev;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= prev.length) return prev;
        const next = [...prev];
        const temp = next[idx];
        next[idx] = next[swapIdx];
        next[swapIdx] = temp;
        screensRef.current = next;
        pushSyncToServer(next, activeScreenId, project, true);
        return next;
      });
    },
    [activeScreenId, project, pushSyncToServer]
  );

  const isScreenLiveOpen = useCallback(
    (scrId: string) => {
      if ((serverConnectedCounts[scrId] || 0) > 0) return true;
      const last = liveOutputHeartbeats[scrId];
      return Boolean(last && Date.now() - last < 4500);
    },
    [serverConnectedCounts, liveOutputHeartbeats]
  );

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
  }, [project.compWidth, project.compHeight]);

  useEffect(() => {
    if (!autoFit) return;
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

      // Ensure zoom is high enough to inspect corner details cleanly
      const availW = Math.max(240, container.clientWidth - 64);
      const availH = Math.max(200, container.clientHeight - 80);
      const fitScale = Math.min(availW / project.compWidth, availH / project.compHeight);
      const targetZoom = Math.max(zoom, Math.min(ZOOM_MAX, Math.max(0.85, fitScale * 2.4)));

      const scaledW = project.compWidth * targetZoom;
      const scaledH = project.compHeight * targetZoom;

      // Compute pan offset so the chosen corner sits comfortably inside the viewport
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
    [isPanoramicWallView, project.compWidth, project.compHeight, zoom, showToast, t]
  );

  // Quick Square Search & Jump Handler (e.g. "A12", "05", "3-2")
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

      const container = viewportContainerRef.current;
      const availW = container ? Math.max(240, container.clientWidth - 64) : 800;
      const availH = container ? Math.max(200, container.clientHeight - 80) : 600;
      const idealCellScreenPx = 150;
      const minCellDim = Math.max(16, Math.min(matchedCell.width, matchedCell.height));
      const targetZoom = Math.max(
        zoom,
        Math.min(ZOOM_MAX, Math.max(0.75, idealCellScreenPx / minCellDim))
      );

      // Center of matched cell relative to canvas center
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

      // Briefly flash the found square on editor & live screen
      handleBlinkCellsOnLiveScreen([matchedCell.key]);
      showToast(
        t(
          `تم القفز إلى المربع ${matchedCell.displayId} (${matchedCell.coordId}) @ (${matchedCell.x},${matchedCell.y})`,
          `Jumped to Square ${matchedCell.displayId} (${matchedCell.coordId})`
        )
      );
      void availW;
      void availH;
    },
    [
      squareSearchQuery,
      computed.cells,
      isPanoramicWallView,
      zoom,
      project.compWidth,
      project.compHeight,
      handleBlinkCellsOnLiveScreen,
      showToast,
      t,
    ]
  );

  // Interactive Minimap Radar Panning Helper (with optional auto-zoom when clicking from full-fit view)
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
    [project.compWidth, project.compHeight, zoom, autoFit]
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
    if (!isDraggingMinimap) return;
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

  // Handle Grabbable Vertical Splitter Dragging to Resize Sidebar
  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const asideEl = sidebarRef.current;
      if (!asideEl) return;
      const rect = asideEl.getBoundingClientRect();
      // In RTL (Arabic), sidebar is on the right edge so width = rect.right - e.clientX
      // In LTR (English), sidebar is on the left edge so width = e.clientX - rect.left
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
    [zoom, pan]
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
        if (pendingImport) {
          setPendingImport(null);
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
        if (isShortcutsModalOpen) {
          setIsShortcutsModalOpen(false);
          return;
        }
        if (isPatchSheetModalOpen) {
          setIsPatchSheetModalOpen(false);
          return;
        }
        if (isColorReportModalOpen) {
          setIsColorReportModalOpen(false);
          return;
        }
        if (isLibraryModalOpen) {
          setIsLibraryModalOpen(false);
          return;
        }
        if (isNewScreenModalOpen) {
          setIsNewScreenModalOpen(false);
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

      // Undo / Redo keyboard shortcuts
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
    pendingImport,
    isContextColorPickerOpen,
    contextMenu,
    isShortcutsModalOpen,
    isPatchSheetModalOpen,
    isColorReportModalOpen,
    isLibraryModalOpen,
    isNewScreenModalOpen,
    isPureWallMode,
    isInAppLiveOutput,
    isSearchPopoverOpen,
    setProject,
    handleUndo,
    handleRedo,
  ]);

  // Draw main editor canvas + minimap radar canvas directly (can be invoked by React render or 60fps RAF without React setState)
  const paintEditorAndMinimapCanvases = useCallback(
    (flashIntensityOverride?: number) => {
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

  // Send laser pointer updates to server + BroadcastChannel for the active screen (throttled to 40fps with trailing flush)
  const emitLaserMove = useCallback(
    (nextLaser: LaserPointerState, immediate = false) => {
      broadcastChannelRef.current?.postMessage({
        type: 'LASER_MOVE',
        screenId: project.id,
        laser: nextLaser,
        timestamp: Date.now(),
      } satisfies SyncPayload);

      const sendToServer = (stateToSend: LaserPointerState) => {
        lastLaserTimeRef.current = Date.now();
        fetch('/api/screens/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'LASER_MOVE',
            screenId: project.id,
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
    [project.id]
  );

  // Automatic optical trail decay so the laser tail smoothly shrinks into the laser spot when the cursor stops moving
  useEffect(() => {
    if (toolMode !== 'laser' || !laser?.active) return;
    if (!laser.trail || laser.trail.length <= 1) return;

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

      setLaser((prev) => {
        if (!prev || !prev.active) return prev;
        const updated: LaserPointerState = {
          ...prev,
          trail: nextTrail,
        };
        emitLaserMove(updated);
        return updated;
      });
    }, 40);

    return () => window.clearInterval(timer);
  }, [toolMode, laser?.active, laser?.trail?.length, emitLaserMove]);

  // Change laser color on the fly and sync immediately
  const handleChangeLaserColor = useCallback(
    (nextColor: string) => {
      setLaserColor(nextColor);
      setLaser((prev) => {
        if (!prev || !prev.active) return prev;
        const updated: LaserPointerState = {
          ...prev,
          color: nextColor,
        };
        emitLaserMove(updated, true);
        return updated;
      });
    },
    [emitLaserMove]
  );

  // Change laser mode ('free' | 'line' | 'crosshair') on the fly and sync immediately
  const handleChangeLaserMode = useCallback(
    (nextLaserMode: LaserModeType) => {
      setLaserMode(nextLaserMode);
      laserDrawnStrokeRef.current = [];
      laserOriginRef.current = null;
      setLaser((prev) => {
        if (!prev || !prev.active) return prev;
        const updated: LaserPointerState = {
          ...prev,
          laserMode: nextLaserMode,
          originX: undefined,
          originY: undefined,
          drawnStroke: [],
        };
        emitLaserMove(updated, true);
        return updated;
      });
    },
    [emitLaserMove]
  );

  // Clear drawn laser line/stroke on screen
  const handleClearLaserStroke = useCallback(() => {
    laserDrawnStrokeRef.current = [];
    laserOriginRef.current = null;
    setLaser((prev) => {
      if (!prev || !prev.active) return prev;
      const updated: LaserPointerState = {
        ...prev,
        originX: undefined,
        originY: undefined,
        drawnStroke: [],
      };
      emitLaserMove(updated, true);
      return updated;
    });
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
          // Clicking laser again toggles it off back to select mode
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
          : Math.round(project.compWidth / 2);
        const startY = startCell
          ? Math.round(startCell.y + startCell.height / 2)
          : Math.round(project.compHeight / 2);
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
          if (project.overlays.showDrawings === false) {
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
      laser?.active,
      laserColor,
      laserMode,
      hoveredKey,
      computed.cellMap,
      computed.cells,
      project.compWidth,
      project.compHeight,
      project.overlays.showDrawings,
      handleUpdateProject,
      emitLaserMove,
    ]
  );

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

  // Canvas pointer coordinates (uses exact colEdges & rowEdges so Center Remainder Alignment hits 100% accurately)
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

  // Smart snapping helper for ruler positions (snaps to screen center & exact grid cell edges)
  const computeSnappedRulerPosition = (
    rawPx: number,
    orientation: RulerOrientation,
    forceSnap: boolean
  ): number => {
    const maxDim = orientation === 'horizontal' ? project.compHeight : project.compWidth;
    const clamped = Math.max(0, Math.min(maxDim, Math.round(rawPx)));
    if (!snapRulersEnabled && !forceSnap) return clamped;

    const snapTolerance = Math.max(10, Math.round(12 / zoom));
    const centerPx = Math.round(maxDim / 2);

    // 1. Snap to exact screen center (50%)
    if (Math.abs(clamped - centerPx) <= snapTolerance) {
      return centerPx;
    }

    // 2. Snap to nearest actual grid cell edge (supports both Start and Center remainder alignments)
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
  };

  // Global window mousemove/mouseup for dragging rulers (including pulling out from Top/Side edge bars)
  useEffect(() => {
    if (!draggingRulerId) return;

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
    draggingRulerId,
    rulers,
    project.compHeight,
    project.compWidth,
    snapRulersEnabled,
    zoom,
    computed.baseCellHeight,
    computed.baseCellWidth,
    handleUpdateRuler,
  ]);

  // Left-click: Drag ruler if near an unlocked ruler, or toggle square selection
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

    // Freehand Pen & Shape Layer Mode ('polygon' | 'lasso_tiles' | 'freehand' | 'ellipse' | 'arrow')
    // Handled before ruler/cell hit-testing so the drawing layer is 100% isolated and clean
    if (toolMode === 'draw') {
      if (hoveredKey !== null) setHoveredKey(null);
      const isLasso = drawMode === 'lasso_tiles';
      const itemMode: FreehandDrawingItem['mode'] =
        drawMode === 'lasso_tiles' ? 'polygon' : drawMode;
      draftDrawingRef.current = {
        id: `draw-${Date.now()}`,
        mode: itemMode,
        points: [{ x, y }],
        color: isLasso ? (project.selectionColor || '#FACC15') : drawColor,
        strokeWidth: drawStrokeWidth,
        closed: drawMode === 'polygon' || isLasso,
        fillOpacity: drawMode === 'polygon' || drawMode === 'ellipse' ? 0.22 : 0,
        isLassoTiles: isLasso,
      };
      paintEditorAndMinimapCanvases();
      return;
    }

    // Check if clicking on an unlocked Ruler to drag it directly
    const hitRuler = findHitRuler(x, y);
    if (hitRuler) {
      recordUndoSnapshot(project);
      isContinuousGestureRef.current = true;
      setDraggingRulerId(hitRuler.id);
      return;
    }

    // Box / Marquee Selection Mode
    if (toolMode === 'box') {
      recordUndoSnapshot(project);
      isContinuousGestureRef.current = true;
      setMarqueeRect({ x1: x, y1: y, x2: x, y2: y });
      return;
    }

    if (!cell) return;

    // Record 1 undo step at the beginning of a square click/drag-paint gesture
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

    // If dragging a ruler, update its position live (with smart snapping)
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

    // If dragging a Box / Marquee selection rectangle
    if (marqueeRect) {
      setMarqueeRect((prev) => (prev ? { ...prev, x2: x, y2: y } : null));
      return;
    }

    // In Freehand Draw mode, isolate cursor from grid square hover frames so drawing stays 100% clean
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
          scheduleCanvasPaint();
        } else if (!lastPt || Math.hypot(x - lastPt.x, y - lastPt.y) >= 3) {
          draftDrawingRef.current = {
            ...currentDraft,
            points: [...pts, { x, y }],
          };
          scheduleCanvasPaint();
        }
      }
      return;
    }

    const nextHoverKey = cell?.key || null;
    if (nextHoverKey !== hoveredKey) {
      setHoveredKey(nextHoverKey);
    }

    // Sample pixel color under cursor ONLY when Color Lab tab is visible (throttled to 25fps via 1x1 offscreen sampler)
    if (activeSidebarTab === 'colors' || activeSidebarTab === 'all') {
      const nowMs = performance.now();
      if (nowMs - lastPixelSampleTimeRef.current >= 40) {
        lastPixelSampleTimeRef.current = nowMs;
        const sampled = sampleCanvasPixelFast(canvasRef.current, x, y);
        if (sampled) {
          setHoveredPixel(sampled);
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
          // Automatically select or toggle all grid tiles whose center falls inside the drawn freeform shape!
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
            paintEditorAndMinimapCanvases();
          }
        } else {
          // Commit persistent freeform vector shape to project.drawings
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
        paintEditorAndMinimapCanvases();
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
      paintEditorAndMinimapCanvases();
    }
    setHoveredKey(null);
    setHoveredPixel(null);
    if (toolMode === 'laser' && laser?.active) {
      // Keep the laser parked on its target square when moving cursor off canvas
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

  // Right-Click Context Menu on Canvas Square
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

  // Exports
  const handleExportPNG = () => {
    const offscreen = document.createElement('canvas');
    offscreen.width = project.compWidth;
    offscreen.height = project.compHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    renderStudioCanvas(ctx, project, computed, { isLiveOutput: true });

    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}_${project.compWidth}x${project.compHeight}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t('تم تحميل صورة PNG', 'PNG Downloaded'));
    }, 'image/png');
  };

  const persistSavedWorkspaces = (nextList: SavedWorkspaceProject[]) => {
    setSavedWorkspaces(nextList);
    try {
      localStorage.setItem(WORKSPACES_LIBRARY_KEY, JSON.stringify(nextList));
    } catch {
      // QuotaExceededError fallback: store lightweight metadata in localStorage while server stores full images
      try {
        const lightList = nextList.map((ws) => ({
          ...ws,
          screens: ws.screens.map((s) =>
            s.colorCalibration?.customImageDataUrl
              ? {
                  ...s,
                  colorCalibration: {
                    ...s.colorCalibration,
                    customImageDataUrl: null,
                  },
                }
              : s
          ),
        }));
        localStorage.setItem(WORKSPACES_LIBRARY_KEY, JSON.stringify(lightList));
      } catch {
        // ignore
      }
    }
    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects: nextList }),
    }).catch(() => {
      // ignore
    });
  };

  const handleSaveWorkspace = (customName?: string) => {
    const cleanName = customName?.trim() || workspaceName.trim() || 'مشروع الاستوديو الرئيسي';
    setWorkspaceName(cleanName);
    const snapshot: SavedWorkspaceProject = {
      id: `ws-${Date.now()}`,
      name: cleanName,
      updatedAt: new Date().toISOString(),
      activeScreenId,
      screens: screens.map((s) => ({
        ...s,
        focusedNoteId: null,
      })),
    };
    const nextList = [snapshot, ...savedWorkspaces];
    persistSavedWorkspaces(nextList);
    showToast(
      t(
        `تم حفظ المشروع "${cleanName}" (${screens.length} شاشات)`,
        `Saved Project "${cleanName}" (${screens.length} screens)`
      )
    );
  };

  const handleOverwriteWorkspace = (workspaceId: string) => {
    const target = savedWorkspaces.find((w) => w.id === workspaceId);
    const updatedName = workspaceName.trim() || target?.name || 'مشروع الاستوديو';
    const nextList = savedWorkspaces.map((w) =>
      w.id === workspaceId
        ? {
            ...w,
            name: updatedName,
            updatedAt: new Date().toISOString(),
            activeScreenId,
            screens: screens.map((s) => ({
              ...s,
              focusedNoteId: null,
            })),
          }
        : w
    );
    persistSavedWorkspaces(nextList);
    showToast(t(`تم تحديث المشروع "${updatedName}"`, `Updated Project "${updatedName}"`));
  };

  const handleLoadWorkspace = (ws: SavedWorkspaceProject) => {
    if (!Array.isArray(ws.screens) || ws.screens.length === 0) return;
    const sanitizedScreens = ws.screens.map((s, idx) => normalizeScreen(s, idx + 1));
    const nextActiveId = sanitizedScreens.some((s) => s.id === ws.activeScreenId)
      ? ws.activeScreenId
      : sanitizedScreens[0].id;
    setHistoryByScreen({});
    setContextMenu(null);
    setEditorBlinkingKeys(new Set());
    setWorkspaceName(ws.name || 'مشروع الاستوديو');
    setScreens(sanitizedScreens);
    setActiveScreenId(nextActiveId);
    const activeProj = sanitizedScreens.find((s) => s.id === nextActiveId) || sanitizedScreens[0];
    pushSyncToServer(sanitizedScreens, nextActiveId, activeProj, true);
    showToast(
      t(
        `تم فتح المشروع "${ws.name}" (${sanitizedScreens.length} شاشات)`,
        `Opened Project "${ws.name}" (${sanitizedScreens.length} screens)`
      )
    );
  };

  const handleDeleteWorkspace = (id: string) => {
    const nextList = savedWorkspaces.filter((w) => w.id !== id);
    persistSavedWorkspaces(nextList);
    showToast(t('تم حذف المشروع من المحفوظات', 'Project Deleted'));
  };

  const handleExportWorkspaceJson = (ws?: SavedWorkspaceProject) => {
    const targetWorkspace: SavedWorkspaceProject = ws || {
      id: `ws-${Date.now()}`,
      name: workspaceName.trim() || 'مشروع_الاستوديو',
      updatedAt: new Date().toISOString(),
      activeScreenId,
      screens: screens.map((s) => ({ ...s, focusedNoteId: null })),
    };

    const { blob, fileName, stats } = buildWorkspaceSgdArchive(
      targetWorkspace,
      canvasRef.current
    );
    triggerSgdDownload(blob, fileName);

    const kb = Math.max(1, Math.round(stats.compressedBytes / 1024));
    const assetsNote =
      stats.assetsCount > 0
        ? t(` + ${stats.assetsCount} صور مدمجة`, ` + ${stats.assetsCount} embedded images`)
        : '';
    showToast(
      t(
        `تم تصدير حزمة (.sgd) المضغوطة (${stats.screensCount} شاشات${assetsNote} · ${kb}KB · ضغط ${stats.compressionRatioPct}%)`,
        `Exported compressed .sgd bundle (${stats.screensCount} screens${assetsNote} · ${kb}KB · -${stats.compressionRatioPct}%)`
      )
    );
  };

  const handleExportCurrentScreenJson = () => {
    const { blob, fileName, stats } = buildSingleScreenSgdArchive(project, canvasRef.current);
    triggerSgdDownload(blob, fileName);
    const kb = Math.max(1, Math.round(stats.compressedBytes / 1024));
    showToast(
      t(
        `تم تصدير حزمة الشاشة الحالية (.sgd · ${kb}KB · ضغط ${stats.compressionRatioPct}%)`,
        `Exported Active Screen .sgd bundle (${kb}KB · -${stats.compressionRatioPct}%)`
      )
    );
  };

  const applyParsedImportResult = (result: ParsedSgdImportResult): boolean => {
    if (!result.ok) {
      showToast(
        t(
          `تعذر قراءة الملف: ${result.error}`,
          `Failed to import file: ${result.error}`
        )
      );
      return false;
    }

    setIsLibraryModalOpen(false);
    setPendingImport(result);
    return true;
  };

  const handleExecuteImportDecision = (mode: SgdImportDecisionMode) => {
    if (!pendingImport) return;
    const result = pendingImport;
    setPendingImport(null);

    const incomingRawScreens =
      result.archiveType === 'workspace' ? result.screens : [result.screen];
    const incomingSanitized = incomingRawScreens.map((s, idx) =>
      normalizeScreen(s, idx + 1)
    );
    const formatBadge = result.sourceFormat === 'sgd' ? '.sgd' : '.json';
    const assetsInfo =
      result.assetsRestored > 0
        ? t(
            ` + ${result.assetsRestored} صور مدمجة`,
            ` + ${result.assetsRestored} embedded images`
          )
        : '';

    // Mode 2: Merge Incoming Screens into Current Project
    if (mode === 'merge') {
      const existingIds = new Set(screens.map((s) => s.id));
      const mergedIncoming = incomingSanitized.map((scr, idx) => {
        const nextId = existingIds.has(scr.id)
          ? `screen-${Date.now()}-${idx + 1}`
          : scr.id;
        existingIds.add(nextId);
        return {
          ...scr,
          id: nextId,
          name: existingIds.size > 1 ? scr.name : scr.name,
          focusedNoteId: null,
        };
      });

      const combinedScreens = [...screens, ...mergedIncoming];
      const nextActiveId = mergedIncoming[0]?.id || activeScreenId;
      setScreens(combinedScreens);
      setActiveScreenId(nextActiveId);
      const activeProj =
        combinedScreens.find((s) => s.id === nextActiveId) || combinedScreens[0];
      pushSyncToServer(combinedScreens, nextActiveId, activeProj, true);

      showToast(
        t(
          `تم دمج (${mergedIncoming.length}) شاشات من (${formatBadge}) مع المشروع الحالي (الإجمالي: ${combinedScreens.length} شاشات${assetsInfo})`,
          `Merged (${mergedIncoming.length}) screens from (${formatBadge}) into current project (Total: ${combinedScreens.length} screens${assetsInfo})`
        )
      );
      return;
    }

    // Mode 1 & Mode 3: Save Current First (if save_and_open) -> Then Open New
    let nextLibrary = [...savedWorkspaces];
    if (mode === 'save_and_open') {
      const currentSnapshot: SavedWorkspaceProject = {
        id: `ws-${Date.now()}-prev`,
        name:
          workspaceName.trim() ||
          t('مشروع محفوظ تلقائياً', 'Auto-Saved Workspace'),
        updatedAt: new Date().toISOString(),
        activeScreenId,
        screens,
      };
      nextLibrary = [currentSnapshot, ...nextLibrary];
      persistSavedWorkspaces(nextLibrary);
    }

    const importedName =
      result.archiveType === 'workspace'
        ? result.workspaceName || t('مشروع مستورد', 'Imported Project')
        : result.screen.name || t('شاشة مستوردة', 'Imported Screen');

    const nextActiveId =
      result.archiveType === 'workspace' &&
      incomingSanitized.some((s) => s.id === result.activeScreenId)
        ? result.activeScreenId
        : incomingSanitized[0].id;

    setHistoryByScreen({});
    setContextMenu(null);
    setEditorBlinkingKeys(new Set());
    setWorkspaceName(importedName);
    setScreens(incomingSanitized);
    setActiveScreenId(nextActiveId);
    const activeProj =
      incomingSanitized.find((s) => s.id === nextActiveId) ||
      incomingSanitized[0];
    pushSyncToServer(incomingSanitized, nextActiveId, activeProj, true);

    if (mode === 'save_and_open') {
      showToast(
        t(
          `تم حفظ المشروع السابق وفتح "${importedName}" (${incomingSanitized.length} شاشات${assetsInfo})`,
          `Saved previous workspace & opened "${importedName}" (${incomingSanitized.length} screens${assetsInfo})`
        )
      );
    } else {
      showToast(
        t(
          `تم فتح "${importedName}" مباشرة (${incomingSanitized.length} شاشات${assetsInfo})`,
          `Opened "${importedName}" directly (${incomingSanitized.length} screens${assetsInfo})`
        )
      );
    }
  };

  const handleImportJsonText = (rawText: string): boolean => {
    const res = parseRawJsonString(rawText);
    return applyParsedImportResult(res);
  };

  const handleImportJSONFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = await readSgdOrJsonFile(file);
    applyParsedImportResult(result);
  };

  const handleWorkspaceDropFile = async (e: React.DragEvent<HTMLDivElement>) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.sgd') || lower.endsWith('.json')) {
      e.preventDefault();
      e.stopPropagation();
      const result = await readSgdOrJsonFile(file);
      applyParsedImportResult(result);
    }
  };

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

  // Pure Multi-Screen Wall Mode: 100% Distraction-Free Spatial Display of All Screens in their exact positions
  if (isPureWallMode) {
    return (
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
    );
  }

  return (
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
        accept=".sgd,.json,application/json,application/octet-stream"
        onChange={handleImportJSONFile}
        className="hidden"
      />

      {/* Top Bar — Unified Single-Side Layout: Radiant Green SGD Badge + Smartly Grouped Task Icons */}
      <header className="h-11 shrink-0 flex items-center justify-start gap-1.5 px-3 bg-[#2A2E37] border-b border-[#434853] overflow-x-auto">
        {/* Brand Badge: SGD with Thick Radiant Green (#8CC63F) Letters & Tooltip */}
        <div
          title="Studio Grid Director Pro (.sgd Native Engine)"
          className="group relative h-8 px-3 bg-[#181B20] hover:bg-[#222730] border border-[#8CC63F]/65 hover:border-[#8CC63F] rounded-none flex items-center justify-center cursor-default select-none shrink-0 transition-colors"
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
            Studio Grid Director Pro (.sgd)
          </div>
        </div>

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
            onClick={() => fileInputRef.current?.click()}
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
                  setIsLiveFrozen((prev) => {
                    const next = !prev;
                    if (!next) {
                      const syncMsg: SyncPayload = {
                        type: 'PROJECT_UPDATE',
                        screenId: project.id,
                        project,
                        timestamp: Date.now(),
                      };
                      broadcastChannelRef.current?.postMessage(syncMsg);
                      pushSyncToServer(screens, activeScreenId, project, true);
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
                    return next;
                  });
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
                      className="w-5 h-5 flex items-center justify-center bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer"
                    >
                      <MagnifyingGlassPlus weight="bold" className="w-3 h-3 text-[#1C1E22]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAutoFit(true);
                        recalculateFitZoom();
                      }}
                      title={t('احتواء كامل الشاشة (Fit)', 'Fit Screen')}
                      className="w-5 h-5 flex items-center justify-center bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer"
                    >
                      <CornersOut weight="bold" className="w-3 h-3 text-[#1C1E22]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPan({ x: 0, y: 0 })}
                      title={t('توسيط الكاميرا (Center)', 'Center Camera')}
                      className="w-5 h-5 flex items-center justify-center bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer"
                    >
                      <Crosshair weight="bold" className="w-3 h-3 text-[#1C1E22]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMinimapOpen(false)}
                      title={t('إغلاق الرادار المصغر', 'Close Minimap Radar')}
                      className="w-5 h-5 flex items-center justify-center bg-[#9FA6B3] hover:bg-[#B4BAC6] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer"
                    >
                      <X weight="bold" className="w-3 h-3 text-[#1C1E22]" />
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
                  className="p-1 bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer"
                >
                  <X weight="bold" className="w-3.5 h-3.5 text-[#1C1E22]" />
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
                    className="flex items-center gap-1 px-1.5 h-5 rounded-none bg-[#C4C9D4] hover:bg-[#D2D7E0] text-[#1C1E22] border border-[#3A3E47] text-[10px] font-bold cursor-pointer"
                    title={t('منتقي ألوان احترافي', 'Pro Color Picker')}
                  >
                    <Palette weight="bold" className="w-3 h-3 text-[#1C1E22]" />
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
                    className={`w-full text-right px-2.5 py-1.5 rounded-none border border-[#3A3E47] text-xs font-bold flex items-center justify-between cursor-pointer ${
                      contextMenu.scope === 'single'
                        ? 'bg-[#C8CDD8] text-[#1C1E22]'
                        : 'bg-[#9FA6B3] hover:bg-[#B4BAC6] text-[#1C1E22]'
                    }`}
                  >
                    <span>
                      {t(
                        `هذا الصندوق فقط (${contextMenu.displayId})`,
                        `This Square Only (${contextMenu.displayId})`
                      )}
                    </span>
                    {contextMenu.scope === 'single' && (
                      <Check weight="bold" className="w-3.5 h-3.5 text-[#1C1E22] shrink-0" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setContextMenu((prev) =>
                        prev ? { ...prev, scope: 'color-group', errorMsg: null } : null
                      )
                    }
                    className={`w-full text-right px-2.5 py-1.5 rounded-none border border-[#3A3E47] text-xs font-bold flex items-center justify-between cursor-pointer ${
                      contextMenu.scope === 'color-group'
                        ? 'bg-[#C8CDD8] text-[#1C1E22]'
                        : 'bg-[#9FA6B3] hover:bg-[#B4BAC6] text-[#1C1E22]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-none border border-[#1C1E22]"
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
                      <Check weight="bold" className="w-3.5 h-3.5 text-[#1C1E22] shrink-0" />
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
                      className="px-2 py-0.5 rounded-none bg-[#B4BAC6] hover:bg-[#C8CDD8] border border-[#3A3E47] text-[10px] font-bold text-[#1C1E22] cursor-pointer"
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
                  className="py-1 px-1.5 rounded-none bg-[#B4BAC6] hover:bg-[#C8CDD8] border border-[#3A3E47] text-[#1C1E22] text-[10px] font-bold cursor-pointer"
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
                  className="py-1 px-1.5 rounded-none bg-[#B4BAC6] hover:bg-[#C8CDD8] border border-[#3A3E47] text-[#1C1E22] text-[10px] font-bold cursor-pointer"
                >
                  {t('تحديد العمود بالكامل ↕', 'Select Entire Col ↕')}
                </button>
              </div>

              {/* Save / Delete Buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleSaveContextMenuNote()}
                  className="flex-1 py-1.5 rounded-none bg-[#C8CDD8] hover:bg-[#D4D9E2] border border-[#3A3E47] text-[#1C1E22] font-bold text-xs cursor-pointer"
                >
                  {t('حفظ الملاحظة', 'Save Note')}
                </button>
                {contextMenu.existingNoteId && (
                  <button
                    type="button"
                    onClick={() => handleDeleteNoteById(contextMenu.existingNoteId!)}
                    className="p-1.5 rounded-none bg-[#9FA6B3] hover:bg-[#B4BAC6] border border-[#3A3E47] text-[#1C1E22] cursor-pointer"
                    title={t('حذف الملاحظة', 'Delete Note')}
                  >
                    <Trash weight="bold" className="w-4 h-4 text-[#1C1E22]" />
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
                        className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                          isModeActive
                            ? 'bg-[#DCE0E8] text-[#1C1E22] border-[#FFFFFF] ring-1 ring-[#FEF08A]'
                            : 'bg-[#9FA6B3] hover:bg-[#B4BAC6] text-[#1C1E22] border-[#3A3E47]'
                        }`}
                      >
                        <Icon weight={isModeActive ? 'fill' : 'bold'} className="w-3.5 h-3.5 text-[#1C1E22]" />
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
                      className="w-6 h-6 flex items-center justify-center rounded-none bg-[#B4BAC6] hover:bg-[#EF4444] hover:text-[#FFFFFF] border border-[#3A3E47] text-[#1C1E22] cursor-pointer transition-colors"
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
                            ? 'bg-[#DCE0E8] text-[#111317] border-[#FFFFFF]'
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
                onClick={() => {
                  pushSyncToServer(screens, activeScreenId, project, true);
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
        currentProject={project}
        savedWorkspaces={savedWorkspaces}
        lang={lang}
        onSaveWorkspace={handleSaveWorkspace}
        onOverwriteWorkspace={handleOverwriteWorkspace}
        onLoadWorkspace={handleLoadWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onExportWorkspaceJson={handleExportWorkspaceJson}
        onExportCurrentScreenJson={handleExportCurrentScreenJson}
        onImportJsonClick={() => fileInputRef.current?.click()}
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
      />

      {/* Live Director Shortcuts HUD Modal */}
      <ShortcutsHudModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
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
    </div>
  );
}

export default App;
