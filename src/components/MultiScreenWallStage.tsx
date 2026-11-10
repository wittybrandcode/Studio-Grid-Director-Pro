import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowsOutCardinal,
  ArrowUp,
  Columns,
  CornersOut,
  Eye,
  EyeSlash,
  GridFour,
  Lightning,
  MagnetStraight,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Rows,
  StackSimple,
  Wall,
} from '@phosphor-icons/react';
import {
  LaserPointerState,
  StudioProject,
  UILanguage,
} from '../types/studio';
import {
  computeGrid,
  computePhysicalWallMetrics,
  computeQuickFlashYellowIntensity,
  renderStudioCanvas,
} from '../utils/gridEngine';

interface MultiScreenWallStageProps {
  screens: StudioProject[];
  activeScreenId: string;
  isPureMode: boolean;
  lang: UILanguage;
  activeLaser: LaserPointerState | null;
  editorBlinkingKeys: Set<string>;
  editorBlinkPhaseOn: boolean;
  editorIdentifyFlash: boolean;
  flashingScreenId?: string | null;
  editorIdentifyFlashIntensity?: number;
  clockTick: number;
  isScreenLiveOpen: (screenId: string) => boolean;
  onSelectScreen: (screenId: string) => void;
  onFocusSingleScreen: (screenId: string) => void;
  onFlashScreen: (screenId: string) => void;
  onUpdateScreensPositions: (
    positions: Record<string, { x: number; y: number; zIndex?: number }>
  ) => void;
  onTogglePureMode: (nextPure?: boolean) => void;
  onExitWallView: () => void;
}

interface ResolvedScreenRect {
  screen: StudioProject;
  orderIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface SnapGuideLine {
  orientation: 'vertical' | 'horizontal';
  pos: number;
}

const ScreenCanvasSurface: React.FC<{
  screen: StudioProject;
  orderIndex: number;
  isPureMode: boolean;
  laser: LaserPointerState | null;
  blinkingCellKeys?: Set<string>;
  blinkPhaseOn?: boolean;
  identifyFlashActive?: boolean;
  identifyFlashIntensity?: number;
  clockTick: number;
}> = React.memo(({
  screen,
  orderIndex,
  isPureMode,
  laser,
  blinkingCellKeys,
  blinkPhaseOn,
  identifyFlashActive,
  identifyFlashIntensity,
  clockTick,
}) => {
  const cvsRef = useRef<HTMLCanvasElement | null>(null);
  const [imgLoadTick, setImgLoadTick] = useState<number>(0);
  const comp = useMemo(
    () => computeGrid(screen),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      screen.id,
      screen.compWidth,
      screen.compHeight,
      screen.divisionMode,
      screen.squareSizePx,
      screen.useCustomRectPx,
      screen.cellWidthPx,
      screen.cellHeightPx,
      screen.columnsCount,
      screen.rowsCount,
      screen.gridRemainderAlign,
      screen.numberingSystem,
      screen.coloringMode,
      screen.overrides,
      screen.notes,
      screen.focusedNoteId,
    ]
  );

  useEffect(() => {
    const cvs = cvsRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const flashStart = performance.now();
    const drawFrame = (flashOverride?: number) => {
      renderStudioCanvas(ctx, screen, comp, {
        isLiveOutput: isPureMode,
        screenOrderIndex: orderIndex,
        laser,
        blinkingCellKeys,
        blinkPhaseOn,
        identifyFlashActive,
        identifyFlashIntensity:
          typeof flashOverride === 'number' ? flashOverride : identifyFlashIntensity,
        onAsyncImageLoad: () => setImgLoadTick((t) => t + 1),
      });
    };

    const needsRaf = Boolean(identifyFlashActive || screen.overlays?.movingSyncBar);
    if (!needsRaf) {
      const singleRaf = window.requestAnimationFrame(() => drawFrame());
      return () => window.cancelAnimationFrame(singleRaf);
    }

    let rafId = 0;
    const step = () => {
      const elapsed = performance.now() - flashStart;
      const intensity = identifyFlashActive
        ? computeQuickFlashYellowIntensity(elapsed)
        : 0;
      drawFrame(intensity);
      rafId = window.requestAnimationFrame(step);
    };
    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [
    screen,
    comp,
    orderIndex,
    isPureMode,
    laser,
    blinkingCellKeys,
    blinkPhaseOn,
    identifyFlashActive,
    identifyFlashIntensity,
    clockTick,
    imgLoadTick,
  ]);

  return (
    <canvas
      ref={cvsRef}
      width={screen.compWidth}
      height={screen.compHeight}
      className="w-full h-full block pointer-events-none"
    />
  );
});

export const MultiScreenWallStage: React.FC<MultiScreenWallStageProps> = ({
  screens,
  activeScreenId,
  isPureMode,
  lang,
  activeLaser,
  editorBlinkingKeys,
  editorBlinkPhaseOn,
  editorIdentifyFlash,
  flashingScreenId,
  editorIdentifyFlashIntensity,
  clockTick,
  isScreenLiveOpen,
  onSelectScreen,
  onFocusSingleScreen,
  onFlashScreen,
  onUpdateScreensPositions,
  onTogglePureMode,
  onExitWallView,
}) => {
  const t = (ar: string, en: string) => (lang === 'en' ? en : ar);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);

