import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CenterOverlayConfig,
  ColorCalibrationConfig,
  DEFAULT_CABINET_CONFIG,
  DEFAULT_CENTER_CONFIG,
  DEFAULT_COLOR_CALIBRATION,
  DEFAULT_NDI_CONFIG,
  DEFAULT_STUDIO_PROJECT,
  PRESET_PROJECT_TEMPLATES,
  RESOLUTION_PRESETS,
  SavedWorkspaceProject,
  StudioProject,
  StudioRuler,
  UILanguage,
} from '../types/studio';
import { computePhysicalWallMetrics, pruneStudioCaches } from '../utils/gridEngine';
import {
  buildSingleScreenSgdArchive,
  buildWorkspaceSgdArchive,
  ParsedSgdImportResult,
  parseRawJsonString,
  readSgdOrJsonFile,
  triggerSgdDownload,
} from '../utils/sgdArchive';
import {
  isTauriRuntime,
  openStudioNativeProjectFile,
  openTauriLiveOutputWindow,
} from '../utils/tauriBridge';
import { SgdImportDecisionMode } from '../components/StudioModals';
import { parseResolumeAdvancedOutputXml } from '../utils/resolumeBridge';

export const WORKSPACE_NAME_KEY = 'studio_grid_director_workspace_name_v4';
export const WORKSPACES_LIBRARY_KEY = 'studio_grid_director_workspaces_v4';
export const SCREENS_STORAGE_KEY = 'studio_grid_director_screens_v4';
export const ACTIVE_SCREEN_ID_KEY = 'studio_grid_director_active_screen_id_v4';
export const ACTIVE_STORAGE_KEY = 'studio_grid_director_active_project_v3';
export const LIBRARY_STORAGE_KEY = 'studio_grid_director_library_v3';
export const MAX_HISTORY_STEPS = 40;

export interface ScreenHistoryStack {
  past: StudioProject[];
  future: StudioProject[];
}

export function normalizeScreen(raw: Partial<StudioProject>, fallbackIndex = 1): StudioProject {
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
    ndiConfig: {
      ...DEFAULT_NDI_CONFIG,
      sourceName: `SGD_${(raw.id || `SCREEN_${fallbackIndex}`).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`,
      ...(raw.ndiConfig || {}),
    },
    processorZones: Array.isArray(raw.processorZones) ? raw.processorZones : [],
    rulers: Array.isArray(raw.rulers) ? raw.rulers : [],
    drawings: Array.isArray(raw.drawings) ? raw.drawings : [],
  };
}

export interface UseWorkspaceStorageParams {
  isLiveOutput: boolean;
  t: (ar: string, en: string) => string;
  showToast: (msg: string) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  pushSyncToServer: (
    nextScreens: StudioProject[],
    nextActiveId: string,
    changedScreen?: StudioProject,
    immediate?: boolean
  ) => void;
  onResetTransientUi?: (options?: { resetAutoFit?: boolean }) => void;
}

export function useWorkspaceStorage({
  isLiveOutput,
  t,
  showToast,
  canvasRef,
  pushSyncToServer,
  onResetTransientUi,
}: UseWorkspaceStorageParams) {
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
    return PRESET_PROJECT_TEMPLATES.map((tpl, idx) => normalizeScreen(tpl, idx + 1));
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

  // Quick Create Screen Modal/Inline Form State
  const [isNewScreenModalOpen, setIsNewScreenModalOpen] = useState<boolean>(false);
  const [newScreenName, setNewScreenName] = useState<string>('');
  const [newScreenPresetId, setNewScreenPresetId] = useState<string>('fhd');

  const [workspaceName, setWorkspaceName] = useState<string>(() => {
    try {
      return localStorage.getItem(WORKSPACE_NAME_KEY) || 'مشروع الاستوديو الرئيسي';
    } catch {
      return 'مشروع الاستوديو الرئيسي';
    }
  });

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

  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState<boolean>(false);
  const [pendingImport, setPendingImport] = useState<
    Extract<ParsedSgdImportResult, { ok: true }> | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const storageSaveTimerRef = useRef<number | null>(null);

  // Keep a ref to screens so undo history recording never calls setState inside another setState updater
  const screensRef = useRef<StudioProject[]>(screens);
  screensRef.current = screens;

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

  const activePhysicalMetrics = useMemo(
    () => computePhysicalWallMetrics(project),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.compWidth, project.compHeight, project.cabinetConfig]
  );

  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACE_NAME_KEY, workspaceName);
    } catch {
      // ignore
    }
  }, [workspaceName]);

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

  // Prune stale caches and debounce heavy localStorage JSON serialization (250ms)
  useEffect(() => {
    if (isLiveOutput) return undefined;

    if (storageSaveTimerRef.current) {
      window.clearTimeout(storageSaveTimerRef.current);
    }
    storageSaveTimerRef.current = window.setTimeout(() => {
      storageSaveTimerRef.current = null;
      pruneStudioCaches(
        screens.map((s) => s.id),
        screens.map((s) => s.colorCalibration?.customImageDataUrl || '').filter(Boolean)
      );

      try {
        localStorage.setItem(SCREENS_STORAGE_KEY, JSON.stringify(screens));
        localStorage.setItem(ACTIVE_SCREEN_ID_KEY, activeScreenId);
        localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(project));
      } catch {
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

    return () => {
      if (storageSaveTimerRef.current) {
        window.clearTimeout(storageSaveTimerRef.current);
        storageSaveTimerRef.current = null;
      }
    };
  }, [screens, activeScreenId, project, isLiveOutput]);

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
    onResetTransientUi?.({ resetAutoFit: true });
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
      if (isTauriRuntime()) {
        void openTauriLiveOutputWindow(newScreen);
      } else {
        const a = document.createElement('a');
        a.href = `#live-output?screen=${encodeURIComponent(newId)}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }

    showToast(t(`تم إنشاء "${finalName}" وربطها بنجاح`, `Created "${finalName}"`));
  };

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
    onResetTransientUi?.();
    pushSyncToServer(nextScreens, newId, cloned, true);
    showToast(t('تم نسخ الشاشة', 'Screen Duplicated'));
  };

  const handleDeleteScreen = (targetId: string) => {
    if (screens.length <= 1) return;
    const nextScreens = screens.filter((s) => s.id !== targetId);
    const nextActive = activeScreenId === targetId ? nextScreens[0].id : activeScreenId;
    setHistoryByScreen((prev) => {
      if (!prev[targetId]) return prev;
      const copy = { ...prev };
      delete copy[targetId];
      return copy;
    });
    setScreens(nextScreens);
    setActiveScreenId(nextActive);
    onResetTransientUi?.();
    pushSyncToServer(nextScreens, nextActive, nextScreens[0], true);
    showToast(t('تم حذف الشاشة', 'Screen Deleted'));
  };

  const handleMoveScreen = useCallback(
    (targetId: string, direction: 'up' | 'down') => {
      const prev = screensRef.current;
      const idx = prev.findIndex((s) => s.id === targetId);
      if (idx === -1) return;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return;
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[swapIdx];
      next[swapIdx] = temp;
      screensRef.current = next;
      setScreens(next);
      pushSyncToServer(next, activeScreenId, project, true);
    },
    [activeScreenId, project, pushSyncToServer]
  );

  const persistSavedWorkspaces = (nextList: SavedWorkspaceProject[]) => {
    setSavedWorkspaces(nextList);
    try {
      localStorage.setItem(WORKSPACES_LIBRARY_KEY, JSON.stringify(nextList));
    } catch {
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
    onResetTransientUi?.();
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
    onResetTransientUi?.();
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

  const handleImportArenaScreens = useCallback(
    (
      importedScreens: StudioProject[],
      mode: 'replace' | 'append',
      importedWorkspaceName?: string
    ) => {
      if (!importedScreens || importedScreens.length === 0) return;
      const sanitized = importedScreens.map((s, idx) => normalizeScreen(s, idx + 1));

      if (mode === 'replace') {
        setHistoryByScreen({});
        onResetTransientUi?.();
        if (importedWorkspaceName) {
          setWorkspaceName(importedWorkspaceName);
        }
        setScreens(sanitized);
        setActiveScreenId(sanitized[0].id);
        pushSyncToServer(sanitized, sanitized[0].id, sanitized[0], true);
        showToast(
          t(
            `تم استبدال المشروع بـ ${sanitized.length} شاشة من Resolume Arena`,
            `Replaced workspace with ${sanitized.length} Resolume Arena screen(s)`
          )
        );
      } else {
        const combined = [...screensRef.current, ...sanitized];
        screensRef.current = combined;
        setScreens(combined);
        setActiveScreenId(sanitized[0].id);
        pushSyncToServer(combined, sanitized[0].id, sanitized[0], true);
        showToast(
          t(
            `تمت إضافة ${sanitized.length} شاشة من Resolume Arena إلى المشروع`,
            `Added ${sanitized.length} Resolume Arena screen(s) to workspace`
          )
        );
      }
    },
    [pushSyncToServer, showToast, t, onResetTransientUi]
  );

  const handleImportXmlOrSgdFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xml')) {
      const text = await file.text();
      const parsed = parseResolumeAdvancedOutputXml(text);
      if (parsed.ok) {
        handleImportArenaScreens(
          parsed.screens,
          'append',
          parsed.workspaceName || undefined
        );
      } else {
        showToast(parsed.error || t('ملف Resolume XML غير صالح', 'Invalid Resolume XML'));
      }
      return;
    }
    const result = await readSgdOrJsonFile(file);
    applyParsedImportResult(result);
  };

  const handleImportJSONFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleImportXmlOrSgdFile(file);
  };

  const handleTriggerImportDialog = async () => {
    if (isTauriRuntime()) {
      const nativeFile = await openStudioNativeProjectFile();
      if (nativeFile === 'cancelled') return;
      if (nativeFile instanceof File) {
        await handleImportXmlOrSgdFile(nativeFile);
        return;
      }
    }
    fileInputRef.current?.click();
  };

  const handleWorkspaceDropFile = async (e: React.DragEvent<HTMLDivElement>) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.sgd') || lower.endsWith('.json') || lower.endsWith('.xml')) {
      e.preventDefault();
      e.stopPropagation();
      await handleImportXmlOrSgdFile(file);
    }
  };

  return {
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
    historyByScreen,
    setHistoryByScreen,
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
  };
}

export function getStoredLang(): UILanguage {
  try {
    const saved = localStorage.getItem('studio_grid_lang');
    return saved === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}