  // Stage Camera (Zoom & Pan in screen pixels)
  const [stageZoom, setStageZoom] = useState<number>(0.18);
  const [stagePan, setStagePan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [autoFitStage, setAutoFitStage] = useState<boolean>(true);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [showPureExitHover, setShowPureExitHover] = useState<boolean>(false);

  // Panning the stage background
  const [isPanningStage, setIsPanningStage] = useState<boolean>(false);
  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
  }>({ clientX: 0, clientY: 0, panX: 0, panY: 0 });

  // Dragging an individual screen on the stage
  const [draggingScreenId, setDraggingScreenId] = useState<string | null>(null);
  const [dragLiveOffset, setDragLiveOffset] = useState<{
    screenId: string;
    x: number;
    y: number;
  } | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuideLine[]>([]);
  const dragStartRef = useRef<{
    screenId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Compute resolved spatial coordinates for every screen
  const resolvedRects: ResolvedScreenRect[] = useMemo(() => {
    let runningX = 0;
    const defaultGap = 60;
    return screens.map((scr, idx) => {
      const hasSavedPos =
        typeof scr.wallPosX === 'number' &&
        Number.isFinite(scr.wallPosX) &&
        typeof scr.wallPosY === 'number' &&
        Number.isFinite(scr.wallPosY);

      const baseX = hasSavedPos ? Math.round(scr.wallPosX!) : runningX;
      const baseY = hasSavedPos ? Math.round(scr.wallPosY!) : 0;
      runningX = baseX + scr.compWidth + defaultGap;

      const effectiveX =
        dragLiveOffset && dragLiveOffset.screenId === scr.id ? dragLiveOffset.x : baseX;
      const effectiveY =
        dragLiveOffset && dragLiveOffset.screenId === scr.id ? dragLiveOffset.y : baseY;

      return {
        screen: scr,
        orderIndex: idx,
        x: effectiveX,
        y: effectiveY,
        width: scr.compWidth,
        height: scr.compHeight,
        zIndex: typeof scr.wallZIndex === 'number' ? scr.wallZIndex : idx + 1,
      };
    });
  }, [screens, dragLiveOffset]);

  // Bounding box of all screens combined in studio pixels
  const stageBounds = useMemo(() => {
    if (resolvedRects.length === 0) {
      return { minX: 0, minY: 0, maxX: 1920, maxY: 1080, width: 1920, height: 1080 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of resolvedRects) {
      if (r.x < minX) minX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.x + r.width > maxX) maxX = r.x + r.width;
      if (r.y + r.height > maxY) maxY = r.y + r.height;
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(100, maxX - minX),
      height: Math.max(100, maxY - minY),
    };
  }, [resolvedRects]);

  // Fit all screens nicely inside the viewport container
  const fitAllScreensInView = useCallback(() => {
    const el = stageContainerRef.current;
    if (!el) return;
    const padX = isPureMode ? 48 : 110;
    const padY = isPureMode ? 48 : 170;
    const availW = Math.max(240, el.clientWidth - padX);
    const availH = Math.max(180, el.clientHeight - padY);

    const headerAllowance = isPureMode ? 0 : 72;
    const scaleX = availW / Math.max(1, stageBounds.width);
    const scaleY = (availH - headerAllowance) / Math.max(1, stageBounds.height);
    const nextZoom = Math.max(0.03, Math.min(1.5, Number((Math.min(scaleX, scaleY) * 0.94).toFixed(4))));

    setStageZoom((prev) => (prev === nextZoom ? prev : nextZoom));
    setStagePan((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
  }, [stageBounds.width, stageBounds.height, isPureMode]);

  useEffect(() => {
    if (!autoFitStage) return;
    fitAllScreensInView();
    const el = stageContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (autoFitStage) fitAllScreensInView();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoFitStage, fitAllScreensInView, screens.length, isPureMode]);

  // Global window mousemove / mouseup for dragging a screen or panning the stage
  useEffect(() => {
    if (!draggingScreenId && !isPanningStage) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (isPanningStage) {
        setStagePan({
          x: panStartRef.current.panX + (e.clientX - panStartRef.current.clientX),
          y: panStartRef.current.panY + (e.clientY - panStartRef.current.clientY),
        });
        return;
      }

      const d = dragStartRef.current;
      if (!d) return;

      const deltaStudioX = Math.round((e.clientX - d.startClientX) / Math.max(0.02, stageZoom));
      const deltaStudioY = Math.round((e.clientY - d.startClientY) / Math.max(0.02, stageZoom));

      let nextX = d.origX + deltaStudioX;
      let nextY = d.origY + deltaStudioY;
      const activeGuides: SnapGuideLine[] = [];

      const draggedRect = resolvedRects.find((r) => r.screen.id === d.screenId);
      if (draggedRect && snapEnabled && !e.altKey) {
        const snapTol = Math.max(18, Math.round(14 / Math.max(0.05, stageZoom)));
        const myW = draggedRect.width;
        const myH = draggedRect.height;

        for (const other of resolvedRects) {
          if (other.screen.id === d.screenId) continue;

          // X Snap Candidates: Left-to-Right (0px seamless), Right-to-Left (0px seamless), Left-to-Left, Right-to-Right, Center-to-Center
          const xCandidates = [
            { target: other.x + other.width, guide: other.x + other.width }, // Snap my left to other right (0px touch)
            { target: other.x - myW, guide: other.x }, // Snap my right to other left (0px touch)
            { target: other.x, guide: other.x }, // Left edges aligned
            { target: other.x + other.width - myW, guide: other.x + other.width }, // Right edges aligned
            {
              target: Math.round(other.x + other.width / 2 - myW / 2),
              guide: Math.round(other.x + other.width / 2),
            }, // Center X aligned
          ];

          for (const cand of xCandidates) {
            if (Math.abs(nextX - cand.target) <= snapTol) {
              nextX = cand.target;
              activeGuides.push({ orientation: 'vertical', pos: cand.guide });
              break;
            }
          }

          // Y Snap Candidates: Top-to-Bottom (0px seamless), Bottom-to-Top (0px seamless), Top-to-Top, Bottom-to-Bottom, Center-to-Center
          const yCandidates = [
            { target: other.y + other.height, guide: other.y + other.height }, // Snap my top to other bottom
            { target: other.y - myH, guide: other.y }, // Snap my bottom to other top
            { target: other.y, guide: other.y }, // Top edges aligned
            { target: other.y + other.height - myH, guide: other.y + other.height }, // Bottom edges aligned
            {
              target: Math.round(other.y + other.height / 2 - myH / 2),
              guide: Math.round(other.y + other.height / 2),
            }, // Center Y aligned
          ];

          for (const cand of yCandidates) {
            if (Math.abs(nextY - cand.target) <= snapTol) {
              nextY = cand.target;
              activeGuides.push({ orientation: 'horizontal', pos: cand.guide });
              break;
            }
          }
        }
      }

      setSnapGuides(activeGuides);
      setDragLiveOffset({
        screenId: d.screenId,
        x: nextX,
        y: nextY,
      });
    };

    const handleWindowMouseUp = () => {
      if (draggingScreenId && dragLiveOffset) {
        // Persist all resolved positions so every screen keeps its exact coordinates
        const nextMap: Record<string, { x: number; y: number; zIndex?: number }> = {};
        for (const r of resolvedRects) {
          nextMap[r.screen.id] = {
            x: r.screen.id === dragLiveOffset.screenId ? dragLiveOffset.x : r.x,
            y: r.screen.id === dragLiveOffset.screenId ? dragLiveOffset.y : r.y,
            zIndex: r.zIndex,
          };
        }
        onUpdateScreensPositions(nextMap);
      }
      setDraggingScreenId(null);
      setDragLiveOffset(null);
      setSnapGuides([]);
      dragStartRef.current = null;
      setIsPanningStage(false);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [
    draggingScreenId,
    isPanningStage,
    stageZoom,
    snapEnabled,
    resolvedRects,
    dragLiveOffset,
    onUpdateScreensPositions,
  ]);

  // Preset Layout Generators
  const applyPresetArrangement = (
    mode: 'seamless_row' | 'spaced_row' | 'vertical_stack' | 'grid_2x2'
  ) => {
    const nextMap: Record<string, { x: number; y: number; zIndex?: number }> = {};
    if (mode === 'seamless_row') {
      let curX = 0;
      screens.forEach((s, idx) => {
        nextMap[s.id] = { x: curX, y: 0, zIndex: idx + 1 };
        curX += s.compWidth; // 0px seamless LED wall
      });
    } else if (mode === 'spaced_row') {
      let curX = 0;
      screens.forEach((s, idx) => {
        nextMap[s.id] = { x: curX, y: 0, zIndex: idx + 1 };
        curX += s.compWidth + 80;
      });
    } else if (mode === 'vertical_stack') {
      let curY = 0;
      screens.forEach((s, idx) => {
        nextMap[s.id] = { x: 0, y: curY, zIndex: idx + 1 };
        curY += s.compHeight + 80;
      });
    } else if (mode === 'grid_2x2') {
      const cols = 2;
      let curX = 0;
      let curY = 0;
      let rowMaxH = 0;
      screens.forEach((s, idx) => {
        const colIdx = idx % cols;
        if (colIdx === 0 && idx > 0) {
          curX = 0;
          curY += rowMaxH + 80;
          rowMaxH = 0;
        }
        nextMap[s.id] = { x: curX, y: curY, zIndex: idx + 1 };
        curX += s.compWidth + 80;
        rowMaxH = Math.max(rowMaxH, s.compHeight);
      });
    }
    onUpdateScreensPositions(nextMap);
    setAutoFitStage(true);
  };

  // Update active screen's X or Y position numerically or via nudge
  const updateActiveScreenCoord = (
    axis: 'x' | 'y',
    value: number,
    isDelta = false
  ) => {
    const nextMap: Record<string, { x: number; y: number; zIndex?: number }> = {};
    for (const r of resolvedRects) {
      if (r.screen.id === activeScreenId) {
        const nextX = axis === 'x' ? (isDelta ? r.x + value : value) : r.x;
        const nextY = axis === 'y' ? (isDelta ? r.y + value : value) : r.y;
        nextMap[r.screen.id] = { x: Math.round(nextX), y: Math.round(nextY), zIndex: r.zIndex };
      } else {
        nextMap[r.screen.id] = { x: r.x, y: r.y, zIndex: r.zIndex };
      }
    }
    onUpdateScreensPositions(nextMap);
  };

  const bringActiveScreenToFront = () => {
    const maxZ = Math.max(...resolvedRects.map((r) => r.zIndex), 1);
    const nextMap: Record<string, { x: number; y: number; zIndex?: number }> = {};
    for (const r of resolvedRects) {
      nextMap[r.screen.id] = {
        x: r.x,
        y: r.y,
        zIndex: r.screen.id === activeScreenId ? maxZ + 1 : r.zIndex,
      };
    }
    onUpdateScreensPositions(nextMap);
  };

  const activeRect =
    resolvedRects.find((r) => r.screen.id === activeScreenId) || resolvedRects[0];

  const totalWallMetersW = Number(
    screens
      .reduce((acc, s) => acc + computePhysicalWallMetrics(s).widthMeters, 0)
      .toFixed(2)
  );
  const totalWallCabinets = screens.reduce(
    (acc, s) => acc + computePhysicalWallMetrics(s).totalCabinets,
    0
  );

  return (
    <div
      ref={stageContainerRef}
      onMouseMove={(e) => {
        if (isPureMode) {
          setShowPureExitHover(e.clientY <= 54);
        }
      }}
      onWheel={(e) => {
        e.preventDefault();
        setAutoFitStage(false);
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        setStageZoom((z) => Math.max(0.03, Math.min(2.0, Number((z * factor).toFixed(4)))));
      }}
      onMouseDown={(e) => {
        if (e.button === 0 && e.target === e.currentTarget) {
          setIsPanningStage(true);
          setAutoFitStage(false);
          panStartRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            panX: stagePan.x,
            panY: stagePan.y,
          };
        }
      }}
      className={`relative w-full h-full overflow-hidden flex items-center justify-center select-none ${
        isPureMode ? 'bg-[#070A10]' : 'bg-[#181B20]'
      } ${isPanningStage ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={
        isPureMode
          ? undefined
          : {
              backgroundImage:
                'radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }
      }
    >
      {/* =====================================================================
          1. TOP MULTI-SCREEN LAYOUT & POSITION CONTROL BAR (Hidden in Pure Mode)
         ===================================================================== */}
      {!isPureMode && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute top-3 left-3 right-3 z-30 flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#242830]/95 border border-[#494F5C] shadow-2xl rounded-none"
        >
          {/* Left Group: Title + Quick Layout Presets */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#DCE0E8] px-1">
              <Wall weight="fill" className="w-4 h-4 text-[#FEF08A]" />
              <span>
                {t(
                  `مسرح جميع الشاشات (${screens.length})`,
                  `All Screens Stage (${screens.length})`
                )}
              </span>
              <span dir="ltr" className="text-[11px] font-mono text-[#38BDF8] font-bold">
                [{stageBounds.width}×{stageBounds.height}px · {totalWallMetersW}m · {totalWallCabinets} Cab]
              </span>
            </div>

            <div className="h-4 w-px bg-[#434853]" />

            {/* Arrangement Presets */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyPresetArrangement('seamless_row')}
                title={t(
                  'تلاصق أفقي بدون فجوات (0px) كجدار LED واحد متصل',
                  'Seamless 0px Horizontal LED Wall'
                )}
                className="px-2 py-1 bg-[#C4C9D4] hover:bg-[#D4D9E2] text-[#1C1E22] border border-[#3A3E47] rounded-none text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Columns weight="bold" className="w-3.5 h-3.5 text-[#1C1E22]" />
                <span>{t('تلاصق 0px', 'Seamless 0px')}</span>
              </button>

              <button
                type="button"
                onClick={() => applyPresetArrangement('spaced_row')}
                title={t('ترتيب الشاشات في صف أفقي متباعد', 'Spaced Horizontal Row')}
                className="px-2 py-1 bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Columns weight="regular" className="w-3.5 h-3.5 text-[#1C1E22]" />
                <span>{t('صف أفقي', 'Row')}</span>
              </button>

              <button
                type="button"
                onClick={() => applyPresetArrangement('vertical_stack')}
                title={t('تكديس الشاشات عمودياً فوق بعضها', 'Vertical Stack')}
                className="px-2 py-1 bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Rows weight="bold" className="w-3.5 h-3.5 text-[#1C1E22]" />
                <span>{t('عمودي', 'Stack')}</span>
              </button>

              <button
                type="button"
                onClick={() => applyPresetArrangement('grid_2x2')}
                title={t('ترتيب الشاشات في شبكة 2×2', '2x2 Matrix Grid')}
                className="px-2 py-1 bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <GridFour weight="bold" className="w-3.5 h-3.5 text-[#1C1E22]" />
                <span>{t('شبكة 2×2', 'Grid')}</span>
              </button>

              <button
                type="button"
                onClick={() => setSnapEnabled((v) => !v)}
                title={t(
                  'تفعيل / إيقاف مغناطيس محاذاة حواف الشاشات عند السحب',
                  'Toggle Edge & Center Magnetic Snapping'
                )}
                className={`px-2 py-1 border border-[#3A3E47] rounded-none text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                  snapEnabled
                    ? 'bg-[#DCE0E8] text-[#1C1E22] ring-1 ring-[#FEF08A]'
                    : 'bg-[#9FA6B3] text-[#1C1E22]'
                }`}
              >
                <MagnetStraight weight={snapEnabled ? 'fill' : 'bold'} className="w-3.5 h-3.5 text-[#1C1E22]" />
                <span>{t('مغناطيس المحاذاة', 'Snap')}</span>
              </button>
            </div>
          </div>

          {/* Center Group: Active Screen X / Y Coordinate Controls + Nudge */}
          {activeRect && (
            <div className="flex items-center gap-1.5 bg-[#1B1E24] px-2.5 py-1 border border-[#434853]">
              <span className="text-[11px] font-bold text-[#FEF08A] truncate max-w-[130px]">
                {activeRect.screen.name}:
              </span>

              <div dir="ltr" className="flex items-center gap-1 text-[11px] font-mono">
                <span className="text-[#9FA6B3]">X:</span>
                <input
                  type="number"
                  step={10}
                  value={activeRect.x}
                  onChange={(e) => updateActiveScreenCoord('x', Number(e.target.value) || 0, false)}
                  className="w-16 bg-[#242830] border border-[#494F5C] px-1.5 py-0.5 text-[11px] font-mono text-[#DCE0E8] outline-none rounded-none"
                />
                <span className="text-[#9FA6B3]">Y:</span>
                <input
                  type="number"
                  step={10}
                  value={activeRect.y}
                  onChange={(e) => updateActiveScreenCoord('y', Number(e.target.value) || 0, false)}
                  className="w-16 bg-[#242830] border border-[#494F5C] px-1.5 py-0.5 text-[11px] font-mono text-[#DCE0E8] outline-none rounded-none"
                />
              </div>

              {/* 4-Way Nudge Buttons */}
              <div dir="ltr" className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => updateActiveScreenCoord('x', e.shiftKey ? -1 : -20, true)}
                  title={t('تحريك لليسار (Shift = 1px)', 'Nudge Left (Shift = 1px)')}
                  className="w-6 h-6 flex items-center justify-center bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer"
                >
                  <ArrowLeft weight="bold" className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => updateActiveScreenCoord('y', e.shiftKey ? -1 : -20, true)}
                  title={t('تحريك للأعلى (Shift = 1px)', 'Nudge Up (Shift = 1px)')}
                  className="w-6 h-6 flex items-center justify-center bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer"
                >
                  <ArrowUp weight="bold" className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => updateActiveScreenCoord('y', e.shiftKey ? 1 : 20, true)}
                  title={t('تحريك للأسفل (Shift = 1px)', 'Nudge Down (Shift = 1px)')}
                  className="w-6 h-6 flex items-center justify-center bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer"
                >
                  <ArrowDown weight="bold" className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => updateActiveScreenCoord('x', e.shiftKey ? 1 : 20, true)}
                  title={t('تحريك لليمين (Shift = 1px)', 'Nudge Right (Shift = 1px)')}
                  className="w-6 h-6 flex items-center justify-center bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer"
                >
                  <ArrowRight weight="bold" className="w-3 h-3" />
                </button>
              </div>

              <button
                type="button"
                onClick={bringActiveScreenToFront}
                title={t('رفع الشاشة المحددة للأمام فوق الشاشات المتقاطعة', 'Bring Screen to Front')}
                className="px-1.5 py-0.5 bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
              >
                <StackSimple weight="bold" className="w-3 h-3" />
                <span>{t('للأمام', 'Front')}</span>
              </button>
            </div>
          )}

          {/* Right Group: Stage Zoom + PURE MODE BUTTON + Return to Single Screen */}
          <div className="flex items-center gap-1.5">
            <div dir="ltr" className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setAutoFitStage(false);
                  setStageZoom((z) => Math.max(0.03, Number((z / 1.2).toFixed(4))));
                }}
                title={t('تصغير المسرح', 'Zoom Out Stage')}
                className="w-7 h-7 flex items-center justify-center bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer"
              >
                <MagnifyingGlassMinus weight="bold" className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoFitStage(true);
                  fitAllScreensInView();
                }}
                title={t('احتواء وتوسيط جميع الشاشات', 'Fit All Screens')}
                className={`px-2 h-7 flex items-center gap-1 border border-[#3A3E47] rounded-none text-[11px] font-mono font-bold cursor-pointer ${
                  autoFitStage
                    ? 'bg-[#DCE0E8] text-[#1C1E22]'
                    : 'bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22]'
                }`}
              >
                <CornersOut weight="bold" className="w-3.5 h-3.5" />
                <span>{Math.round(stageZoom * 100)}%</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoFitStage(false);
                  setStageZoom((z) => Math.min(2.0, Number((z * 1.2).toFixed(4))));
                }}
                title={t('تكبير المسرح', 'Zoom In Stage')}
                className="w-7 h-7 flex items-center justify-center bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer"
              >
                <MagnifyingGlassPlus weight="bold" className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="h-4 w-px bg-[#434853]" />

            {/* PURE MODE BUTTON (الوضع النقي بدون أيقونات أو أطراف تعديل أو مشتتات) */}
            <button
              type="button"
              onClick={() => {
                setAutoFitStage(true);
                onTogglePureMode(true);
              }}
              title={t(
                'الوضع النقي: إظهار الشاشات في مواقعها فقط بدون أيقونات أو أطراف تعديل أو قوائم (اضغط Esc للعودة)',
                'Pure Mode: Show screens in their exact positions with zero icons, borders, or UI distractions (Press Esc to exit)'
              )}
              className="px-3 py-1 bg-[#FEF08A] hover:bg-[#FDE047] text-[#1C1E22] border border-[#1C1E22] ring-1 ring-[#FEF08A] rounded-none text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition-colors"
            >
              <Eye weight="fill" className="w-4 h-4 text-[#1C1E22]" />
              <span>{t('الوضع النقي (بدون مشتتات)', 'Pure Mode')}</span>
            </button>

            <button
              type="button"
              onClick={onExitWallView}
              title={t('العودة لتحرير الشاشة المفردة', 'Return to Single Screen Editor')}
              className="px-2.5 py-1 bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none text-xs font-bold cursor-pointer transition-colors"
            >
              {t('شاشة مفردة', 'Single Screen')}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. SUBTLE AUTO-HIDING TOP BAR IN PURE MODE (Only appears when mouse at top edge)
         ===================================================================== */}
      {isPureMode && showPureExitHover && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="
            absolute top-2 left-1/2 -translate-x-1/2 z-50
            flex items-center gap-2 px-3 py-1.5
            bg-[#181B20]/90 border border-[#494F5C] shadow-2xl rounded-none
          "
        >
          <button
            type="button"
            onClick={() => onTogglePureMode(false)}
            className="px-2.5 py-1 bg-[#FEF08A] hover:bg-[#FDE047] text-[#1C1E22] font-bold text-xs flex items-center gap-1.5 rounded-none cursor-pointer"
          >
            <EyeSlash weight="bold" className="w-3.5 h-3.5 text-[#1C1E22]" />
            <span>{t('الخروج من الوضع النقي (Esc)', 'Exit Pure Mode (Esc)')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAutoFitStage(true);
              fitAllScreensInView();
            }}
            className="px-2 py-1 bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] font-bold text-xs flex items-center gap-1 rounded-none cursor-pointer"
          >
            <ArrowCounterClockwise weight="bold" className="w-3.5 h-3.5 text-[#1C1E22]" />
            <span>{t('توسيط الشاشات', 'Center Screens')}</span>
          </button>
        </div>
      )}

      {/* =====================================================================
          3. SPATIAL MULTI-SCREEN COMPOSITE STAGE
         ===================================================================== */}
      <div
        style={{
          width: `${Math.round(stageBounds.width * stageZoom)}px`,
          height: `${Math.round(stageBounds.height * stageZoom)}px`,
          transform: `translate3d(${stagePan.x}px, ${stagePan.y + (isPureMode ? 0 : 18)}px, 0)`,
        }}
        className="relative shrink-0 pointer-events-none"
      >
        {/* Magnetic Alignment Snap Guides (Cyan Laser Lines while dragging) */}
        {!isPureMode &&
          snapGuides.map((g, idx) =>
            g.orientation === 'vertical' ? (
              <div
                key={`v-${idx}`}
                style={{
                  left: `${Math.round((g.pos - stageBounds.minX) * stageZoom)}px`,
                  top: '-40px',
                  bottom: '-40px',
                }}
                className="absolute w-0.5 bg-[#38BDF8] shadow-[0_0_8px_#38BDF8] z-50 pointer-events-none"
              />
            ) : (
              <div
                key={`h-${idx}`}
                style={{
                  top: `${Math.round((g.pos - stageBounds.minY) * stageZoom)}px`,
                  left: '-40px',
                  right: '-40px',
                }}
                className="absolute h-0.5 bg-[#38BDF8] shadow-[0_0_8px_#38BDF8] z-50 pointer-events-none"
              />
            )
          )}

        {/* Positioned Screens on the Stage */}
        {resolvedRects.map((rect) => {
          const { screen: scr, orderIndex, x, y, width, height, zIndex } = rect;
          const isActive = scr.id === activeScreenId;
          const isDraggingThis = draggingScreenId === scr.id;
          const isLive = isScreenLiveOpen(scr.id);

          const leftPx = Math.round((x - stageBounds.minX) * stageZoom);
          const topPx = Math.round((y - stageBounds.minY) * stageZoom);
          const wPx = Math.max(24, Math.round(width * stageZoom));
          const hPx = Math.max(16, Math.round(height * stageZoom));

          const startDraggingScreen = (e: React.MouseEvent) => {
            if (isPureMode || e.button !== 0) return;
            e.stopPropagation();
            onSelectScreen(scr.id);
            setAutoFitStage(false);
            setDraggingScreenId(scr.id);
            dragStartRef.current = {
              screenId: scr.id,
              startClientX: e.clientX,
              startClientY: e.clientY,
              origX: x,
              origY: y,
            };
          };

          return (
            <div
              key={scr.id}
              style={{
                left: `${leftPx}px`,
                top: `${topPx}px`,
                width: `${wPx}px`,
                height: `${hPx}px`,
                zIndex: isDraggingThis ? 100 : zIndex,
              }}
              onMouseDown={startDraggingScreen}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!isPureMode) {
                  onFocusSingleScreen(scr.id);
                }
              }}
              className={`absolute pointer-events-auto select-none rounded-none ${
                isPureMode
                  ? ''
                  : isDraggingThis
                  ? 'cursor-grabbing ring-2 ring-[#38BDF8] shadow-2xl'
                  : isActive
                  ? 'cursor-move ring-2 ring-[#FEF08A] shadow-2xl'
                  : 'cursor-move ring-1 ring-[#494F5C] hover:ring-[#C8CDD8]'
              }`}
            >
              {/* Editing Header Handle Above Screen (COMPLETELY HIDDEN IN PURE MODE) */}
              {!isPureMode && (
                <div
                  onMouseDown={startDraggingScreen}
                  className={`absolute bottom-full left-0 right-0 mb-0.5 px-2 py-1 flex items-center justify-between gap-1.5 border border-[#494F5C] text-[10px] rounded-none whitespace-nowrap overflow-hidden ${
                    isActive
                      ? 'bg-[#2A2E37] text-[#FEF08A] font-bold'
                      : 'bg-[#202328]/95 text-[#DCE0E8]'
                  }`}
                >
                  <div className="flex items-center gap-1 min-w-0 truncate">
                    <ArrowsOutCardinal weight="bold" className="w-3 h-3 shrink-0 text-[#38BDF8]" />
                    <span
                      className={`w-1.5 h-1.5 rounded-none shrink-0 ${
                        isLive ? 'bg-[#34D399]' : 'bg-[#8E95A2]'
                      }`}
                    />
                    <span className="truncate">
                      #{orderIndex + 1} {scr.name}
                    </span>
                    <span dir="ltr" className="font-mono text-[9px] text-[#9FA6B3] shrink-0">
                      ({x},{y})
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-1 shrink-0"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFlashScreen(scr.id);
                      }}
                      title={t('ومضة تعريفية للشاشة', 'Flash Identify Screen')}
                      className="px-1 py-0.5 bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none font-bold flex items-center cursor-pointer"
                    >
                      <Lightning weight="fill" className="w-2.5 h-2.5 text-[#1C1E22]" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocusSingleScreen(scr.id);
                      }}
                      title={t('الدخول لتعديل هذه الشاشة بمفردها', 'Edit this screen individually')}
                      className="px-1.5 py-0.5 bg-[#C8CDD8] hover:bg-[#D4D9E2] text-[#1C1E22] border border-[#3A3E47] rounded-none font-bold text-[9px] cursor-pointer"
                    >
                      {t('تعديل ⤢', 'Edit ⤢')}
                    </button>
                  </div>
                </div>
              )}

              {/* Pure Screen Canvas Surface */}
              <div className="w-full h-full bg-[#090D16] overflow-hidden">
                <ScreenCanvasSurface
                  screen={scr}
                  orderIndex={orderIndex}
                  isPureMode={isPureMode}
                  laser={scr.id === activeScreenId ? activeLaser : null}
                  blinkingCellKeys={scr.id === activeScreenId ? editorBlinkingKeys : undefined}
                  blinkPhaseOn={editorBlinkPhaseOn}
                  identifyFlashActive={
                    editorIdentifyFlash &&
                    (flashingScreenId ? scr.id === flashingScreenId : scr.id === activeScreenId)
                  }
                  identifyFlashIntensity={editorIdentifyFlashIntensity}
                  clockTick={clockTick}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
