import {
  BROADCAST_16_PALETTE,
  CabinetAndPitchConfig,
  ColorCalibrationConfig,
  ComputedCell,
  DEFAULT_CABINET_CONFIG,
  DEFAULT_CENTER_CONFIG,
  DEFAULT_COLOR_CALIBRATION,
  FreehandDrawingItem,
  LaserPointerState,
  StudioNoteItem,
  StudioProject,
} from '../types/studio';

// Cache for custom uploaded images so Canvas 2D can draw them synchronously
const customImageCache = new Map<string, HTMLImageElement>();

// Offscreen Base Grid Layer Cache per screen ID for 60fps performance on giant screens (>2,000 cells)
interface CachedBaseGridLayer {
  layoutSignature: string;
  canvas: HTMLCanvasElement;
  cellColorsSnapshot: Map<string, string>;
  focusMinY: number;
  focusMaxY: number;
  focusedDisplayIds: string[];
}
const baseGridLayerCache = new Map<string, CachedBaseGridLayer>();

// Offscreen LED Cabinet & Snake Cabling Layer Cache per screen ID
interface CachedCabinetLayer {
  signature: string;
  canvas: HTMLCanvasElement;
}
const cabinetLayerCache = new Map<string, CachedCabinetLayer>();

// Tiny Reusable Hardware-Downscaled Sampler Canvases to eliminate 4K/8K GPU-to-CPU getImageData stalls
let telemetrySampleCanvas: HTMLCanvasElement | null = null;
let telemetrySampleCtx: CanvasRenderingContext2D | null = null;
let singlePixelSampleCanvas: HTMLCanvasElement | null = null;
let singlePixelSampleCtx: CanvasRenderingContext2D | null = null;

const MAX_CACHE_ENTRIES = 24;

/**
 * Prune offscreen canvas and image caches to prevent memory leaks when screens or projects are replaced/deleted
 */
export function pruneStudioCaches(
  activeScreenIds?: string[],
  activeImageUrls?: string[]
): void {
  if (activeScreenIds && activeScreenIds.length > 0) {
    const validIds = new Set(activeScreenIds);
    for (const key of baseGridLayerCache.keys()) {
      if (!validIds.has(key)) {
        const entry = baseGridLayerCache.get(key);
        if (entry) {
          entry.canvas.width = 0;
          entry.canvas.height = 0;
        }
        baseGridLayerCache.delete(key);
      }
    }
    for (const key of cabinetLayerCache.keys()) {
      if (!validIds.has(key)) {
        const entry = cabinetLayerCache.get(key);
        if (entry) {
          entry.canvas.width = 0;
          entry.canvas.height = 0;
        }
        cabinetLayerCache.delete(key);
      }
    }
  }

  if (activeImageUrls) {
    const validUrls = new Set(activeImageUrls.filter(Boolean));
    for (const url of customImageCache.keys()) {
      if (!validUrls.has(url)) {
        customImageCache.delete(url);
      }
    }
  }

  // Enforce hard upper bound on cache sizes (FIFO eviction)
  while (baseGridLayerCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = baseGridLayerCache.keys().next().value;
    if (!oldestKey) break;
    const entry = baseGridLayerCache.get(oldestKey);
    if (entry) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    }
    baseGridLayerCache.delete(oldestKey);
  }
  while (cabinetLayerCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cabinetLayerCache.keys().next().value;
    if (!oldestKey) break;
    const entry = cabinetLayerCache.get(oldestKey);
    if (entry) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    }
    cabinetLayerCache.delete(oldestKey);
  }
  while (customImageCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = customImageCache.keys().next().value;
    if (!oldestKey) break;
    customImageCache.delete(oldestKey);
  }
}

/**
 * Exact O(log N) binary search on colEdges or rowEdges to resolve cell index accurately in all remainder alignment modes
 */
export function findGridIndexFromEdges(edges: number[], coord: number): number {
  const count = Math.max(1, edges.length - 1);
  if (coord <= edges[0]) return 0;
  if (coord >= edges[count]) return count - 1;
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (coord >= edges[mid] && coord < edges[mid + 1]) {
      return mid;
    }
    if (coord < edges[mid]) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return Math.max(0, Math.min(count - 1, low));
}

export interface PhysicalWallMetrics {
  enabled: boolean;
  pixelPitchMm: number;
  widthMm: number;
  heightMm: number;
  widthMeters: number;
  heightMeters: number;
  widthCm: number;
  heightCm: number;
  diagonalMeters: number;
  diagonalInches: number;
  areaSqMeters: number;
  cabinetWidthPx: number;
  cabinetHeightPx: number;
  cabinetWidthCm: number;
  cabinetHeightCm: number;
  cabinetsCols: number;
  cabinetsRows: number;
  totalCabinets: number;
  hasPartialCabinetX: boolean;
  hasPartialCabinetY: boolean;
  modulesColsPerCab: number;
  modulesRowsPerCab: number;
  totalModules: number;
  moduleWidthPx: number;
  moduleHeightPx: number;
  // Electrical Power & Ethernet Data Port Capacity Metrics
  totalPixels: number;
  wattsPerCabinetMax: number;
  supplyVoltage: 220 | 110;
  maxWatts: number;
  avgWatts: number;
  maxKw: number;
  avgKw: number;
  maxAmps: number;
  avgAmps: number;
  pixelsPerCabinet: number;
  maxCabinetsPerPort: number;
  ethernetPortsRequired: number;
}

/**
 * Compute real-world physical LED wall dimensions (meters, cm, inches, cabinets, modules, kW, Amps, Ethernet Ports)
 * from pixel resolution, pixel pitch (mm), and cabinet pixel dimensions.
 */
export function computePhysicalWallMetrics(project: StudioProject): PhysicalWallMetrics {
  const cfg: CabinetAndPitchConfig = {
    ...DEFAULT_CABINET_CONFIG,
    ...(project.cabinetConfig || {}),
  };
  const pitchMm = Math.max(0.4, Math.min(25, Number(cfg.pixelPitchMm) || 2.6));
  const cabW = Math.max(32, Math.round(Number(cfg.cabinetWidthPx) || 192));
  const cabH = Math.max(32, Math.round(Number(cfg.cabinetHeightPx) || 192));
  const modCols = Math.max(1, Math.min(16, Math.round(Number(cfg.modulesCols) || 2)));
  const modRows = Math.max(1, Math.min(16, Math.round(Number(cfg.modulesRows) || 2)));

  const widthMm = project.compWidth * pitchMm;
  const heightMm = project.compHeight * pitchMm;
  const widthMeters = Number((widthMm / 1000).toFixed(3));
  const heightMeters = Number((heightMm / 1000).toFixed(3));
  const widthCm = Number((widthMm / 10).toFixed(1));
  const heightCm = Number((heightMm / 10).toFixed(1));

  const diagMm = Math.hypot(widthMm, heightMm);
  const diagonalMeters = Number((diagMm / 1000).toFixed(2));
  const diagonalInches = Number((diagMm / 25.4).toFixed(1));
  const areaSqMeters = Number((widthMeters * heightMeters).toFixed(2));

  const cabinetWidthCm = Number(((cabW * pitchMm) / 10).toFixed(1));
  const cabinetHeightCm = Number(((cabH * pitchMm) / 10).toFixed(1));

  const cabinetsCols = Math.max(1, Math.ceil(project.compWidth / cabW));
  const cabinetsRows = Math.max(1, Math.ceil(project.compHeight / cabH));
  const totalCabinets = cabinetsCols * cabinetsRows;

  const hasPartialCabinetX = project.compWidth % cabW !== 0;
  const hasPartialCabinetY = project.compHeight % cabH !== 0;

  const totalModules = totalCabinets * modCols * modRows;
  const moduleWidthPx = cabW / modCols;
  const moduleHeightPx = cabH / modRows;

  // Power & Ethernet Port calculations (Standard 1GbE LED port limit @ 60Hz 8-bit = 650,000 px)
  const totalPixels = project.compWidth * project.compHeight;
  const wattsPerCabinetMax = Math.max(20, Math.min(1200, Number(cfg.wattsPerCabinetMax) || 160));
  const supplyVoltage: 220 | 110 = cfg.supplyVoltage === 110 ? 110 : 220;
  const maxWatts = totalCabinets * wattsPerCabinetMax;
  const avgWatts = Math.round(maxWatts * 0.42);
  const maxKw = Number((maxWatts / 1000).toFixed(2));
  const avgKw = Number((avgWatts / 1000).toFixed(2));
  const maxAmps = Number((maxWatts / supplyVoltage).toFixed(1));
  const avgAmps = Number((avgWatts / supplyVoltage).toFixed(1));

  const pixelsPerCabinet = cabW * cabH;
  const maxCabinetsPerPort = Math.max(1, Math.floor(650_000 / Math.max(1, pixelsPerCabinet)));
  const ethernetPortsRequired = Math.max(1, Math.ceil(totalCabinets / maxCabinetsPerPort));

  return {
    enabled: Boolean(cfg.enabled),
    pixelPitchMm: pitchMm,
    widthMm,
    heightMm,
    widthMeters,
    heightMeters,
    widthCm,
    heightCm,
    diagonalMeters,
    diagonalInches,
    areaSqMeters,
    cabinetWidthPx: cabW,
    cabinetHeightPx: cabH,
    cabinetWidthCm,
    cabinetHeightCm,
    cabinetsCols,
    cabinetsRows,
    totalCabinets,
    hasPartialCabinetX,
    hasPartialCabinetY,
    modulesColsPerCab: modCols,
    modulesRowsPerCab: modRows,
    totalModules,
    moduleWidthPx,
    moduleHeightPx,
    totalPixels,
    wattsPerCabinetMax,
    supplyVoltage,
    maxWatts,
    avgWatts,
    maxKw,
    avgKw,
    maxAmps,
    avgAmps,
    pixelsPerCabinet,
    maxCabinetsPerPort,
    ethernetPortsRequired,
  };
}

/**
 * Convert 0-based row index to studio row letters: 0 -> A, 25 -> Z, 26 -> AA
 */
export function getRowLetters(row: number): string {
  let r = row;
  let letters = '';
  while (r >= 0) {
    letters = String.fromCharCode((r % 26) + 65) + letters;
    r = Math.floor(r / 26) - 1;
  }
  return letters;
}

/**
 * Convert HSL (h: 0..360, s: 0..100, l: 0..100) to #RRGGBB hex string
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h <= 360) {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Parse #RRGGBB to [r, g, b] in 0..255
 */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '#FFFFFF').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return [r, g, b];
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${Number(clampedAlpha.toFixed(3))})`;
}

/**
 * Calculate relative luminance for WCAG contrast
 */
export function getContrastTextColor(hexColor: string): '#FFFFFF' | '#090D16' {
  const [r, g, b] = hexToRgb(hexColor);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 155 ? '#090D16' : '#FFFFFF';
}

/**
 * Compute default cell color based on global coloringMode
 */
export function getDefaultCellColor(
  r: number,
  c: number,
  totalRows: number,
  totalCols: number,
  mode: StudioProject['coloringMode']
): string {
  switch (mode) {
    case 'distinct16': {
      const idx = (r * 5 + c * 3 + (r % 2) * 7) % 16;
      return BROADCAST_16_PALETTE[idx];
    }
    case 'rainbow': {
      const total = Math.max(1, totalRows * totalCols);
      const pos = r * totalCols + c;
      const hue = Math.round((pos / total) * 340);
      return hslToHex(hue, 78, 44);
    }
    case 'row': {
      const idx = r % BROADCAST_16_PALETTE.length;
      return BROADCAST_16_PALETTE[idx];
    }
    case 'col': {
      const idx = c % BROADCAST_16_PALETTE.length;
      return BROADCAST_16_PALETTE[idx];
    }
    case 'checkerboard':
    default: {
      return (r + c) % 2 === 0 ? '#141923' : '#1E2636';
    }
  }
}

export interface ComputedGridResult {
  cells: ComputedCell[];
  cellMap: Record<string, ComputedCell>;
  cols: number;
  rows: number;
  colEdges: number[];
  rowEdges: number[];
  baseCellWidth: number;
  baseCellHeight: number;
  hasRemainderX: boolean;
  hasRemainderY: boolean;
  remainderWidthPx: number;
  remainderHeightPx: number;
  focusedCellKeys: Set<string> | null;
  activeFocusedNote: StudioNoteItem | null;
}

/**
 * Resolve which cell keys belong to a given StudioNoteItem
 */
export function getNoteMatchingCellKeys(
  note: StudioNoteItem,
  cells: ComputedCell[]
): string[] {
  if (note.scope === 'single') {
    return note.targetCellKey ? [note.targetCellKey] : [];
  }
  const targetHex = (note.targetColor || '').toUpperCase();
  if (!targetHex) return [];
  return cells
    .filter((c) => c.hasCustomColor && c.effectiveColor.toUpperCase() === targetHex)
    .map((c) => c.key);
}

/**
 * Compute all grid cells, resolved notes, and spotlight focus state
 */
export function computeGrid(project: StudioProject): ComputedGridResult {
  const compW = Math.max(100, Math.min(16384, Math.round(project.compWidth || 1920)));
  const compH = Math.max(100, Math.min(16384, Math.round(project.compHeight || 1080)));

  let baseCellWidth = 200;
  let baseCellHeight = 200;
  let cols = 10;
  let rows = 6;

  // Arrays of column X boundaries [x0, x1, ..., xCols] and row Y boundaries [y0, y1, ..., yRows]
  const colEdges: number[] = [];
  const rowEdges: number[] = [];

  if (project.divisionMode === 'pixels') {
    const rawW = project.useCustomRectPx ? project.cellWidthPx : project.squareSizePx;
    const rawH = project.useCustomRectPx ? project.cellHeightPx : project.squareSizePx;
    baseCellWidth = Math.max(40, Math.min(4000, Math.round(rawW || 200)));
    baseCellHeight = Math.max(40, Math.min(4000, Math.round(rawH || 200)));

    const align = project.gridRemainderAlign || 'start';
    const fullCols = Math.floor(compW / baseCellWidth);
    const remW = compW - fullCols * baseCellWidth;
    if (align === 'center' && remW > 1 && fullCols >= 1) {
      const leftPad = Math.round(remW / 2);
      colEdges.push(0, leftPad);
      for (let i = 1; i <= fullCols; i++) {
        colEdges.push(leftPad + i * baseCellWidth);
      }
      if (colEdges[colEdges.length - 1] < compW) {
        colEdges.push(compW);
      }
    } else {
      const countC = Math.max(1, Math.ceil(compW / baseCellWidth));
      for (let c = 0; c <= countC; c++) {
        colEdges.push(Math.min(compW, Math.round(c * baseCellWidth)));
      }
    }

    const fullRows = Math.floor(compH / baseCellHeight);
    const remH = compH - fullRows * baseCellHeight;
    if (align === 'center' && remH > 1 && fullRows >= 1) {
      const topPad = Math.round(remH / 2);
      rowEdges.push(0, topPad);
      for (let i = 1; i <= fullRows; i++) {
        rowEdges.push(topPad + i * baseCellHeight);
      }
      if (rowEdges[rowEdges.length - 1] < compH) {
        rowEdges.push(compH);
      }
    } else {
      const countR = Math.max(1, Math.ceil(compH / baseCellHeight));
      for (let r = 0; r <= countR; r++) {
        rowEdges.push(Math.min(compH, Math.round(r * baseCellHeight)));
      }
    }

    cols = Math.max(1, colEdges.length - 1);
    rows = Math.max(1, rowEdges.length - 1);
  } else {
    cols = Math.max(1, Math.min(200, Math.round(project.columnsCount || 16)));
    rows = Math.max(1, Math.min(200, Math.round(project.rowsCount || 9)));
    baseCellWidth = compW / cols;
    baseCellHeight = compH / rows;
    for (let c = 0; c <= cols; c++) {
      colEdges.push(c === cols ? compW : Math.round(c * baseCellWidth));
    }
    for (let r = 0; r <= rows; r++) {
      rowEdges.push(r === rows ? compH : Math.round(r * baseCellHeight));
    }
  }

  const remainderWidthPx =
    project.divisionMode === 'pixels' ? compW % Math.round(baseCellWidth) : 0;
  const remainderHeightPx =
    project.divisionMode === 'pixels' ? compH % Math.round(baseCellHeight) : 0;
  const hasRemainderX = remainderWidthPx > 0;
  const hasRemainderY = remainderHeightPx > 0;

  const totalCells = rows * cols;
  const padDigits = totalCells >= 100 ? 3 : 2;
  const cells: ComputedCell[] = [];
  const cellMap: Record<string, ComputedCell> = {};

  const notesList = project.notes || [];
  const singleNoteMap: Record<string, string> = {};
  const colorGroupNoteMap: Record<string, string> = {};

  for (const n of notesList) {
    if (n.scope === 'single' && n.targetCellKey) {
      singleNoteMap[n.targetCellKey] = n.text;
    } else if (n.scope === 'color-group' && n.targetColor) {
      colorGroupNoteMap[n.targetColor.toUpperCase()] = n.text;
    }
  }

  let seq = 1;
  for (let r = 0; r < rows; r++) {
    const rowLetter = getRowLetters(r);
    const y = rowEdges[r];
    const nextY = rowEdges[r + 1];
    const height = Math.max(1, nextY - y);

    for (let c = 0; c < cols; c++) {
      const x = colEdges[c];
      const nextX = colEdges[c + 1];
      const width = Math.max(1, nextX - x);

      const key = `${r}-${c}`;
      const coordId = `${rowLetter}${c + 1}`;
      let displayId = coordId;
      if (project.numberingSystem === 'sequential') {
        displayId = String(seq).padStart(padDigits, '0');
      } else if (project.numberingSystem === 'col-row') {
        displayId = `${c + 1}-${r + 1}`;
      }

      const defaultColor = getDefaultCellColor(r, c, rows, cols, project.coloringMode);
      const override = project.overrides[key];
      const hasCustomColor = Boolean(override?.color);
      const effectiveColor = override?.color || defaultColor;

      const resolvedNoteText =
        singleNoteMap[key] ||
        (hasCustomColor ? colorGroupNoteMap[effectiveColor.toUpperCase()] : undefined) ||
        override?.label;

      const cell: ComputedCell = {
        key,
        row: r,
        col: c,
        seqIndex: seq,
        displayId,
        coordId,
        x,
        y,
        width,
        height,
        defaultColor,
        effectiveColor,
        hasCustomColor,
        resolvedNoteText,
        override,
      };

      cells.push(cell);
      cellMap[key] = cell;
      seq++;
    }
  }

  // Resolve spotlight/dimming set if a note is clicked in the sidebar
  let focusedCellKeys: Set<string> | null = null;
  let activeFocusedNote: StudioNoteItem | null = null;
  if (project.focusedNoteId) {
    const foundNote = notesList.find((n) => n.id === project.focusedNoteId);
    if (foundNote) {
      const matching = getNoteMatchingCellKeys(foundNote, cells);
      if (matching.length > 0) {
        focusedCellKeys = new Set(matching);
        activeFocusedNote = foundNote;
      }
    }
  }

  return {
    cells,
    cellMap,
    cols,
    rows,
    colEdges,
    rowEdges,
    baseCellWidth,
    baseCellHeight,
    hasRemainderX,
    hasRemainderY,
    remainderWidthPx,
    remainderHeightPx,
    focusedCellKeys,
    activeFocusedNote,
  };
}

export interface RenderStudioCanvasOptions {
  selectedCellKeys?: Set<string>;
  hoveredCellKey?: string | null;
  blinkingCellKeys?: Set<string>;
  blinkPhaseOn?: boolean;
  laser?: LaserPointerState | null;
  isLiveOutput?: boolean;
  identifyFlashActive?: boolean;
  identifyFlashIntensity?: number; // 0..1 rapid yellow flash strobe intensity
  screenOrderIndex?: number;
  marqueeRect?: { x1: number; y1: number; x2: number; y2: number } | null;
  activeDraftDrawing?: (FreehandDrawingItem & { isLassoTiles?: boolean }) | null;
  onAsyncImageLoad?: () => void;
}

/**
 * Ray-casting point-in-polygon check for freehand lasso tile selection
 */
export function isPointInPolygon(
  px: number,
  py: number,
  polygon: { x: number; y: number }[]
): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Computes a rapid camera-flash / strobe yellow glow intensity (0.0 -> 1.0 -> 0.0)
 * that glows brightly and snaps off rapidly multiple times during the 2000ms Quick Flash window.
 */
export function computeQuickFlashYellowIntensity(elapsedMs?: number): number {
  const t = typeof elapsedMs === 'number' && elapsedMs >= 0 ? elapsedMs : performance.now() % 2000;
  if (t > 2000) return 0;
  // 5 rapid high-energy flash bursts across ~1.75s (each burst ~340ms: sharp glow attack + fast flash decay)
  const cycleMs = 340;
  const burstIndex = Math.floor(t / cycleMs);
  if (burstIndex >= 5) return 0;
  const localPhase = (t % cycleMs) / cycleMs; // 0.0 -> 1.0 within each burst
  // Fast attack (0 -> 0.14) then rapid exponential flash decay (0.14 -> 0.72), dark off-gap (0.72 -> 1.0)
  let pulse = 0;
  if (localPhase < 0.14) {
    pulse = localPhase / 0.14;
  } else if (localPhase < 0.76) {
    const decayProgress = (localPhase - 0.14) / 0.62;
    pulse = Math.pow(1 - decayProgress, 2.2);
  } else {
    pulse = 0;
  }
  const envelope = Math.max(0.55, 1 - burstIndex * 0.09);
  return Math.max(0, Math.min(1, pulse * envelope));
}

/**
 * Draw built-in Studio Reference Test Cards or Custom Uploaded Image inside the Canvas
 */
function renderTestImageLayer(
  ctx: CanvasRenderingContext2D,
  compWidth: number,
  compHeight: number,
  colorCfg: ColorCalibrationConfig,
  onAsyncImageLoad?: () => void
) {
  const preset = colorCfg.testImagePreset || 'none';
  if (preset === 'none') return;

  const opacity = Math.max(0, Math.min(100, colorCfg.imageOpacity ?? 100)) / 100;
  if (opacity <= 0) return;

  const scale = Math.max(20, Math.min(200, colorCfg.imageScalePct ?? 100)) / 100;
  const fit = colorCfg.imageFit || 'contain';
  const offsetX = colorCfg.imageOffsetX || 0;
  const offsetY = colorCfg.imageOffsetY || 0;
  const flipH = colorCfg.imageFlipH ? -1 : 1;
  const flipV = colorCfg.imageFlipV ? -1 : 1;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Apply offset, flip, and scale around center
  if (scale !== 1 || offsetX !== 0 || offsetY !== 0 || flipH !== 1 || flipV !== 1) {
    ctx.translate(compWidth / 2 + offsetX, compHeight / 2 + offsetY);
    ctx.scale(scale * flipH, scale * flipV);
    ctx.translate(-compWidth / 2, -compHeight / 2);
  }

  if (preset === 'custom' && colorCfg.customImageDataUrl) {
    const src = colorCfg.customImageDataUrl;
    let img = customImageCache.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => {
        onAsyncImageLoad?.();
      };
      img.src = src;
      customImageCache.set(src, img);
    }
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      let dx = 0;
      let dy = 0;
      let dw = compWidth;
      let dh = compHeight;

      if (fit === 'contain') {
        const ratio = Math.min(compWidth / iw, compHeight / ih);
        dw = iw * ratio;
        dh = ih * ratio;
        dx = (compWidth - dw) / 2;
        dy = (compHeight - dh) / 2;
      } else if (fit === 'cover') {
        const ratio = Math.max(compWidth / iw, compHeight / ih);
        dw = iw * ratio;
        dh = ih * ratio;
        dx = (compWidth - dw) / 2;
        dy = (compHeight - dh) / 2;
      } else if (fit === 'center') {
        dw = iw;
        dh = ih;
        dx = (compWidth - dw) / 2;
        dy = (compHeight - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    ctx.restore();
    return;
  }

  // Built-in Preset 1: Broadcast ColorChecker, Skin Tone & Grayscale Reference Card
  if (preset === 'broadcast_chart') {
    ctx.fillStyle = '#181A1F';
    ctx.fillRect(0, 0, compWidth, compHeight);

    const padX = compWidth * 0.06;
    const padY = compHeight * 0.08;
    const availW = compWidth - padX * 2;
    const availH = compHeight - padY * 2;

    // Top section: 24-Patch Macbeth ColorChecker (6 cols x 4 rows)
    const chartH = availH * 0.64;
    const patches = [
      // Row 1: Natural / Skin / Sky / Foliage
      '#735244', '#C29682', '#627A9D', '#576C43', '#8580B1', '#67BDAA',
      // Row 2: Saturated Primary/Secondary
      '#D67E2C', '#505BA6', '#C15A63', '#5E3C6C', '#9DBC40', '#E0A32E',
      // Row 3: Primary RGBCMY
      '#383D96', '#469449', '#AF363C', '#E7C71F', '#BB5695', '#0885A1',
      // Row 4: 6-Step Neutral Grayscale (White to Black)
      '#F3F3F2', '#C8C8C8', '#A0A0A0', '#7A7A79', '#555555', '#343434',
    ];
    const cols = 6;
    const rows = 4;
    const gap = Math.max(6, Math.min(compWidth, compHeight) * 0.008);
    const pw = (availW - gap * (cols - 1)) / cols;
    const ph = (chartH - gap * (rows - 1)) / rows;

    patches.forEach((hex, idx) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const px = padX + c * (pw + gap);
      const py = padY + r * (ph + gap);
      ctx.fillStyle = hex;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, pw, ph);
    });

    // Bottom section: 16-Step Linear Luminance Ramp + Skin Tone Reference medallions
    const rampY = padY + chartH + availH * 0.05;
    const rampH = availH * 0.16;
    const steps = 16;
    const stepW = availW / steps;
    for (let i = 0; i < steps; i++) {
      const v = Math.round((i / (steps - 1)) * 255);
      ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
      ctx.fillRect(padX + i * stepW, rampY, Math.ceil(stepW), rampH);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(padX + i * stepW, rampY, Math.ceil(stepW), rampH);
    }

    // Bottom bar: Smooth RGB Spectrum Gradient
    const specY = rampY + rampH + availH * 0.03;
    const specH = availH * 0.12;
    const grad = ctx.createLinearGradient(padX, 0, padX + availW, 0);
    grad.addColorStop(0, '#FF0000');
    grad.addColorStop(0.17, '#FFFF00');
    grad.addColorStop(0.33, '#00FF00');
    grad.addColorStop(0.5, '#00FFFF');
    grad.addColorStop(0.67, '#0000FF');
    grad.addColorStop(0.83, '#FF00FF');
    grad.addColorStop(1, '#FF0000');
    ctx.fillStyle = grad;
    ctx.fillRect(padX, specY, availW, specH);
  }

  // Built-in Preset 2: Dynamic Range, Black Crush (1%–10%) & Highlight Clipping (90%–100%)
  if (preset === 'hdr_ramp') {
    ctx.fillStyle = '#0B0D12';
    ctx.fillRect(0, 0, compWidth, compHeight);

    const padX = compWidth * 0.05;
    const padY = compHeight * 0.07;
    const availW = compWidth - padX * 2;
    const availH = compHeight - padY * 2;
    const rowH = availH / 4;
    const fontSz = Math.max(12, Math.round(Math.min(compWidth, compHeight) * 0.016));
    ctx.font = `700 ${fontSz}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Band 1: Near-Black Shadow Detail (0% to 12% IRE)
    const blackSteps = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12];
    const bw = availW / blackSteps.length;
    blackSteps.forEach((ire, i) => {
      const v = Math.round((ire / 100) * 255);
      const bx = padX + i * bw;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(bx, padY, Math.ceil(bw), rowH * 0.85);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.strokeRect(bx, padY, Math.ceil(bw), rowH * 0.85);
      ctx.fillStyle = '#DCE0E8';
      ctx.fillText(`${ire}%`, bx + bw / 2, padY + rowH * 0.42);
    });

    // Band 2: Near-White Highlight Detail (88% to 100% IRE)
    const whiteSteps = [88, 90, 92, 94, 95, 96, 97, 98, 99, 100];
    const wy = padY + rowH;
    whiteSteps.forEach((ire, i) => {
      const v = Math.round((ire / 100) * 255);
      const bx = padX + i * bw;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(bx, wy, Math.ceil(bw), rowH * 0.85);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(bx, wy, Math.ceil(bw), rowH * 0.85);
      ctx.fillStyle = '#111827';
      ctx.fillText(`${ire}%`, bx + bw / 2, wy + rowH * 0.42);
    });

    // Band 3 & 4: R, G, B & Luminance Continuous Ramps
    const channels: { label: string; stops: [string, string] }[] = [
      { label: 'LUMINANCE 0–100%', stops: ['#000000', '#FFFFFF'] },
      { label: 'RED CHANNEL 0–255', stops: ['#000000', '#FF0000'] },
      { label: 'GREEN CHANNEL 0–255', stops: ['#000000', '#00FF00'] },
      { label: 'BLUE CHANNEL 0–255', stops: ['#000000', '#0000FF'] },
    ];
    const chStartY = padY + rowH * 2;
    const chH = (rowH * 2) / channels.length;
    channels.forEach((ch, idx) => {
      const cy = chStartY + idx * chH;
      const g = ctx.createLinearGradient(padX, 0, padX + availW, 0);
      g.addColorStop(0, ch.stops[0]);
      g.addColorStop(1, ch.stops[1]);
      ctx.fillStyle = g;
      ctx.fillRect(padX, cy, availW, chH * 0.82);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.strokeRect(padX, cy, availW, chH * 0.82);
    });
  }

  // Built-in Preset 3: Virtual Broadcast Newsroom Backdrop & Studio Lighting Reference
  if (preset === 'newsroom_scene') {
    // Deep studio horizon backdrop
    const bgGrad = ctx.createLinearGradient(0, 0, 0, compHeight);
    bgGrad.addColorStop(0, '#0D1B3E');
    bgGrad.addColorStop(0.55, '#162E63');
    bgGrad.addColorStop(0.56, '#0F172A');
    bgGrad.addColorStop(1, '#1E293B');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, compWidth, compHeight);

    // Panoramic city skyline / studio light pillars
    const pillarCount = 24;
    const pW = compWidth / pillarCount;
    for (let i = 0; i < pillarCount; i++) {
      const hRatio = 0.18 + ((i * 7 + 3) % 11) * 0.032;
      const bh = compHeight * hRatio;
      const by = compHeight * 0.55 - bh;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(i * pW + pW * 0.15, by, pW * 0.7, bh);
    }

    // Warm key-light & skin-tone reference silhouette in center
    const cx = compWidth / 2;
    const cy = compHeight * 0.48;
    const r = Math.min(compWidth, compHeight) * 0.14;
    // Shoulders
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 1.45, r * 1.45, r * 0.9, 0, Math.PI, 0, false);
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Head skin-tone reference
    ctx.fillStyle = '#D89B7C';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
    ctx.fill();

    // Studio anchor desk foreground
    const deskW = compWidth * 0.56;
    const deskH = compHeight * 0.18;
    const deskX = (compWidth - deskW) / 2;
    const deskY = compHeight * 0.72;
    const deskGrad = ctx.createLinearGradient(deskX, deskY, deskX + deskW, deskY);
    deskGrad.addColorStop(0, '#CBD5E1');
    deskGrad.addColorStop(0.5, '#F8FAFC');
    deskGrad.addColorStop(1, '#94A3B8');
    ctx.fillStyle = deskGrad;
    ctx.fillRect(deskX, deskY, deskW, deskH);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(deskX, deskY, deskW, Math.max(8, deskH * 0.1));
  }

  ctx.restore();
}

/**
 * Render Color Calibration Swatches / Ramps (Solid Patch, 16-Step Grayscale, RGB Ramps, ColorChecker)
 */
function renderColorSwatchOverlay(
  ctx: CanvasRenderingContext2D,
  compWidth: number,
  compHeight: number,
  colorCfg: ColorCalibrationConfig
) {
  const mode = colorCfg.swatchMode || 'none';
  if (mode === 'none') return;

  const opacity = Math.max(10, Math.min(100, colorCfg.solidPatchOpacity ?? 100)) / 100;
  ctx.save();
  ctx.globalAlpha = opacity;

  if (mode === 'solid') {
    ctx.fillStyle = colorCfg.solidPatchColor || '#FF0000';
    if (colorCfg.solidFullScreen) {
      ctx.fillRect(0, 0, compWidth, compHeight);
    } else {
      const pw = compWidth * 0.55;
      const ph = compHeight * 0.55;
      const px = (compWidth - pw) / 2;
      const py = (compHeight - ph) / 2;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(4, Math.min(compWidth, compHeight) * 0.004);
      ctx.strokeRect(px, py, pw, ph);
    }
  } else if (mode === 'grayscale16') {
    const steps = 16;
    const sw = compWidth / steps;
    const fontSz = Math.max(12, Math.round(Math.min(compWidth, compHeight) * 0.016));
    ctx.font = `700 ${fontSz}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < steps; i++) {
      const v = Math.round((i / (steps - 1)) * 255);
      const ire = Math.round((i / (steps - 1)) * 100);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.round(i * sw), 0, Math.ceil(sw), compHeight);
      ctx.fillStyle = v > 128 ? '#090D16' : '#FFFFFF';
      ctx.fillText(`${ire}%`, i * sw + sw / 2, compHeight * 0.5);
    }
  } else if (mode === 'rgb_ramps') {
    const bands: [string, string][] = [
      ['#000000', '#FF0000'],
      ['#000000', '#00FF00'],
      ['#000000', '#0000FF'],
      ['#000000', '#FFFFFF'],
    ];
    const bh = compHeight / bands.length;
    bands.forEach(([c0, c1], idx) => {
      const g = ctx.createLinearGradient(0, 0, compWidth, 0);
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      ctx.fillStyle = g;
      ctx.fillRect(0, idx * bh, compWidth, Math.ceil(bh));
    });
  } else if (mode === 'color_checker') {
    const patches = [
      '#FF0000', '#00FF00', '#0000FF', '#00FFFF', '#FF00FF', '#FFFF00',
      '#FFFFFF', '#D4D4D4', '#9E9E9E', '#6E6E6E', '#383838', '#000000',
      '#D89B7C', '#C29682', '#735244', '#627A9D', '#576C43', '#E0A32E',
    ];
    const cols = 6;
    const rows = 3;
    const pw = compWidth / cols;
    const ph = compHeight / rows;
    patches.forEach((hex, idx) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      ctx.fillStyle = hex;
      ctx.fillRect(c * pw, r * ph, Math.ceil(pw), Math.ceil(ph));
      ctx.strokeStyle = 'rgba(9,13,22,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(c * pw, r * ph, Math.ceil(pw), Math.ceil(ph));
    });
  }

  ctx.restore();
}

/**
 * Apply Color Grading (Brightness, Contrast, Saturation, Hue, Temperature, Gamma, RGB Channel Isolation)
 * directly to the rendered canvas so both Editor, Live Output, PNG Exports, and Color Telemetry match 100%.
 */
function applyCanvasColorCalibration(
  ctx: CanvasRenderingContext2D,
  compWidth: number,
  compHeight: number,
  colorCfg?: ColorCalibrationConfig
) {
  if (!colorCfg || !colorCfg.enabled) return;

  const brightness = colorCfg.brightness ?? 100;
  const contrast = colorCfg.contrast ?? 100;
  const saturation = colorCfg.saturation ?? 100;
  const hueRotate = colorCfg.hueRotate ?? 0;
  const temperature = colorCfg.temperature ?? 0;
  const gamma = colorCfg.gamma ?? 1.0;
  const rgbChannel = colorCfg.rgbChannel || 'all';

  const hasFilter =
    brightness !== 100 ||
    contrast !== 100 ||
    saturation !== 100 ||
    hueRotate !== 0 ||
    temperature !== 0 ||
    gamma !== 1.0 ||
    rgbChannel !== 'all';

  if (!hasFilter) return;

  // If Split-Screen A/B Compare is active, snapshot the uncalibrated left portion first
  const splitCompare = Boolean(colorCfg.splitCompareEnabled);
  const splitPct = Math.max(10, Math.min(90, colorCfg.splitComparePositionPct ?? 50));
  const splitX = Math.round((splitPct / 100) * compWidth);
  let uncalibratedSnapshot: HTMLCanvasElement | null = null;

  if (splitCompare && splitX > 0) {
    uncalibratedSnapshot = document.createElement('canvas');
    uncalibratedSnapshot.width = splitX;
    uncalibratedSnapshot.height = compHeight;
    const uctx = uncalibratedSnapshot.getContext('2d');
    if (uctx) {
      uctx.drawImage(ctx.canvas, 0, 0, splitX, compHeight, 0, 0, splitX, compHeight);
    }
  }

  // 1. Apply Temperature Tint overlay before or after filter
  if (temperature !== 0) {
    ctx.save();
    const alpha = Math.min(0.45, Math.abs(temperature) / 220);
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle =
      temperature > 0
        ? `rgba(255, 160, 60, ${alpha.toFixed(3)})` // Warm Amber
        : `rgba(60, 150, 255, ${alpha.toFixed(3)})`; // Cool Blue
    ctx.fillRect(0, 0, compWidth, compHeight);
    ctx.restore();
  }

  // 2. Apply Gamma correction adjustment via midtone curve overlay if gamma !== 1.0
  const effectiveBrightness =
    gamma !== 1.0
      ? Math.round(brightness * Math.pow(1 / Math.max(0.5, Math.min(2.5, gamma)), 0.35))
      : brightness;

  // 3. Apply CSS filter self-copy for high-speed GPU-accelerated Brightness/Contrast/Saturation/Hue
  if (
    effectiveBrightness !== 100 ||
    contrast !== 100 ||
    saturation !== 100 ||
    hueRotate !== 0
  ) {
    ctx.save();
    ctx.filter = `brightness(${effectiveBrightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hueRotate}deg)`;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
  }

  // 4. Apply RGB Channel Isolation ('r' | 'g' | 'b' | 'luma')
  if (rgbChannel !== 'all') {
    ctx.save();
    if (rgbChannel === 'luma') {
      ctx.filter = 'saturate(0%)';
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.filter = 'none';
    } else {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle =
        rgbChannel === 'r'
          ? '#FF0000'
          : rgbChannel === 'g'
          ? '#00FF00'
          : '#0000FF';
      ctx.fillRect(0, 0, compWidth, compHeight);
    }
    ctx.restore();
  }

  // 5. If Split-Screen A/B Compare is active, restore the uncalibrated left half and draw A/B divider
  if (splitCompare && uncalibratedSnapshot && splitX > 0) {
    ctx.save();
    ctx.drawImage(uncalibratedSnapshot, 0, 0);

    const minSide = Math.min(compWidth, compHeight);
    const lineW = Math.max(3, Math.round(minSide * 0.0035));
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = lineW;
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, compHeight);
    ctx.stroke();

    const tagFont = Math.max(12, Math.round(minSide * 0.016));
    ctx.font = `700 ${tagFont}px "Cairo", "JetBrains Mono", sans-serif`;
    const leftLabel = 'الأصل (BEFORE)';
    const rightLabel = 'بعد المعايرة (AFTER)';
    const padX = 12;
    const tagH = tagFont + 12;
    const tagY = Math.max(18, Math.round(compHeight * 0.91));

    const lw = ctx.measureText(leftLabel).width + padX * 2;
    const rw = ctx.measureText(rightLabel).width + padX * 2;

    if (splitX > lw + 16) {
      ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
      ctx.fillRect(splitX - lw - 10, tagY, lw, tagH);
      ctx.strokeStyle = '#9FA6B3';
      ctx.lineWidth = 2;
      ctx.strokeRect(splitX - lw - 10, tagY, lw, tagH);
      ctx.fillStyle = '#DCE0E8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(leftLabel, splitX - 10 - lw / 2, tagY + tagH / 2 + 1);
    }

    if (compWidth - splitX > rw + 16) {
      ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
      ctx.fillRect(splitX + 10, tagY, rw, tagH);
      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 2;
      ctx.strokeRect(splitX + 10, tagY, rw, tagH);
      ctx.fillStyle = '#FEF08A';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rightLabel, splitX + 10 + rw / 2, tagY + tagH / 2 + 1);
    }

    ctx.restore();
  }
}

/**
 * Render the broadcast calibration grid.
 * Note text is NOT drawn inside individual cells; instead, when a note is selected from the sidebar,
 * non-target squares are dimmed and the note text is displayed prominently in the dimmed space!
 */
export function renderStudioCanvas(
  ctx: CanvasRenderingContext2D,
  project: StudioProject,
  computed: ComputedGridResult,
  options: RenderStudioCanvasOptions = {}
) {
  const { compWidth, compHeight, fillStyle, gridLineWidth, fontScale, overlays } = project;
  const {
    hoveredCellKey,
    blinkingCellKeys,
    blinkPhaseOn = false,
    laser,
    isLiveOutput = false,
    identifyFlashActive = false,
    marqueeRect = null,
    activeDraftDrawing = null,
    onAsyncImageLoad,
  } = options;

  const focusedCellKeys = computed.focusedCellKeys;
  const activeFocusedNote = computed.activeFocusedNote;
  const hasSpotlightFocus = Boolean(focusedCellKeys && focusedCellKeys.size > 0);
  const testPattern = overlays.testPattern || 'none';
  const colorCfg: ColorCalibrationConfig = {
    ...DEFAULT_COLOR_CALIBRATION,
    ...(project.colorCalibration || {}),
  };
  const hasTestImage =
    colorCfg.testImagePreset !== 'none' &&
    (colorCfg.testImagePreset !== 'custom' || Boolean(colorCfg.customImageDataUrl));
  const hasFullSwatch =
    colorCfg.swatchMode === 'grayscale16' ||
    colorCfg.swatchMode === 'rgb_ramps' ||
    colorCfg.swatchMode === 'color_checker' ||
    (colorCfg.swatchMode === 'solid' && colorCfg.solidFullScreen);

  ctx.save();
  ctx.fillStyle = '#090D16';
  ctx.fillRect(0, 0, compWidth, compHeight);

  const scaleFactor = (fontScale || 100) / 100;

  let focusMinY = Infinity;
  let focusMaxY = -Infinity;
  const focusedDisplayIds: string[] = [];

  // If a Test Image is active, render it first on the canvas stage
  if (hasTestImage) {
    renderTestImageLayer(ctx, compWidth, compHeight, colorCfg, onAsyncImageLoad);
  }

  // Should we draw the standard grid cells?
  const shouldDrawGridCells =
    testPattern === 'none' &&
    (!hasTestImage || colorCfg.showGridOverImage) &&
    !hasFullSwatch;

  // 0. Quick Visual Test Patterns (Bars, Border, White, Black, Dead-Pixel RGB Wash, 16-Step Grayscale, Checker) or Standard Grid
  if (testPattern === 'white') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, compWidth, compHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(4, Math.min(compWidth, compHeight) * 0.004);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, compWidth - ctx.lineWidth, compHeight - ctx.lineWidth);
  } else if (testPattern === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, compWidth, compHeight);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(4, Math.min(compWidth, compHeight) * 0.004);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, compWidth - ctx.lineWidth, compHeight - ctx.lineWidth);
  } else if (testPattern === 'rgb_red' || testPattern === 'rgb_green' || testPattern === 'rgb_blue') {
    // Pure Primary RGB Dead/Stuck-Pixel Inspector Wash
    ctx.fillStyle =
      testPattern === 'rgb_red'
        ? '#FF0000'
        : testPattern === 'rgb_green'
        ? '#00FF00'
        : '#0000FF';
    ctx.fillRect(0, 0, compWidth, compHeight);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(3, Math.min(compWidth, compHeight) * 0.003);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, compWidth - ctx.lineWidth, compHeight - ctx.lineWidth);
  } else if (testPattern === 'grayscale_ramp') {
    // 16-Step Precision Grayscale Linearity & Bit-Depth Ramp
    const steps = 16;
    const stepW = compWidth / steps;
    const minSide = Math.min(compWidth, compHeight);
    const lblFont = Math.max(11, Math.round(minSide * 0.015));
    ctx.font = `700 ${lblFont}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < steps; i++) {
      const val = Math.round((i / (steps - 1)) * 255);
      const hexPart = val.toString(16).padStart(2, '0').toUpperCase();
      ctx.fillStyle = `#${hexPart}${hexPart}${hexPart}`;
      const sx = Math.round(i * stepW);
      const sw = Math.ceil(stepW) + 1;
      ctx.fillRect(sx, 0, sw, compHeight);

      const pct = Math.round((i / (steps - 1)) * 100);
      ctx.fillStyle = val > 128 ? '#090D16' : '#F8FAFC';
      ctx.fillText(`${pct}%`, sx + stepW / 2, compHeight * 0.88);
      ctx.fillText(`${val}`, sx + stepW / 2, compHeight * 0.92);
    }
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = Math.max(3, minSide * 0.003);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, compWidth - ctx.lineWidth, compHeight - ctx.lineWidth);
  } else if (testPattern === 'pixel_checker') {
    // High-Contrast Fine Module & Seam Alignment Checkerboard
    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, compWidth, compHeight);
    const tile = Math.max(16, Math.round(Math.min(compWidth, compHeight) / 36));
    ctx.fillStyle = '#E2E8F0';
    for (let y = 0; y < compHeight; y += tile) {
      const rowIdx = Math.floor(y / tile);
      for (let x = (rowIdx % 2) * tile; x < compWidth; x += tile * 2) {
        ctx.fillRect(x, y, Math.min(tile, compWidth - x), Math.min(tile, compHeight - y));
      }
    }
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = Math.max(4, Math.min(compWidth, compHeight) * 0.004);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, compWidth - ctx.lineWidth, compHeight - ctx.lineWidth);
  } else if (testPattern === 'border') {
    ctx.fillStyle = '#0B0F19';
    ctx.fillRect(0, 0, compWidth, compHeight);
    const bw = Math.max(8, Math.min(compWidth, compHeight) * 0.008);
    // Diagonal alignment lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = Math.max(2, bw * 0.25);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(compWidth, compHeight);
    ctx.moveTo(compWidth, 0);
    ctx.lineTo(0, compHeight);
    ctx.stroke();
    // Outer high-visibility frame
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = bw;
    ctx.strokeRect(bw / 2, bw / 2, compWidth - bw, compHeight - bw);
  } else if (testPattern === 'bars') {
    const barColors = [
      '#E5E7EB', // 75% White
      '#FACC15', // Yellow
      '#22D3EE', // Cyan
      '#22C55E', // Green
      '#E879F9', // Magenta
      '#EF4444', // Red
      '#3B82F6', // Blue
      '#090D16', // Black
    ];
    const barW = compWidth / barColors.length;
    barColors.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(i * barW), 0, Math.ceil(barW), compHeight);
    });
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(4, Math.min(compWidth, compHeight) * 0.004);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, compWidth - ctx.lineWidth, compHeight - ctx.lineWidth);
  } else if (shouldDrawGridCells) {
    // 1. High-Density Offscreen Cached Base Grid Pipeline + Path2D Batched Strokes + Adaptive LOD (>2,000 cells)
    ctx.save();
    if (hasTestImage && colorCfg.showGridOverImage) {
      ctx.globalAlpha = Math.max(10, Math.min(100, colorCfg.gridOverlayOpacity ?? 45)) / 100;
    }

    const notesSig = (project.notes || [])
      .map((n) => `${n.id}:${n.scope}:${n.targetCellKey || ''}:${n.targetColor || ''}`)
      .join('~');

    const layoutSignature = [
      project.id,
      compWidth,
      compHeight,
      computed.cols,
      computed.rows,
      project.coloringMode,
      fillStyle,
      gridLineWidth,
      fontScale,
      project.focusedNoteId || '',
      project.divisionMode,
      project.gridRemainderAlign || 'start',
      project.showFractionalCellDimensions !== false ? '1' : '0',
      notesSig,
    ].join('|');

    const totalCells = computed.cells.length;
    const isHighDensity = totalCells > 1800;

    // Helper to draw a single cell onto the offscreen base grid canvas (used by both full build and <0.1ms dirty-rect patching)
    const drawSingleCellToBaseCtx = (
      bCtx: CanvasRenderingContext2D,
      cell: ComputedCell,
      isFocusedInSpotlight: boolean,
      strokeIndividualBorder: boolean
    ) => {
      const { x, y, width, height, effectiveColor, displayId, hasCustomColor } = cell;
      const minDim = Math.min(width, height);

      // Cell Fill
      if (fillStyle === 'badge') {
        bCtx.fillStyle = (cell.row + cell.col) % 2 === 0 ? '#0F1522' : '#151D2E';
        bCtx.fillRect(x, y, width, height);

        const badgeW = width * 0.74;
        const badgeH = height * 0.74;
        const bx = x + (width - badgeW) / 2;
        const by = y + (height - badgeH) / 2;

        bCtx.fillStyle = effectiveColor;
        bCtx.fillRect(bx, by, badgeW, badgeH);
      } else {
        bCtx.fillStyle = effectiveColor;
        bCtx.fillRect(x, y, width, height);
      }

      // Subtle inner frame for selected/colored squares
      if (hasCustomColor) {
        bCtx.strokeStyle =
          getContrastTextColor(effectiveColor) === '#090D16'
            ? 'rgba(9, 13, 22, 0.45)'
            : 'rgba(255, 255, 255, 0.65)';
        bCtx.lineWidth = Math.max(2, minDim * 0.03);
        const inset = bCtx.lineWidth / 2 + gridLineWidth;
        if (width > inset * 2 && height > inset * 2) {
          bCtx.strokeRect(x + inset, y + inset, width - inset * 2, height - inset * 2);
        }
      }

      // Adaptive Level-of-Detail (LOD) for coordinate labels on dense grids
      const shouldRenderLabel = minDim >= 14 || hasCustomColor || !isHighDensity;
      if (shouldRenderLabel) {
        const cx = x + width / 2;
        const cy = y + height / 2;
        const numFontSize = Math.max(
          isHighDensity ? 9 : 11,
          Math.min(width * 0.34, minDim * 0.32) * scaleFactor
        );
        const roundedFont = Math.round(numFontSize);
        bCtx.font = `700 ${roundedFont}px "Barlow Condensed", "JetBrains Mono", sans-serif`;

        if (fillStyle === 'plate') {
          const estTextW = isHighDensity
            ? displayId.length * numFontSize * 0.58
            : bCtx.measureText(displayId).width;
          const plateW = Math.min(
            width * 0.86,
            Math.max(minDim * 0.42, estTextW + numFontSize * 0.65)
          );
          const plateH = Math.min(height * 0.46, numFontSize * 1.32);
          const px = cx - plateW / 2;
          const py = cy - plateH / 2;

          bCtx.fillStyle = 'rgba(9, 13, 22, 0.82)';
          bCtx.fillRect(px, py, plateW, plateH);

          bCtx.fillStyle = '#FFFFFF';
          bCtx.fillText(displayId, cx, cy + numFontSize * 0.03);
        } else {
          bCtx.fillStyle = getContrastTextColor(effectiveColor);
          bCtx.fillText(displayId, cx, cy + numFontSize * 0.03);
        }

        // Fractional / Edge Cell Pixel Dimensions Readout
        if (
          !isHighDensity &&
          project.divisionMode === 'pixels' &&
          project.showFractionalCellDimensions !== false &&
          (Math.abs(width - computed.baseCellWidth) > 1 ||
            Math.abs(height - computed.baseCellHeight) > 1) &&
          minDim >= 36
        ) {
          const dimFont = Math.max(9, Math.min(14, Math.round(minDim * 0.16)));
          const dimLabel = `${width}×${height}`;
          bCtx.font = `700 ${dimFont}px "JetBrains Mono", monospace`;
          const dw = bCtx.measureText(dimLabel).width + 8;
          const dh = dimFont + 4;
          const dx = cx - dw / 2;
          const dy = y + height - dh - Math.max(3, gridLineWidth + 1);
          bCtx.fillStyle = 'rgba(9, 13, 22, 0.85)';
          bCtx.fillRect(dx, dy, dw, dh);
          bCtx.fillStyle = '#FEF08A';
          bCtx.fillText(dimLabel, cx, dy + dh / 2 + 0.5);
        }
      }

      // Dimming Veil over non-focused squares when a note is selected in the sidebar
      if (hasSpotlightFocus && !isFocusedInSpotlight) {
        bCtx.fillStyle = 'rgba(6, 9, 15, 0.86)';
        bCtx.fillRect(x, y, width, height);
      }

      // Crisp highlight frame around the focused note's squares
      if (hasSpotlightFocus && isFocusedInSpotlight) {
        bCtx.strokeStyle = '#F59E0B';
        bCtx.lineWidth = Math.max(4, minDim * 0.05);
        const inset = bCtx.lineWidth / 2;
        bCtx.strokeRect(x + inset, y + inset, width - inset * 2, height - inset * 2);
      }

      if (strokeIndividualBorder && gridLineWidth > 0) {
        bCtx.strokeStyle = 'rgba(9, 13, 22, 0.85)';
        bCtx.lineWidth = gridLineWidth;
        bCtx.strokeRect(x, y, width, height);
      }
    };

    let cachedEntry = baseGridLayerCache.get(project.id);
    const canTryDirtyPatch =
      cachedEntry &&
      cachedEntry.layoutSignature === layoutSignature &&
      cachedEntry.canvas.width === compWidth &&
      cachedEntry.canvas.height === compHeight &&
      !hasSpotlightFocus &&
      cachedEntry.cellColorsSnapshot.size === totalCells;

    let needsFullRebuild = !canTryDirtyPatch;
    const dirtyCells: ComputedCell[] = [];

    if (canTryDirtyPatch && cachedEntry) {
      for (let i = 0; i < totalCells; i++) {
        const cell = computed.cells[i];
        const prevColor = cachedEntry.cellColorsSnapshot.get(cell.key);
        const currSig = `${cell.effectiveColor}|${cell.hasCustomColor ? 1 : 0}`;
        if (prevColor !== currSig) {
          dirtyCells.push(cell);
          if (dirtyCells.length > 64) {
            needsFullRebuild = true;
            break;
          }
        }
      }
    }

    if (!needsFullRebuild && dirtyCells.length > 0 && cachedEntry) {
      // Fast Dirty-Rect Cell Patching: redraw ONLY the 1..64 modified cells in <0.1ms!
      const bCtx = cachedEntry.canvas.getContext('2d');
      if (bCtx) {
        bCtx.save();
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';
        for (const dCell of dirtyCells) {
          drawSingleCellToBaseCtx(bCtx, dCell, true, true);
          cachedEntry.cellColorsSnapshot.set(
            dCell.key,
            `${dCell.effectiveColor}|${dCell.hasCustomColor ? 1 : 0}`
          );
        }
        bCtx.restore();
      }
    } else if (needsFullRebuild) {
      const offCanvas = cachedEntry?.canvas || document.createElement('canvas');
      if (offCanvas.width !== compWidth) offCanvas.width = compWidth;
      if (offCanvas.height !== compHeight) offCanvas.height = compHeight;
      const bCtx = offCanvas.getContext('2d');

      let cFocusMinY = Infinity;
      let cFocusMaxY = -Infinity;
      const cFocusedDisplayIds: string[] = [];
      const nextColorSnapshot = new Map<string, string>();

      if (bCtx) {
        bCtx.clearRect(0, 0, compWidth, compHeight);
        const gridPath = gridLineWidth > 0 ? new Path2D() : null;

        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';

        for (let i = 0; i < totalCells; i++) {
          const cell = computed.cells[i];
          const isFocusedInSpotlight = !hasSpotlightFocus || focusedCellKeys!.has(cell.key);

          if (hasSpotlightFocus && isFocusedInSpotlight) {
            cFocusMinY = Math.min(cFocusMinY, cell.y);
            cFocusMaxY = Math.max(cFocusMaxY, cell.y + cell.height);
            cFocusedDisplayIds.push(cell.displayId);
          }

          drawSingleCellToBaseCtx(bCtx, cell, isFocusedInSpotlight, false);
          nextColorSnapshot.set(
            cell.key,
            `${cell.effectiveColor}|${cell.hasCustomColor ? 1 : 0}`
          );

          if (gridPath) {
            gridPath.rect(cell.x, cell.y, cell.width, cell.height);
          }
        }

        // Single batched stroke call for all grid cell borders
        if (gridPath && gridLineWidth > 0) {
          bCtx.strokeStyle = 'rgba(9, 13, 22, 0.85)';
          bCtx.lineWidth = gridLineWidth;
          bCtx.stroke(gridPath);
        }
      }

      cachedEntry = {
        layoutSignature,
        canvas: offCanvas,
        cellColorsSnapshot: nextColorSnapshot,
        focusMinY: cFocusMinY,
        focusMaxY: cFocusMaxY,
        focusedDisplayIds: cFocusedDisplayIds,
      };
      baseGridLayerCache.set(project.id, cachedEntry);
    }

    // Blit cached base grid layer in <0.3ms
    if (cachedEntry) {
      ctx.drawImage(cachedEntry.canvas, 0, 0);
      focusMinY = cachedEntry.focusMinY;
      focusMaxY = cachedEntry.focusMaxY;
      focusedDisplayIds.push(...cachedEntry.focusedDisplayIds);
    }

    // Dynamic Strobe Blinking Overlay (drawn only over active blinking cells)
    if (blinkingCellKeys && blinkingCellKeys.size > 0) {
      blinkingCellKeys.forEach((cellKey) => {
        const cell = computed.cellMap[cellKey];
        if (!cell) return;
        const { x, y, width, height, displayId } = cell;
        const minDim = Math.min(width, height);
        if (blinkPhaseOn) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(x, y, width, height);
          const cx = x + width / 2;
          const cy = y + height / 2;
          const numFontSize = Math.max(11, Math.min(width * 0.34, minDim * 0.32) * scaleFactor);
          ctx.font = `700 ${Math.round(numFontSize)}px "Barlow Condensed", "JetBrains Mono", sans-serif`;
          ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
          const plateW = Math.min(width * 0.86, Math.max(minDim * 0.42, displayId.length * numFontSize * 0.65));
          const plateH = Math.min(height * 0.46, numFontSize * 1.32);
          ctx.fillRect(cx - plateW / 2, cy - plateH / 2, plateW, plateH);
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(displayId, cx, cy + numFontSize * 0.03);
        }
        ctx.strokeStyle = blinkPhaseOn ? '#FEF08A' : '#EF4444';
        ctx.lineWidth = Math.max(4, minDim * 0.045);
        const inset = ctx.lineWidth / 2;
        ctx.strokeRect(x + inset, y + inset, width - inset * 2, height - inset * 2);
      });
    }

    ctx.restore();
  }

  // 1B. Render Color Calibration Swatches / Ramps if active
  if (colorCfg.swatchMode && colorCfg.swatchMode !== 'none') {
    renderColorSwatchOverlay(ctx, compWidth, compHeight, colorCfg);
  }

  // 2. Calibration Overlays
  const refStroke = Math.max(1.5, Math.min(compWidth, compHeight) * 0.0018);

  // 2.0A LED Cabinets & Modules Physical Engineering Overlay (when cabinetConfig.enabled is true)
  const cabCfg: CabinetAndPitchConfig = {
    ...DEFAULT_CABINET_CONFIG,
    ...(project.cabinetConfig || {}),
  };
  const physMetrics = computePhysicalWallMetrics(project);

  if (cabCfg.enabled && !hasSpotlightFocus) {
    const cabSignature = [
      project.id,
      compWidth,
      compHeight,
      physMetrics.pixelPitchMm,
      physMetrics.cabinetWidthPx,
      physMetrics.cabinetHeightPx,
      physMetrics.modulesColsPerCab,
      physMetrics.modulesRowsPerCab,
      cabCfg.showModuleGrid ? '1' : '0',
      cabCfg.showCabinetLabels ? '1' : '0',
      cabCfg.showDataCabling ? '1' : '0',
      cabCfg.cablingPattern || 'snake_h_tl',
      cabCfg.strokeColor || '#38BDF8',
      physMetrics.wattsPerCabinetMax,
    ].join('|');

    let cachedCab = cabinetLayerCache.get(project.id);
    if (
      !cachedCab ||
      cachedCab.signature !== cabSignature ||
      cachedCab.canvas.width !== compWidth ||
      cachedCab.canvas.height !== compHeight
    ) {
      const cabCanvas = cachedCab?.canvas || document.createElement('canvas');
      if (cabCanvas.width !== compWidth) cabCanvas.width = compWidth;
      if (cabCanvas.height !== compHeight) cabCanvas.height = compHeight;
      const cCtx = cabCanvas.getContext('2d');

      if (cCtx) {
        cCtx.clearRect(0, 0, compWidth, compHeight);
        cCtx.save();
        const cabW = physMetrics.cabinetWidthPx;
        const cabH = physMetrics.cabinetHeightPx;
        const cabColor = cabCfg.strokeColor || '#38BDF8';

        // 1. Inner Module Dashed Grid Lines (batched single path)
        if (cabCfg.showModuleGrid && (physMetrics.modulesColsPerCab > 1 || physMetrics.modulesRowsPerCab > 1)) {
          const modW = physMetrics.moduleWidthPx;
          const modH = physMetrics.moduleHeightPx;
          if (modW >= 16 && modH >= 16) {
            cCtx.strokeStyle = hexToRgba(cabColor, 0.42);
            cCtx.lineWidth = Math.max(1, refStroke * 0.65);
            cCtx.setLineDash([Math.max(4, refStroke * 3), Math.max(4, refStroke * 3)]);
            cCtx.beginPath();
            for (let mx = modW; mx < compWidth; mx += modW) {
              if (Math.abs(mx % cabW) < 0.5) continue;
              const rx = Math.round(mx);
              cCtx.moveTo(rx, 0);
              cCtx.lineTo(rx, compHeight);
            }
            for (let my = modH; my < compHeight; my += modH) {
              if (Math.abs(my % cabH) < 0.5) continue;
              const ry = Math.round(my);
              cCtx.moveTo(0, ry);
              cCtx.lineTo(compWidth, ry);
            }
            cCtx.stroke();
            cCtx.setLineDash([]);
          }
        }

        // 2. Outer Cabinet Boundaries (batched single path)
        cCtx.strokeStyle = hexToRgba(cabColor, 0.88);
        cCtx.lineWidth = Math.max(2, refStroke * 1.35);
        cCtx.beginPath();
        for (let cx = cabW; cx < compWidth; cx += cabW) {
          const rx = Math.round(cx);
          cCtx.moveTo(rx, 0);
          cCtx.lineTo(rx, compHeight);
        }
        for (let cy = cabH; cy < compHeight; cy += cabH) {
          const ry = Math.round(cy);
          cCtx.moveTo(0, ry);
          cCtx.lineTo(compWidth, ry);
        }
        cCtx.stroke();

        // 3. Cabinet Coordinate Labels (C01-01, C01-02...)
        if (cabCfg.showCabinetLabels && cabW >= 48 && cabH >= 36 && physMetrics.totalCabinets <= 2500) {
          const tagFont = Math.max(10, Math.min(18, Math.round(Math.min(cabW, cabH) * 0.11)));
          cCtx.font = `700 ${tagFont}px "JetBrains Mono", monospace`;
          cCtx.textAlign = 'left';
          cCtx.textBaseline = 'top';

          for (let r = 0; r < physMetrics.cabinetsRows; r++) {
            const y0 = r * cabH;
            for (let c = 0; c < physMetrics.cabinetsCols; c++) {
              const x0 = c * cabW;
              const label = `C${String(r + 1).padStart(2, '0')}-${String(c + 1).padStart(2, '0')}`;
              const tw = label.length * tagFont * 0.62 + 8;
              const th = tagFont + 5;
              if (x0 + tw + 4 <= compWidth && y0 + th + 4 <= compHeight) {
                cCtx.fillStyle = 'rgba(9, 13, 22, 0.86)';
                cCtx.fillRect(x0 + 3, y0 + 3, tw, th);
                cCtx.strokeStyle = hexToRgba(cabColor, 0.75);
                cCtx.lineWidth = 1;
                cCtx.strokeRect(x0 + 3, y0 + 3, tw, th);
                cCtx.fillStyle = cabColor;
                cCtx.fillText(label, x0 + 7, y0 + 5.5);
              }
            }
          }
        }

        // 4. Snake Data Cabling Topology Path
        if (cabCfg.showDataCabling && physMetrics.totalCabinets <= 2500) {
          const pattern = cabCfg.cablingPattern || 'snake_h_tl';
          const rows = physMetrics.cabinetsRows;
          const cols = physMetrics.cabinetsCols;
          const orderedCabs: { r: number; c: number; cx: number; cy: number }[] = [];

          if (pattern === 'snake_h_tl' || pattern === 'snake_h_tr') {
            for (let r = 0; r < rows; r++) {
              const goRight = pattern === 'snake_h_tl' ? r % 2 === 0 : r % 2 !== 0;
              if (goRight) {
                for (let c = 0; c < cols; c++) {
                  orderedCabs.push({
                    r,
                    c,
                    cx: Math.min(compWidth - 12, c * cabW + cabW / 2),
                    cy: Math.min(compHeight - 12, r * cabH + cabH / 2),
                  });
                }
              } else {
                for (let c = cols - 1; c >= 0; c--) {
                  orderedCabs.push({
                    r,
                    c,
                    cx: Math.min(compWidth - 12, c * cabW + cabW / 2),
                    cy: Math.min(compHeight - 12, r * cabH + cabH / 2),
                  });
                }
              }
            }
          } else {
            for (let c = 0; c < cols; c++) {
              const goDown = pattern === 'snake_v_tl' ? c % 2 === 0 : c % 2 !== 0;
              if (goDown) {
                for (let r = 0; r < rows; r++) {
                  orderedCabs.push({
                    r,
                    c,
                    cx: Math.min(compWidth - 12, c * cabW + cabW / 2),
                    cy: Math.min(compHeight - 12, r * cabH + cabH / 2),
                  });
                }
              } else {
                for (let r = rows - 1; r >= 0; r--) {
                  orderedCabs.push({
                    r,
                    c,
                    cx: Math.min(compWidth - 12, c * cabW + cabW / 2),
                    cy: Math.min(compHeight - 12, r * cabH + cabH / 2),
                  });
                }
              }
            }
          }

          const portPalette = ['#FACC15', '#38BDF8', '#10B981', '#F43F5E', '#A855F7', '#FB923C'];
          const maxPerPort = physMetrics.maxCabinetsPerPort;
          const lineW = Math.max(2.5, Math.min(cabW, cabH) * 0.032);
          const nodeR = Math.max(8, Math.min(20, Math.min(cabW, cabH) * 0.12));

          for (let i = 0; i < orderedCabs.length; i++) {
            const portIdx = Math.floor(i / maxPerPort);
            const portColor = portPalette[portIdx % portPalette.length];
            const curr = orderedCabs[i];
            const next = i + 1 < orderedCabs.length ? orderedCabs[i + 1] : null;
            const nextPortIdx = Math.floor((i + 1) / maxPerPort);

            if (next && nextPortIdx === portIdx) {
              cCtx.strokeStyle = 'rgba(9, 13, 22, 0.9)';
              cCtx.lineWidth = lineW + 3;
              cCtx.beginPath();
              cCtx.moveTo(curr.cx, curr.cy);
              cCtx.lineTo(next.cx, next.cy);
              cCtx.stroke();

              cCtx.strokeStyle = portColor;
              cCtx.lineWidth = lineW;
              cCtx.beginPath();
              cCtx.moveTo(curr.cx, curr.cy);
              cCtx.lineTo(next.cx, next.cy);
              cCtx.stroke();

              const mx = (curr.cx + next.cx) / 2;
              const my = (curr.cy + next.cy) / 2;
              const ang = Math.atan2(next.cy - curr.cy, next.cx - curr.cx);
              const aLen = Math.max(6, lineW * 2.4);
              cCtx.fillStyle = portColor;
              cCtx.beginPath();
              cCtx.moveTo(mx + Math.cos(ang) * aLen, my + Math.sin(ang) * aLen);
              cCtx.lineTo(
                mx - Math.cos(ang - 0.55) * aLen * 0.85,
                my - Math.sin(ang - 0.55) * aLen * 0.85
              );
              cCtx.lineTo(
                mx - Math.cos(ang + 0.55) * aLen * 0.85,
                my - Math.sin(ang + 0.55) * aLen * 0.85
              );
              cCtx.closePath();
              cCtx.fill();
            }
          }

          const seqFont = Math.max(9, Math.round(nodeR * 0.95));
          cCtx.font = `700 ${seqFont}px "JetBrains Mono", monospace`;
          cCtx.textAlign = 'center';
          cCtx.textBaseline = 'middle';

          for (let i = 0; i < orderedCabs.length; i++) {
            const portIdx = Math.floor(i / maxPerPort);
            const portColor = portPalette[portIdx % portPalette.length];
            const isPortStart = i % maxPerPort === 0;
            const pt = orderedCabs[i];

            cCtx.fillStyle = isPortStart ? portColor : 'rgba(9, 13, 22, 0.94)';
            cCtx.strokeStyle = portColor;
            cCtx.lineWidth = Math.max(1.5, lineW * 0.65);
            cCtx.fillRect(pt.cx - nodeR, pt.cy - nodeR, nodeR * 2, nodeR * 2);
            cCtx.strokeRect(pt.cx - nodeR, pt.cy - nodeR, nodeR * 2, nodeR * 2);

            cCtx.fillStyle = isPortStart ? '#090D16' : '#FFFFFF';
            cCtx.fillText(String(i + 1), pt.cx, pt.cy + 0.5);

            if (isPortStart && cabW >= 64) {
              const pTag = `P${portIdx + 1}`;
              const pw = pTag.length * seqFont * 0.72 + 8;
              const ph = seqFont + 4;
              cCtx.fillStyle = portColor;
              cCtx.fillRect(pt.cx - pw / 2, pt.cy - nodeR - ph - 2, pw, ph);
              cCtx.fillStyle = '#090D16';
              cCtx.fillText(pTag, pt.cx, pt.cy - nodeR - ph / 2 - 1.5);
            }
          }
        }

        cCtx.restore();
      }

      cachedCab = {
        signature: cabSignature,
        canvas: cabCanvas,
      };
      cabinetLayerCache.set(project.id, cachedCab);
    }

    // Blit cached LED cabinet & cabling layer in <0.2ms
    ctx.drawImage(cachedCab.canvas, 0, 0);
  }

  // 2.0B Processor Zones / Hardware Output Regions Overlay (with 650K px Port Load Telemetry)
  const procZones = project.processorZones || [];
  if (overlays.showProcessorZones !== false && procZones.length > 0 && !hasSpotlightFocus) {
    ctx.save();
    const minSide = Math.min(compWidth, compHeight);
    const zFont = Math.max(13, Math.round(minSide * 0.017));

    for (const zone of procZones) {
      if (zone.visible === false) continue;
      const zx = Math.max(0, Math.min(compWidth, zone.x));
      const zy = Math.max(0, Math.min(compHeight, zone.y));
      const zw = Math.max(16, Math.min(compWidth - zx, zone.width));
      const zh = Math.max(16, Math.min(compHeight - zy, zone.height));
      const zColor = zone.color || '#F59E0B';
      const zonePixels = zw * zh;
      const isOverPortLimit = zonePixels > 650_000;
      const portLoadPct = Math.round((zonePixels / 650_000) * 100);

      // Subtle zone tint
      ctx.fillStyle = hexToRgba(zColor, 0.07);
      ctx.fillRect(zx, zy, zw, zh);

      // High-contrast dark halo + colored zone border
      const zStroke = Math.max(3, refStroke * 1.8);
      ctx.strokeStyle = 'rgba(9, 13, 22, 0.9)';
      ctx.lineWidth = zStroke + 3;
      ctx.strokeRect(zx + zStroke / 2, zy + zStroke / 2, zw - zStroke, zh - zStroke);

      ctx.strokeStyle = isOverPortLimit ? '#EF4444' : zColor;
      ctx.lineWidth = zStroke;
      ctx.strokeRect(zx + zStroke / 2, zy + zStroke / 2, zw - zStroke, zh - zStroke);

      // Corner bracket accents inside zone
      const cLen = Math.min(Math.min(zw, zh) * 0.18, Math.max(24, minSide * 0.04));
      const bIn = zStroke * 1.8;
      ctx.lineWidth = Math.max(3, zStroke * 1.15);
      ctx.beginPath();
      ctx.moveTo(zx + bIn, zy + bIn + cLen);
      ctx.lineTo(zx + bIn, zy + bIn);
      ctx.lineTo(zx + bIn + cLen, zy + bIn);

      ctx.moveTo(zx + zw - bIn - cLen, zy + bIn);
      ctx.lineTo(zx + zw - bIn, zy + bIn);
      ctx.lineTo(zx + zw - bIn, zy + bIn + cLen);

      ctx.moveTo(zx + bIn, zy + zh - bIn - cLen);
      ctx.lineTo(zx + bIn, zy + zh - bIn);
      ctx.lineTo(zx + bIn + cLen, zy + zh - bIn);

      ctx.moveTo(zx + zw - bIn - cLen, zy + zh - bIn);
      ctx.lineTo(zx + zw - bIn, zy + zh - bIn);
      ctx.lineTo(zx + zw - bIn, zy + zh - bIn - cLen);
      ctx.stroke();

      // Processor Zone Badge at top-left of zone (includes 650K px port load status)
      const portPrefix = zone.portLabel ? `[${zone.portLabel}] ` : '';
      const loadStatus = isOverPortLimit
        ? `⚠ ${(zonePixels / 1000).toFixed(0)}K px (${portLoadPct}% > 650K)`
        : `${(zonePixels / 1000).toFixed(0)}K px (${portLoadPct}%)`;
      const badgeLabel = `${portPrefix}${zone.name}  ·  ${zw}×${zh}px @ (${zx},${zy})  ·  ${loadStatus}`;
      ctx.font = `700 ${zFont}px "Cairo", "JetBrains Mono", sans-serif`;
      const tm = ctx.measureText(badgeLabel);
      const bw = Math.min(zw - 16, tm.width + 20);
      const bh = zFont + 12;
      const bx = zx + Math.max(8, zStroke * 2);
      const by = zy + Math.max(8, zStroke * 2);

      if (bw > 40 && zh > bh + 12) {
        ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = isOverPortLimit ? '#EF4444' : zColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = isOverPortLimit ? '#FCA5A5' : '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeLabel, bx + bw / 2, by + bh / 2 + 1, bw - 10);
      }
    }

    ctx.restore();
  }

  // 2.0 Broadcast Safe Areas (Action Safe 90% & Title Safe 80%)
  if (overlays.safeMargins) {
    ctx.save();
    const minSide = Math.min(compWidth, compHeight);
    const labelFont = Math.max(11, Math.round(minSide * 0.013));
    ctx.font = `700 ${labelFont}px "JetBrains Mono", monospace`;

    const actionPct = Math.max(50, Math.min(99, overlays.safeActionPct ?? 90));
    const titlePct = Math.max(40, Math.min(95, overlays.safeTitlePct ?? 80));

    // Action Safe
    const aw = compWidth * (actionPct / 100);
    const ah = compHeight * (actionPct / 100);
    const ax = (compWidth - aw) / 2;
    const ay = (compHeight - ah) / 2;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = Math.max(2, refStroke * 1.2);
    ctx.setLineDash([refStroke * 5, refStroke * 3]);
    ctx.strokeRect(ax, ay, aw, ah);

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
    const actTag = `ACTION SAFE ${actionPct}%`;
    const actW = ctx.measureText(actTag).width + 12;
    ctx.fillRect(ax + 6, ay + 6, actW, labelFont + 8);
    ctx.fillStyle = '#38BDF8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(actTag, ax + 12, ay + 10);

    // Title Safe
    const tw = compWidth * (titlePct / 100);
    const th = compHeight * (titlePct / 100);
    const tx = (compWidth - tw) / 2;
    const ty = (compHeight - th) / 2;
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
    ctx.lineWidth = Math.max(2, refStroke * 1.1);
    ctx.setLineDash([refStroke * 3, refStroke * 3]);
    ctx.strokeRect(tx, ty, tw, th);

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
    const titTag = `TITLE SAFE ${titlePct}%`;
    const titW = ctx.measureText(titTag).width + 12;
    ctx.fillRect(tx + 6, ty + 6, titW, labelFont + 8);
    ctx.fillStyle = '#FACC15';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(titTag, tx + 12, ty + 10);

    ctx.restore();
  }

  // 2A. Center Crosshair Lines & Center Circle (with Offset X/Y, Size, Stroke, Fill & Opacity controls)
  const centerCfg = {
    ...DEFAULT_CENTER_CONFIG,
    ...(project.centerConfig || {}),
  };

  if (overlays.centerCrosshair !== false && (centerCfg.showLines || centerCfg.showCircle)) {
    ctx.save();
    const midX = Math.max(0, Math.min(compWidth, compWidth / 2 + (centerCfg.offsetX || 0)));
    const midY = Math.max(0, Math.min(compHeight, compHeight / 2 + (centerCfg.offsetY || 0)));
    const minSide = Math.min(compWidth, compHeight);
    const pct = Math.max(4, Math.min(150, centerCfg.circleSizePct || 44)) / 100;
    const isEllipse = centerCfg.circleAspectMode === 'ellipse';
    const radiusX = isEllipse ? (compWidth * pct) / 2 : (minSide * pct) / 2;
    const radiusY = isEllipse ? (compHeight * pct) / 2 : (minSide * pct) / 2;

    const strokeW = Math.max(0, centerCfg.strokeWidth ?? 3);
    const rawStrokeAlpha = Math.max(0, Math.min(100, centerCfg.strokeOpacity ?? 90)) / 100;
    const effectiveStrokeAlpha = hasSpotlightFocus ? rawStrokeAlpha * 0.35 : rawStrokeAlpha;
    const strokeRgba = hexToRgba(centerCfg.strokeColor || '#FFFFFF', effectiveStrokeAlpha);

    // Circle / Ellipse Fill (if enabled)
    if (centerCfg.showCircle && centerCfg.fillEnabled && (centerCfg.fillOpacity ?? 0) > 0) {
      const rawFillAlpha = Math.max(0, Math.min(100, centerCfg.fillOpacity ?? 20)) / 100;
      const effectiveFillAlpha = hasSpotlightFocus ? rawFillAlpha * 0.35 : rawFillAlpha;
      ctx.fillStyle = hexToRgba(centerCfg.fillColor || '#F59E0B', effectiveFillAlpha);
      ctx.beginPath();
      ctx.ellipse(midX, midY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center Crosshair Lines (Horizontal & Vertical) + Optional Graduation Ticks
    if (centerCfg.showLines && strokeW > 0 && effectiveStrokeAlpha > 0) {
      ctx.strokeStyle = `rgba(9, 13, 22, ${Math.min(0.85, effectiveStrokeAlpha * 0.85).toFixed(2)})`;
      ctx.lineWidth = strokeW + Math.max(2, strokeW * 0.6);
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(compWidth, midY);
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, compHeight);
      ctx.stroke();

      ctx.strokeStyle = strokeRgba;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(compWidth, midY);
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, compHeight);
      ctx.stroke();

      if (centerCfg.showCrosshairTicks) {
        const minorLen = Math.max(5, strokeW * 2.2);
        const majorLen = Math.max(10, strokeW * 4.2);
        ctx.lineWidth = Math.max(1.5, strokeW * 0.7);
        ctx.strokeStyle = strokeRgba;
        ctx.beginPath();
        for (let dx = 50; midX + dx < compWidth || midX - dx > 0; dx += 50) {
          const tickHalf = dx % 100 === 0 ? majorLen : minorLen;
          if (midX + dx < compWidth) {
            ctx.moveTo(midX + dx, midY - tickHalf);
            ctx.lineTo(midX + dx, midY + tickHalf);
          }
          if (midX - dx > 0) {
            ctx.moveTo(midX - dx, midY - tickHalf);
            ctx.lineTo(midX - dx, midY + tickHalf);
          }
        }
        for (let dy = 50; midY + dy < compHeight || midY - dy > 0; dy += 50) {
          const tickHalf = dy % 100 === 0 ? majorLen : minorLen;
          if (midY + dy < compHeight) {
            ctx.moveTo(midX - tickHalf, midY + dy);
            ctx.lineTo(midX + tickHalf, midY + dy);
          }
          if (midY - dy > 0) {
            ctx.moveTo(midX - tickHalf, midY - dy);
            ctx.lineTo(midX + tickHalf, midY - dy);
          }
        }
        ctx.stroke();
      }
    }

    // Center Circle / Ellipse Stroke
    if (centerCfg.showCircle && strokeW > 0 && effectiveStrokeAlpha > 0) {
      ctx.strokeStyle = `rgba(9, 13, 22, ${Math.min(0.85, effectiveStrokeAlpha * 0.85).toFixed(2)})`;
      ctx.lineWidth = strokeW + Math.max(2, strokeW * 0.6);
      ctx.beginPath();
      ctx.ellipse(midX, midY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = strokeRgba;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.ellipse(midX, midY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 2B. Custom Named Horizontal & Vertical Rulers + Automatic Distance Measurements
  const rulers = project.rulers || [];
  if (rulers.length > 0 && overlays.showRulers !== false) {
    const minSide = Math.min(compWidth, compHeight);
    for (const ruler of rulers) {
      if (ruler.visible === false) continue;

      ctx.save();
      const isHoriz = ruler.orientation === 'horizontal';
      const pos = isHoriz
        ? Math.max(0, Math.min(compHeight, ruler.positionPx))
        : Math.max(0, Math.min(compWidth, ruler.positionPx));

      const rawAlpha = Math.max(10, Math.min(100, ruler.opacity ?? 95)) / 100;
      const effectiveAlpha = hasSpotlightFocus ? rawAlpha * 0.45 : rawAlpha;
      const rColor = ruler.color || '#38BDF8';
      const rStrokeW = Math.max(1, ruler.strokeWidth || 3);

      // Dark halo underneath for high contrast on any square color
      ctx.strokeStyle = `rgba(9, 13, 22, ${Math.min(0.9, effectiveAlpha).toFixed(2)})`;
      ctx.lineWidth = rStrokeW + 3;
      if (ruler.dashed) {
        ctx.setLineDash([rStrokeW * 5, rStrokeW * 3]);
      }
      ctx.beginPath();
      if (isHoriz) {
        ctx.moveTo(0, pos);
        ctx.lineTo(compWidth, pos);
      } else {
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, compHeight);
      }
      ctx.stroke();

      // Main Ruler Line
      ctx.strokeStyle = hexToRgba(rColor, effectiveAlpha);
      ctx.lineWidth = rStrokeW;
      ctx.beginPath();
      if (isHoriz) {
        ctx.moveTo(0, pos);
        ctx.lineTo(compWidth, pos);
      } else {
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, compHeight);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Optional Ruler Graduation Ticks (every 50px minor, 100px major)
      if (ruler.showTicks !== false) {
        const maxLen = isHoriz ? compWidth : compHeight;
        const minorTick = Math.max(5, rStrokeW * 2);
        const majorTick = Math.max(10, rStrokeW * 3.8);
        const tickFont = Math.max(10, Math.round(minSide * 0.012));

        ctx.strokeStyle = hexToRgba(rColor, effectiveAlpha);
        ctx.fillStyle = hexToRgba(rColor, effectiveAlpha);
        ctx.lineWidth = Math.max(1.5, rStrokeW * 0.65);
        ctx.font = `700 ${tickFont}px "JetBrains Mono", monospace`;

        for (let tPx = 50; tPx < maxLen; tPx += 50) {
          const isMajor = tPx % 100 === 0;
          const tSize = isMajor ? majorTick : minorTick;
          ctx.beginPath();
          if (isHoriz) {
            ctx.moveTo(tPx, pos - tSize);
            ctx.lineTo(tPx, pos + tSize);
          } else {
            ctx.moveTo(pos - tSize, tPx);
            ctx.lineTo(pos + tSize, tPx);
          }
          ctx.stroke();

          if (isMajor && tPx % 200 === 0) {
            if (isHoriz) {
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(String(tPx), tPx, pos - tSize - 3);
            } else {
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(tPx), pos + tSize + 4, tPx);
            }
          }
        }
      }

      // Ruler Name + Coordinate Sharp Badge
      const labelName = (ruler.name || '').trim() || (isHoriz ? 'مسطرة أفقية' : 'مسطرة عمودية');
      const coordTag = isHoriz ? `Y: ${Math.round(pos)}px` : `X: ${Math.round(pos)}px`;
      const lockSuffix = !isLiveOutput && ruler.locked ? '  [مقفلة]' : '';
      const fullBadgeText = `${labelName}  ·  ${coordTag}${lockSuffix}`;

      const badgeFontSize = Math.max(13, Math.round(minSide * 0.018));
      ctx.font = `700 ${badgeFontSize}px "Cairo", "JetBrains Mono", sans-serif`;
      const textMetrics = ctx.measureText(fullBadgeText);
      const bPadX = Math.max(12, badgeFontSize * 0.75);
      const bPadY = Math.max(6, badgeFontSize * 0.42);
      const bW = textMetrics.width + bPadX * 2;
      const bH = badgeFontSize + bPadY * 2;

      let bx: number;
      let by: number;
      if (isHoriz) {
        bx = Math.max(16, Math.min(compWidth - bW - 16, 24));
        by = pos >= bH + 14 ? pos - bH - 8 : pos + 8;
      } else {
        bx = pos + bW + 24 <= compWidth ? pos + 10 : pos - bW - 10;
        by = 20;
      }

      ctx.fillStyle = `rgba(9, 13, 22, ${Math.min(0.92, effectiveAlpha).toFixed(2)})`;
      ctx.fillRect(bx, by, bW, bH);

      ctx.strokeStyle = hexToRgba(rColor, effectiveAlpha);
      ctx.lineWidth = Math.max(2, rStrokeW * 0.75);
      ctx.strokeRect(bx, by, bW, bH);

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fullBadgeText, bx + bW / 2, by + bH / 2 + 1);

      ctx.restore();
    }

    // 2B-2. Automatic Distance Measurements Between Parallel Rulers (ΔX / ΔY)
    if (overlays.showRulerDistances !== false && !hasSpotlightFocus) {
      const visibleHoriz = rulers
        .filter((r) => r.visible !== false && r.orientation === 'horizontal')
        .sort((a, b) => a.positionPx - b.positionPx);
      const visibleVert = rulers
        .filter((r) => r.visible !== false && r.orientation === 'vertical')
        .sort((a, b) => a.positionPx - b.positionPx);

      const distFontSize = Math.max(12, Math.round(minSide * 0.0155));
      ctx.save();
      ctx.font = `700 ${distFontSize}px "JetBrains Mono", "Cairo", monospace`;

      // Horizontal ruler pair distances (ΔY)
      for (let i = 0; i < visibleHoriz.length - 1; i++) {
        const y1 = Math.max(0, Math.min(compHeight, visibleHoriz[i].positionPx));
        const y2 = Math.max(0, Math.min(compHeight, visibleHoriz[i + 1].positionPx));
        const deltaY = Math.round(y2 - y1);
        if (deltaY < 8) continue;

        const pctY = ((deltaY / compHeight) * 100).toFixed(1);
        const label = `↕ ΔY: ${deltaY}px (${pctY}%)`;
        const measureX = Math.round(compWidth * 0.82);
        const midY = (y1 + y2) / 2;

        // Vertical connector line
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
        ctx.lineWidth = Math.max(2, refStroke * 1.2);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(measureX, y1);
        ctx.lineTo(measureX, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        const tm = ctx.measureText(label);
        const bw = tm.width + 18;
        const bh = distFontSize + 10;
        const bx = Math.min(compWidth - bw - 12, Math.max(12, measureX - bw / 2));
        const by = midY - bh / 2;

        ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = '#FEF08A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + bw / 2, by + bh / 2 + 1);
      }

      // Vertical ruler pair distances (ΔX)
      for (let i = 0; i < visibleVert.length - 1; i++) {
        const x1 = Math.max(0, Math.min(compWidth, visibleVert[i].positionPx));
        const x2 = Math.max(0, Math.min(compWidth, visibleVert[i + 1].positionPx));
        const deltaX = Math.round(x2 - x1);
        if (deltaX < 8) continue;

        const pctX = ((deltaX / compWidth) * 100).toFixed(1);
        const label = `↔ ΔX: ${deltaX}px (${pctX}%)`;
        const measureY = Math.round(compHeight * 0.86);
        const midX = (x1 + x2) / 2;

        // Horizontal connector line
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = Math.max(2, refStroke * 1.2);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, measureY);
        ctx.lineTo(x2, measureY);
        ctx.stroke();
        ctx.setLineDash([]);

        const tm = ctx.measureText(label);
        const bw = tm.width + 18;
        const bh = distFontSize + 10;
        const bx = Math.min(compWidth - bw - 12, Math.max(12, midX - bw / 2));
        const by = measureY - bh / 2;

        ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = '#E0F2FE';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + bw / 2, by + bh / 2 + 1);
      }

      ctx.restore();
    }
  }

  // 2C. Always-On Note Labels Over Each Note's Group of Squares (when showAllNoteLabels is active)
  if (
    overlays.showAllNoteLabels &&
    !hasSpotlightFocus &&
    testPattern === 'none' &&
    Array.isArray(project.notes) &&
    project.notes.length > 0
  ) {
    ctx.save();
    const minSide = Math.min(compWidth, compHeight);
    const noteScale = Math.max(0.6, Math.min(2.0, (overlays.noteFontScalePct ?? 100) / 100));
    const labelFont = Math.max(12, Math.round(minSide * 0.022 * noteScale));
    const mergeBorders = overlays.mergeNoteGroupBorders !== false;

    for (const note of project.notes) {
      const keys = getNoteMatchingCellKeys(note, computed.cells);
      if (keys.length === 0) continue;

      const keySet = new Set(keys);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const k of keys) {
        const c = computed.cellMap[k];
        if (!c) continue;
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.width);
        maxY = Math.max(maxY, c.y + c.height);
      }
      if (!Number.isFinite(minX)) continue;

      const groupColor =
        note.targetColor ||
        computed.cellMap[note.targetCellKey || '']?.effectiveColor ||
        '#FFFFFF';

      const borderW = Math.max(3, minSide * 0.0042);
      ctx.strokeStyle = groupColor;
      ctx.lineWidth = borderW;

      if (mergeBorders) {
        // Draw contiguous outer perimeter segments around adjacent cells in this note group
        ctx.beginPath();
        for (const k of keys) {
          const c = computed.cellMap[k];
          if (!c) continue;
          const topKey = `${c.row - 1}-${c.col}`;
          const bottomKey = `${c.row + 1}-${c.col}`;
          const leftKey = `${c.row}-${c.col - 1}`;
          const rightKey = `${c.row}-${c.col + 1}`;
          const inset = borderW / 2;

          if (!keySet.has(topKey)) {
            ctx.moveTo(c.x, c.y + inset);
            ctx.lineTo(c.x + c.width, c.y + inset);
          }
          if (!keySet.has(bottomKey)) {
            ctx.moveTo(c.x, c.y + c.height - inset);
            ctx.lineTo(c.x + c.width, c.y + c.height - inset);
          }
          if (!keySet.has(leftKey)) {
            ctx.moveTo(c.x + inset, c.y);
            ctx.lineTo(c.x + inset, c.y + c.height);
          }
          if (!keySet.has(rightKey)) {
            ctx.moveTo(c.x + c.width - inset, c.y);
            ctx.lineTo(c.x + c.width - inset, c.y + c.height);
          }
        }
        ctx.stroke();
      } else {
        // Bounding box outline around the entire group
        ctx.strokeRect(minX + 2, minY + 2, maxX - minX - 4, maxY - minY - 4);
      }

      // Sharp Note Label Tag at top-center of the group
      ctx.font = `700 ${labelFont}px "Cairo", "Plus Jakarta Sans", sans-serif`;
      const textMetrics = ctx.measureText(note.text);
      const tagW = textMetrics.width + labelFont * 1.4;
      const tagH = labelFont * 1.65;
      const groupCenterX = (minX + maxX) / 2;
      const tx = Math.max(8, Math.min(compWidth - tagW - 8, groupCenterX - tagW / 2));
      const ty = Math.max(8, Math.min(compHeight - tagH - 8, minY + 8));

      ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
      ctx.fillRect(tx, ty, tagW, tagH);
      ctx.strokeStyle = groupColor;
      ctx.lineWidth = Math.max(2, minSide * 0.003);
      ctx.strokeRect(tx, ty, tagW, tagH);

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(note.text, tx + tagW / 2, ty + tagH / 2 + 1);
    }

    ctx.restore();
  }

  // 3. Large Clear Note Banner in the Dimmed Area ONLY when a Note is Selected from the Sidebar
  if (hasSpotlightFocus && activeFocusedNote) {
    ctx.save();
    const minCanvasSide = Math.min(compWidth, compHeight);
    const noteScale = Math.max(0.6, Math.min(2.0, (overlays.noteFontScalePct ?? 100) / 100));
    const titleFontSize = Math.max(22, Math.round(minCanvasSide * 0.052 * noteScale));
    const subFontSize = Math.max(13, Math.round(titleFontSize * 0.46));

    ctx.font = `700 ${titleFontSize}px "Cairo", "Plus Jakarta Sans", sans-serif`;
    const mainText = activeFocusedNote.text;
    const mainMetrics = ctx.measureText(mainText);

    const coordsSummary =
      focusedDisplayIds.length <= 12
        ? focusedDisplayIds.join(' · ')
        : `${focusedDisplayIds.slice(0, 12).join(' · ')} (+${focusedDisplayIds.length - 12})`;

    ctx.font = `700 ${subFontSize}px "JetBrains Mono", "Cairo", monospace`;
    const subMetrics = ctx.measureText(coordsSummary);

    const padX = Math.max(36, titleFontSize * 1.2);
    const padY = Math.max(20, titleFontSize * 0.65);
    const boxW = Math.min(
      compWidth * 0.88,
      Math.max(mainMetrics.width, subMetrics.width) + padX * 2
    );
    const boxH = titleFontSize + subFontSize + padY * 1.8;

    // Place the banner in whichever dimmed area (top or bottom) has more free vertical space
    const spaceTop = Number.isFinite(focusMinY) ? focusMinY : compHeight / 2;
    const spaceBottom = Number.isFinite(focusMaxY) ? compHeight - focusMaxY : compHeight / 2;

    let boxCenterY: number;
    if (spaceBottom >= spaceTop && spaceBottom > boxH + 20) {
      boxCenterY = focusMaxY + spaceBottom / 2;
    } else if (spaceTop > boxH + 20) {
      boxCenterY = spaceTop / 2;
    } else {
      boxCenterY = compHeight - boxH / 2 - minCanvasSide * 0.05;
    }

    const bx = (compWidth - boxW) / 2;
    const by = Math.max(16, Math.min(compHeight - boxH - 16, boxCenterY - boxH / 2));

    // Deep high-contrast banner background in the shaded area (0px sharp corners)
    ctx.fillStyle = 'rgba(11, 15, 25, 0.95)';
    ctx.fillRect(bx, by, boxW, boxH);

    const noteColor = activeFocusedNote.targetColor || '#F59E0B';
    ctx.strokeStyle = noteColor;
    ctx.lineWidth = Math.max(3, minCanvasSide * 0.004);
    ctx.strokeRect(bx, by, boxW, boxH);

    // Main Note Phrase
    ctx.font = `700 ${titleFontSize}px "Cairo", "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mainText, compWidth / 2, by + padY * 0.8 + titleFontSize * 0.48);

    // Target Square Coordinates Subtitle
    ctx.font = `700 ${subFontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#F59E0B';
    ctx.fillText(
      `[ ${coordsSummary} ]`,
      compWidth / 2,
      by + boxH - padY * 0.55 - subFontSize * 0.35
    );

    ctx.restore();
  }

  // Hover outline in editor
  if (!isLiveOutput && hoveredCellKey && computed.cellMap[hoveredCellKey]) {
    const c = computed.cellMap[hoveredCellKey];
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = Math.max(2, refStroke * 1.5);
    ctx.strokeRect(c.x + 2, c.y + 2, c.width - 4, c.height - 4);
    ctx.restore();
  }

  // Marquee Box Selection rectangle in editor
  if (!isLiveOutput && marqueeRect) {
    ctx.save();
    const rx = Math.min(marqueeRect.x1, marqueeRect.x2);
    const ry = Math.min(marqueeRect.y1, marqueeRect.y2);
    const rw = Math.abs(marqueeRect.x2 - marqueeRect.x1);
    const rh = Math.abs(marqueeRect.y2 - marqueeRect.y1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(2, refStroke * 1.5);
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  }

  // 3B. Freehand Pen & Organic Shapes Layer Above Grid Tiles
  const savedDrawings =
    overlays.showDrawings !== false && Array.isArray(project.drawings) ? project.drawings : [];
  const allDrawingsToRender: (FreehandDrawingItem & { isLassoTiles?: boolean; isDraft?: boolean })[] = [
    ...savedDrawings,
    ...(activeDraftDrawing && !isLiveOutput
      ? [{ ...activeDraftDrawing, isDraft: true }]
      : []),
  ];

  if (allDrawingsToRender.length > 0) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const item of allDrawingsToRender) {
      const pts = item.points || [];
      if (pts.length === 0) continue;
      const dColor = item.color || '#38BDF8';
      const baseStroke = Math.max(2, (item.strokeWidth || 4) * Math.max(0.85, refStroke * 0.55));
      const isClosedPolygon = item.mode === 'polygon' || Boolean(item.closed) || Boolean(item.isLassoTiles);

      if (item.mode === 'ellipse' && pts.length >= 2) {
        const p0 = pts[0];
        const p1 = pts[pts.length - 1];
        const cx = (p0.x + p1.x) / 2;
        const cy = (p0.y + p1.y) / 2;
        const rx = Math.max(2, Math.abs(p1.x - p0.x) / 2);
        const ry = Math.max(2, Math.abs(p1.y - p0.y) / 2);

        // Translucent fill
        ctx.fillStyle = hexToRgba(dColor, item.fillOpacity ?? 0.2);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        // Dark outer contrast halo
        ctx.strokeStyle = 'rgba(9, 13, 22, 0.85)';
        ctx.lineWidth = baseStroke + 3;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Main colored stroke
        ctx.strokeStyle = dColor;
        ctx.lineWidth = baseStroke;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (item.mode === 'arrow' && pts.length >= 2) {
        const p0 = pts[0];
        const p1 = pts[pts.length - 1];
        const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        if (dist > 4) {
          const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
          const headLen = Math.max(14, baseStroke * 3.8);

          // Dark halo
          ctx.strokeStyle = 'rgba(9, 13, 22, 0.85)';
          ctx.lineWidth = baseStroke + 3;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();

          // Main line
          ctx.strokeStyle = dColor;
          ctx.lineWidth = baseStroke;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();

          // Arrowhead
          ctx.fillStyle = dColor;
          ctx.strokeStyle = 'rgba(9, 13, 22, 0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(
            p1.x - headLen * Math.cos(angle - Math.PI / 6),
            p1.y - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            p1.x - headLen * Math.cos(angle + Math.PI / 6),
            p1.y - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (pts.length >= 2) {
        const traceSmoothFreehand = (closeShape: boolean) => {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 1; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
          }
          const last = pts[pts.length - 1];
          ctx.lineTo(last.x, last.y);
          if (closeShape && pts.length >= 3) {
            ctx.closePath();
          }
        };

        if (isClosedPolygon && pts.length >= 3) {
          ctx.fillStyle = hexToRgba(dColor, item.isLassoTiles ? 0.25 : item.fillOpacity ?? 0.22);
          traceSmoothFreehand(true);
          ctx.fill();
        }

        // Dark outer contrast halo
        ctx.strokeStyle = 'rgba(9, 13, 22, 0.85)';
        ctx.lineWidth = baseStroke + 3;
        if (item.isLassoTiles) {
          ctx.setLineDash([8, 5]);
        }
        traceSmoothFreehand(isClosedPolygon);
        ctx.stroke();

        // Outer subtle glow
        ctx.strokeStyle = hexToRgba(dColor, 0.35);
        ctx.lineWidth = baseStroke + 6;
        traceSmoothFreehand(isClosedPolygon);
        ctx.stroke();

        // Main colored vector stroke
        ctx.strokeStyle = dColor;
        ctx.lineWidth = baseStroke;
        traceSmoothFreehand(isClosedPolygon);
        ctx.stroke();
        ctx.setLineDash([]);

        // Live tile border preview when dragging in lasso_tiles mode (without any measurement badges)
        if (item.isLassoTiles && pts.length >= 3) {
          for (const c of computed.cells) {
            const cellCx = c.x + c.width / 2;
            const cellCy = c.y + c.height / 2;
            if (isPointInPolygon(cellCx, cellCy, pts)) {
              ctx.strokeStyle = '#FACC15';
              ctx.lineWidth = Math.max(2, refStroke * 1.4);
              ctx.strokeRect(c.x + 2, c.y + 2, c.width - 4, c.height - 4);
            }
          }
        }
      }
    }

    ctx.restore();
  }

  // Live Director Optical Laser Pointer, Smooth Tapered Trail & Laser Line Modes
  if (laser && laser.active) {
    ctx.save();
    const minSide = Math.min(compWidth, compHeight);
    const lr = Math.max(12, minSide * 0.016);
    const beamUnit = Math.max(1.5, minSide * 0.0022);
    const lColor = laser.color || '#FF2424';
    const lMode = laser.laserMode || 'free';

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Subtle Target Square Frame in chosen Laser Color
    if (laser.cellKey && computed.cellMap[laser.cellKey]) {
      const targetCell = computed.cellMap[laser.cellKey];
      ctx.strokeStyle = 'rgba(9, 13, 22, 0.75)';
      ctx.lineWidth = Math.max(4, beamUnit * 2.6);
      ctx.strokeRect(
        targetCell.x + 2,
        targetCell.y + 2,
        targetCell.width - 4,
        targetCell.height - 4
      );

      ctx.strokeStyle = hexToRgba(lColor, 0.92);
      ctx.lineWidth = Math.max(2, beamUnit * 1.4);
      ctx.strokeRect(
        targetCell.x + 2,
        targetCell.y + 2,
        targetCell.width - 4,
        targetCell.height - 4
      );
    }

    // 2. Crosshair Mode: Full-screen Horizontal & Vertical Laser Alignment Lines
    if (lMode === 'crosshair') {
      // Dark contrast halo so White/Yellow laser is visible on any background
      ctx.strokeStyle = 'rgba(9, 13, 22, 0.65)';
      ctx.lineWidth = Math.max(5, beamUnit * 3.2);
      ctx.beginPath();
      ctx.moveTo(0, laser.y);
      ctx.lineTo(compWidth, laser.y);
      ctx.moveTo(laser.x, 0);
      ctx.lineTo(laser.x, compHeight);
      ctx.stroke();

      // Colored outer glow
      ctx.strokeStyle = hexToRgba(lColor, 0.35);
      ctx.lineWidth = Math.max(8, beamUnit * 5);
      ctx.beginPath();
      ctx.moveTo(0, laser.y);
      ctx.lineTo(compWidth, laser.y);
      ctx.moveTo(laser.x, 0);
      ctx.lineTo(laser.x, compHeight);
      ctx.stroke();

      // Main laser axis line
      ctx.strokeStyle = lColor;
      ctx.lineWidth = Math.max(2, beamUnit * 1.4);
      ctx.beginPath();
      ctx.moveTo(0, laser.y);
      ctx.lineTo(compWidth, laser.y);
      ctx.moveTo(laser.x, 0);
      ctx.lineTo(laser.x, compHeight);
      ctx.stroke();
    }

    // 3. Drawn Continuous Laser Line (when holding left-click & dragging in 'free' mode)
    const drawn = laser.drawnStroke || [];
    if (lMode === 'free' && drawn.length >= 2) {
      const traceSmoothPath = () => {
        ctx.beginPath();
        ctx.moveTo(drawn[0].x, drawn[0].y);
        for (let i = 1; i < drawn.length - 1; i++) {
          const xc = (drawn[i].x + drawn[i + 1].x) / 2;
          const yc = (drawn[i].y + drawn[i + 1].y) / 2;
          ctx.quadraticCurveTo(drawn[i].x, drawn[i].y, xc, yc);
        }
        const last = drawn[drawn.length - 1];
        ctx.lineTo(last.x, last.y);
      };

      // Dark contrast backing
      ctx.strokeStyle = 'rgba(9, 13, 22, 0.65)';
      ctx.lineWidth = Math.max(9, beamUnit * 5.2);
      traceSmoothPath();
      ctx.stroke();

      // Outer laser glow
      ctx.strokeStyle = hexToRgba(lColor, 0.38);
      ctx.lineWidth = Math.max(14, beamUnit * 8);
      traceSmoothPath();
      ctx.stroke();

      // Primary laser beam
      ctx.strokeStyle = lColor;
      ctx.lineWidth = Math.max(4.5, beamUnit * 2.8);
      traceSmoothPath();
      ctx.stroke();

      // White-hot inner core
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(1.8, beamUnit * 1.0);
      traceSmoothPath();
      ctx.stroke();
    }

    // 4. Smooth Tapered Optical Laser Sweep Trail (fades & tapers naturally toward tail)
    const trail = laser.trail || [];
    if (trail.length >= 2) {
      const len = trail.length;
      for (let i = 1; i < len; i++) {
        const p0 = trail[i - 1];
        const p1 = trail[i];
        const progress = i / (len - 1); // 0.0 at tail -> 1.0 at head
        const alpha = Math.pow(progress, 1.6);
        const segWidth = Math.max(1.5, beamUnit * 3.4 * progress);

        // Outer glow segment
        ctx.strokeStyle = hexToRgba(lColor, alpha * 0.36);
        ctx.lineWidth = segWidth * 2.4;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();

        // Main colored laser segment
        ctx.strokeStyle = hexToRgba(lColor, alpha * 0.95);
        ctx.lineWidth = segWidth;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();

        // Inner hot filament on the leading half of the trail
        if (progress > 0.45) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${(alpha * 0.85).toFixed(2)})`;
          ctx.lineWidth = Math.max(1, segWidth * 0.38);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }
    }

    // 5. Straight Point-to-Point Laser Line (active drag or pinned 2-point line in 'line' mode)
    const activeLineStart =
      laser.isDown && typeof laser.originX === 'number' && typeof laser.originY === 'number'
        ? { x: laser.originX, y: laser.originY }
        : lMode === 'line' && drawn.length >= 2
        ? drawn[0]
        : null;
    const activeLineEnd =
      laser.isDown && typeof laser.originX === 'number' && typeof laser.originY === 'number'
        ? { x: laser.x, y: laser.y }
        : lMode === 'line' && drawn.length >= 2
        ? drawn[drawn.length - 1]
        : null;

    if (
      activeLineStart &&
      activeLineEnd &&
      (lMode === 'line' || (lMode === 'crosshair' && laser.isDown)) &&
      Math.hypot(activeLineEnd.x - activeLineStart.x, activeLineEnd.y - activeLineStart.y) > 6
    ) {
      const ox = activeLineStart.x;
      const oy = activeLineStart.y;
      const ex = activeLineEnd.x;
      const ey = activeLineEnd.y;

      // Dark contrast backing
      ctx.strokeStyle = 'rgba(9, 13, 22, 0.72)';
      ctx.lineWidth = Math.max(8, beamUnit * 4.8);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Outer laser bloom
      ctx.strokeStyle = hexToRgba(lColor, 0.38);
      ctx.lineWidth = Math.max(14, beamUnit * 8.2);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Main straight laser beam
      ctx.strokeStyle = lColor;
      ctx.lineWidth = Math.max(4, beamUnit * 2.6);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Inner white core
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(1.5, beamUnit * 0.95);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Origin & End node dots
      for (const pt of [
        { x: ox, y: oy },
        { x: ex, y: ey },
      ]) {
        ctx.fillStyle = lColor;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, lr * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, lr * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }

      // Distance badge at midpoint of straight laser line
      const distPx = Math.round(Math.hypot(ex - ox, ey - oy));
      const distMeters = ((distPx * physMetrics.pixelPitchMm) / 1000).toFixed(2);
      const distLabel = `${distPx}px (${distMeters}m)`;
      const dFont = Math.max(11, Math.round(minSide * 0.015));
      ctx.font = `700 ${dFont}px "JetBrains Mono", monospace`;
      const dW = ctx.measureText(distLabel).width + 14;
      const dH = dFont + 8;
      const midX = (ox + ex) / 2;
      const midY = (oy + ey) / 2;
      ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
      ctx.fillRect(midX - dW / 2, midY - dH / 2, dW, dH);
      ctx.strokeStyle = lColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(midX - dW / 2, midY - dH / 2, dW, dH);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(distLabel, midX, midY + 0.5);
    }

    // 6. Optical Laser Spot at (laser.x, laser.y)
    const radialGlow = ctx.createRadialGradient(
      laser.x,
      laser.y,
      lr * 0.1,
      laser.x,
      laser.y,
      lr * 1.85
    );
    radialGlow.addColorStop(0, hexToRgba(lColor, 0.85));
    radialGlow.addColorStop(0.45, hexToRgba(lColor, 0.28));
    radialGlow.addColorStop(1, hexToRgba(lColor, 0));
    ctx.fillStyle = radialGlow;
    ctx.beginPath();
    ctx.arc(laser.x, laser.y, lr * 1.85, 0, Math.PI * 2);
    ctx.fill();

    // Dark contrast ring for visibility over white/yellow squares
    ctx.strokeStyle = 'rgba(9, 13, 22, 0.78)';
    ctx.lineWidth = Math.max(3, lr * 0.22);
    ctx.beginPath();
    ctx.arc(laser.x, laser.y, lr * 0.72, 0, Math.PI * 2);
    ctx.stroke();

    // Colored laser ring
    ctx.strokeStyle = lColor;
    ctx.lineWidth = Math.max(2, lr * 0.16);
    ctx.beginPath();
    ctx.arc(laser.x, laser.y, lr * 0.72, 0, Math.PI * 2);
    ctx.stroke();

    // Laser spot core
    ctx.fillStyle = lColor;
    ctx.beginPath();
    ctx.arc(laser.x, laser.y, lr * 0.38, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(laser.x, laser.y, lr * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // 7. Compact Coordinate Tag next to Laser Spot
    if (laser.displayId) {
      const tagFont = Math.max(12, Math.round(minSide * 0.017));
      const tagText = `${laser.displayId} · ${Math.round(laser.x)},${Math.round(laser.y)}`;
      ctx.font = `700 ${tagFont}px "JetBrains Mono", monospace`;
      const tm = ctx.measureText(tagText);
      const tW = tm.width + 16;
      const tH = tagFont + 10;
      const tx =
        laser.x + lr + 12 + tW < compWidth
          ? laser.x + lr + 12
          : Math.max(8, laser.x - lr - 12 - tW);
      const ty = Math.max(10, Math.min(compHeight - tH - 10, laser.y - tH / 2));

      ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
      ctx.fillRect(tx, ty, tW, tH);
      ctx.strokeStyle = lColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tx, ty, tW, tH);

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, tx + tW / 2, ty + tH / 2 + 0.5);
    }

    ctx.restore();
  }

  const isIdentifyActive = Boolean(identifyFlashActive || overlays.pinnedIdentify);

  // 4. Broadcast Screen Identification Slate (top-left corner when showScreenSlate is enabled)
  if (overlays.showScreenSlate && !isIdentifyActive) {
    ctx.save();
    const minSide = Math.min(compWidth, compHeight);
    const titleSize = Math.max(16, Math.round(minSide * 0.024));
    const metaSize = Math.max(12, Math.round(titleSize * 0.68));
    const padX = Math.max(18, Math.round(titleSize * 0.9));
    const padY = Math.max(12, Math.round(titleSize * 0.6));

    const titleText = project.name;
    const physExtra = cabCfg.enabled
      ? `  ·  ${physMetrics.widthMeters}×${physMetrics.heightMeters}m (P${physMetrics.pixelPitchMm} / ${physMetrics.totalCabinets} Cab)`
      : '';
    const metaText = `${compWidth}×${compHeight} px  ·  ${computed.cols}×${computed.rows} مربعات (${Math.round(computed.baseCellWidth)}×${Math.round(computed.baseCellHeight)}px)${physExtra}`;

    ctx.font = `700 ${titleSize}px "Cairo", "Plus Jakarta Sans", sans-serif`;
    const w1 = ctx.measureText(titleText).width;
    ctx.font = `700 ${metaSize}px "JetBrains Mono", "Cairo", monospace`;
    const w2 = ctx.measureText(metaText).width;

    const slateW = Math.max(w1, w2) + padX * 2;
    const slateH = titleSize + metaSize + padY * 2.2;
    const sx = Math.max(20, Math.round(compWidth * 0.018));
    const sy = Math.max(20, Math.round(compHeight * 0.022));

    ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
    ctx.fillRect(sx, sy, slateW, slateH);

    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = Math.max(2.5, minSide * 0.003);
    ctx.strokeRect(sx, sy, slateW, slateH);

    ctx.font = `700 ${titleSize}px "Cairo", "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(titleText, sx + slateW / 2, sy + padY * 0.85 + titleSize / 2);

    ctx.font = `700 ${metaSize}px "JetBrains Mono", "Cairo", monospace`;
    ctx.fillStyle = '#F59E0B';
    ctx.fillText(metaText, sx + slateW / 2, sy + slateH - padY * 0.75 - metaSize / 2);

    ctx.restore();
  }

  // 4B. Live Studio Digital Clock (top-right corner when showClock is enabled)
  if (overlays.showClock && !isIdentifyActive) {
    ctx.save();
    const minSide = Math.min(compWidth, compHeight);
    const clockFont = Math.max(18, Math.round(minSide * 0.028));
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });

    ctx.font = `700 ${clockFont}px "JetBrains Mono", monospace`;
    const tm = ctx.measureText(timeStr);
    const padX = Math.max(16, clockFont * 0.75);
    const padY = Math.max(10, clockFont * 0.45);
    const cw = tm.width + padX * 2;
    const ch = clockFont + padY * 2;
    const cx = compWidth - cw - Math.max(20, Math.round(compWidth * 0.018));
    const cy = Math.max(20, Math.round(compHeight * 0.022));

    ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = Math.max(2.5, minSide * 0.003);
    ctx.strokeRect(cx, cy, cw, ch);

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, cx + cw / 2, cy + ch / 2 + 1);
    ctx.restore();
  }

  // 4C. Broadcast & Cinema Aspect Ratio Mask (2.39:1, 1.85:1, 16:9, 9:16, 4:3)
  if (overlays.aspectMask && overlays.aspectMask !== 'none') {
    ctx.save();
    const ratioMap: Record<string, number> = {
      '2.39:1': 2.39,
      '1.85:1': 1.85,
      '16:9': 16 / 9,
      '9:16': 9 / 16,
      '4:3': 4 / 3,
    };
    const targetAspect = ratioMap[overlays.aspectMask] || 16 / 9;
    const currentAspect = compWidth / Math.max(1, compHeight);
    const maskAlpha = Math.max(20, Math.min(95, overlays.aspectMaskOpacity ?? 72)) / 100;

    let activeW = compWidth;
    let activeH = compHeight;
    if (currentAspect > targetAspect) {
      // Pillar-box (left & right matte bars)
      activeW = Math.round(compHeight * targetAspect);
    } else {
      // Letter-box (top & bottom matte bars)
      activeH = Math.round(compWidth / targetAspect);
    }
    const ax = Math.round((compWidth - activeW) / 2);
    const ay = Math.round((compHeight - activeH) / 2);

    ctx.fillStyle = `rgba(5, 8, 14, ${maskAlpha.toFixed(2)})`;
    if (ay > 0) {
      ctx.fillRect(0, 0, compWidth, ay);
      ctx.fillRect(0, ay + activeH, compWidth, compHeight - (ay + activeH));
    }
    if (ax > 0) {
      ctx.fillRect(0, ay, ax, activeH);
      ctx.fillRect(ax + activeW, ay, compWidth - (ax + activeW), activeH);
    }

    // Active Aspect Frame Line & Badge
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = Math.max(2, Math.min(compWidth, compHeight) * 0.0025);
    ctx.strokeRect(ax, ay, activeW, activeH);

    const lblFont = Math.max(11, Math.round(Math.min(compWidth, compHeight) * 0.014));
    ctx.font = `700 ${lblFont}px "JetBrains Mono", monospace`;
    const maskTag = `ASPECT MASK ${overlays.aspectMask} (${activeW}×${activeH}px)`;
    const tw = ctx.measureText(maskTag).width + 14;
    const th = lblFont + 8;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
    ctx.fillRect(ax + 8, ay + 8, tw, th);
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ax + 8, ay + 8, tw, th);
    ctx.fillStyle = '#FEF08A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(maskTag, ax + 15, ay + 8 + th / 2 + 0.5);
    ctx.restore();
  }

  // 4D. Edge Blending / Overlap Guides (for Multi-Projector & Adjacent LED Wall Stitching)
  if (overlays.edgeBlendEnabled) {
    const topPx = Math.max(0, Math.min(compHeight / 2, Number(overlays.edgeBlendTopPx) || 0));
    const rightPx = Math.max(0, Math.min(compWidth / 2, Number(overlays.edgeBlendRightPx) || 0));
    const bottomPx = Math.max(0, Math.min(compHeight / 2, Number(overlays.edgeBlendBottomPx) || 0));
    const leftPx = Math.max(0, Math.min(compWidth / 2, Number(overlays.edgeBlendLeftPx) || 0));

    if (topPx > 0 || rightPx > 0 || bottomPx > 0 || leftPx > 0) {
      ctx.save();
      const lblFont = Math.max(11, Math.round(Math.min(compWidth, compHeight) * 0.013));
      ctx.font = `700 ${lblFont}px "JetBrains Mono", monospace`;

      const drawOverlapStrip = (
        rx: number,
        ry: number,
        rw: number,
        rh: number,
        label: string
      ) => {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.22)';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = '#C084FC';
        ctx.lineWidth = Math.max(2, refStroke * 1.3);
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
        ctx.setLineDash([]);

        const tw = ctx.measureText(label).width + 12;
        const th = lblFont + 8;
        if (rw >= tw + 8 && rh >= th + 6) {
          const bx = rx + (rw - tw) / 2;
          const by = ry + (rh - th) / 2;
          ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
          ctx.fillRect(bx, by, tw, th);
          ctx.strokeStyle = '#C084FC';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(bx, by, tw, th);
          ctx.fillStyle = '#E9D5FF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, bx + tw / 2, by + th / 2 + 0.5);
        }
      };

      if (leftPx > 0) {
        drawOverlapStrip(0, 0, leftPx, compHeight, `OVERLAP L: ${leftPx}px`);
      }
      if (rightPx > 0) {
        drawOverlapStrip(compWidth - rightPx, 0, rightPx, compHeight, `OVERLAP R: ${rightPx}px`);
      }
      if (topPx > 0) {
        drawOverlapStrip(0, 0, compWidth, topPx, `OVERLAP T: ${topPx}px`);
      }
      if (bottomPx > 0) {
        drawOverlapStrip(
          0,
          compHeight - bottomPx,
          compWidth,
          bottomPx,
          `OVERLAP B: ${bottomPx}px`
        );
      }
      ctx.restore();
    }
  }

  // 4E. Moving Genlock / Tearing Sync Bar (60fps High-Contrast Sweeping Bar for Frame Sync Diagnostics)
  if (overlays.movingSyncBar) {
    ctx.save();
    const speed = Math.max(0.5, Math.min(8, Number(overlays.syncBarSpeed) || 2));
    const isHoriz = overlays.syncBarOrientation === 'horizontal';
    const cycleMs = Math.max(600, Math.round(3600 / speed));
    const phase = (performance.now() % cycleMs) / cycleMs;
    const minSide = Math.min(compWidth, compHeight);
    const barThickness = Math.max(18, Math.round(minSide * 0.028));

    if (!isHoriz) {
      const barX = Math.round(phase * compWidth);
      const grad = ctx.createLinearGradient(barX - barThickness * 2, 0, barX + barThickness, 0);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      grad.addColorStop(0.65, 'rgba(56, 189, 248, 0.35)');
      grad.addColorStop(0.9, '#FEF08A');
      grad.addColorStop(1, '#FFFFFF');
      ctx.fillStyle = grad;
      ctx.fillRect(barX - barThickness * 2, 0, barThickness * 3, compHeight);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(barX - 2, 0, 4, compHeight);
    } else {
      const barY = Math.round(phase * compHeight);
      const grad = ctx.createLinearGradient(0, barY - barThickness * 2, 0, barY + barThickness);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      grad.addColorStop(0.65, 'rgba(56, 189, 248, 0.35)');
      grad.addColorStop(0.9, '#FEF08A');
      grad.addColorStop(1, '#FFFFFF');
      ctx.fillStyle = grad;
      ctx.fillRect(0, barY - barThickness * 2, compWidth, barThickness * 3);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, barY - 2, compWidth, 4);
    }
    ctx.restore();
  }

  // 5. Instant Visual Screen Identification Flash or Pinned Hold (triggered from Director Console to locate physical monitor)
  if (isIdentifyActive) {
    ctx.save();
    const minSide = Math.min(compWidth, compHeight);
    const borderW = Math.max(14, Math.round(minSide * 0.018));

    // Rapid Glowing Yellow Flash Layer (طبقة لونية صفراء تتوهج وتنطفئ بسرعة كالفلاش)
    if (options.identifyFlashActive) {
      const flashIntensity =
        typeof options.identifyFlashIntensity === 'number'
          ? Math.max(0, Math.min(1, options.identifyFlashIntensity))
          : computeQuickFlashYellowIntensity();

      if (flashIntensity > 0.01) {
        ctx.save();
        // 1. Full-screen bright yellow flash wash (#FACC15)
        ctx.fillStyle = `rgba(250, 204, 21, ${(0.52 * flashIntensity).toFixed(3)})`;
        ctx.fillRect(0, 0, compWidth, compHeight);

        // 2. High-energy radial yellow-gold flash glow bloom from screen center (#FEF08A -> #FACC15)
        const maxRadius = Math.hypot(compWidth, compHeight) * 0.65;
        const flashGrad = ctx.createRadialGradient(
          compWidth / 2,
          compHeight / 2,
          minSide * 0.04,
          compWidth / 2,
          compHeight / 2,
          maxRadius
        );
        flashGrad.addColorStop(0, `rgba(254, 249, 195, ${(0.56 * flashIntensity).toFixed(3)})`);
        flashGrad.addColorStop(0.45, `rgba(250, 204, 21, ${(0.34 * flashIntensity).toFixed(3)})`);
        flashGrad.addColorStop(1, `rgba(234, 179, 8, ${(0.12 * flashIntensity).toFixed(3)})`);
        ctx.fillStyle = flashGrad;
        ctx.fillRect(0, 0, compWidth, compHeight);

        // 3. Intense inner yellow strobe halo along screen edges
        ctx.shadowColor = '#FACC15';
        ctx.shadowBlur = Math.round(minSide * 0.06 * flashIntensity);
        ctx.strokeStyle = `rgba(254, 240, 138, ${(0.95 * flashIntensity).toFixed(3)})`;
        ctx.lineWidth = Math.max(20, Math.round(minSide * 0.032 * flashIntensity));
        ctx.strokeRect(0, 0, compWidth, compHeight);
        ctx.restore();
      }
    }

    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = borderW;
    ctx.strokeRect(borderW / 2, borderW / 2, compWidth - borderW, compHeight - borderW);

    // High-visibility corner alignment brackets
    const cornerLen = Math.max(50, Math.round(minSide * 0.09));
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = Math.max(6, Math.round(borderW * 0.45));
    const bInset = borderW * 1.4;
    ctx.beginPath();
    // Top-left
    ctx.moveTo(bInset, bInset + cornerLen);
    ctx.lineTo(bInset, bInset);
    ctx.lineTo(bInset + cornerLen, bInset);
    // Top-right
    ctx.moveTo(compWidth - bInset - cornerLen, bInset);
    ctx.lineTo(compWidth - bInset, bInset);
    ctx.lineTo(compWidth - bInset, bInset + cornerLen);
    // Bottom-left
    ctx.moveTo(bInset, compHeight - bInset - cornerLen);
    ctx.lineTo(bInset, compHeight - bInset);
    ctx.lineTo(bInset + cornerLen, compHeight - bInset);
    // Bottom-right
    ctx.moveTo(compWidth - bInset - cornerLen, compHeight - bInset);
    ctx.lineTo(compWidth - bInset, compHeight - bInset);
    ctx.lineTo(compWidth - bInset, compHeight - bInset - cornerLen);
    ctx.stroke();

    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const div = gcd(compWidth, compHeight);
    const aspectStr = `${Math.round(compWidth / div)}:${Math.round(compHeight / div)}`;
    const megaPixels = ((compWidth * compHeight) / 1_000_000).toFixed(2);
    const orderNum =
      options.screenOrderIndex !== undefined
        ? `#${String(options.screenOrderIndex + 1).padStart(2, '0')} — `
        : '';

    const mainFont = Math.max(32, Math.round(minSide * 0.064));
    const subFont = Math.max(17, Math.round(mainFont * 0.44));
    const metaFont = Math.max(14, Math.round(mainFont * 0.34));
    const cardW = Math.min(compWidth * 0.88, Math.max(540, mainFont * 13));
    const cardH = mainFont + subFont + metaFont + Math.max(82, mainFont * 1.6);
    const cx = (compWidth - cardW) / 2;
    const cy = (compHeight - cardH) / 2;

    ctx.fillStyle = 'rgba(9, 13, 22, 0.96)';
    ctx.fillRect(cx, cy, cardW, cardH);

    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = Math.max(4, minSide * 0.005);
    ctx.strokeRect(cx, cy, cardW, cardH);

    ctx.font = `700 ${mainFont}px "Cairo", "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FEF08A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${orderNum}${project.name}`, compWidth / 2, cy + cardH * 0.3);

    const physBannerLine = cabCfg.enabled
      ? `   |   ${physMetrics.widthMeters}m × ${physMetrics.heightMeters}m (P${physMetrics.pixelPitchMm})`
      : '';
    ctx.font = `700 ${subFont}px "JetBrains Mono", "Cairo", monospace`;
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(
      `${compWidth} × ${compHeight} px  (${aspectStr})   |   ${computed.cols} × ${computed.rows} Grid${physBannerLine}`,
      compWidth / 2,
      cy + cardH * 0.61
    );

    const cabBannerMeta = cabCfg.enabled
      ? `   ·   CABINETS: ${physMetrics.cabinetsCols}×${physMetrics.cabinetsRows} (${physMetrics.totalCabinets})`
      : '';
    ctx.font = `700 ${metaFont}px "JetBrains Mono", "Cairo", monospace`;
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(
      `CELL: ${Math.round(computed.baseCellWidth)}×${Math.round(computed.baseCellHeight)} px   ·   TOTAL: ${computed.cells.length} SQUARES (${megaPixels} MP)${cabBannerMeta}`,
      compWidth / 2,
      cy + cardH * 0.85
    );

    ctx.restore();
  }

  // Apply Color Calibration & Grading Filters across the entire rendered frame
  applyCanvasColorCalibration(ctx, compWidth, compHeight, colorCfg);

  ctx.restore();
}

export interface CanvasColorAnalysisResult {
  avgR: number;
  avgG: number;
  avgB: number;
  avgHex: string;
  avgLuminanceIRE: number;
  minLuminanceIRE: number;
  maxLuminanceIRE: number;
  contrastRatio: string;
  estimatedKelvin: number;
  blackCrushPct: number;
  whiteClipPct: number;
  gamutOverloadPct: number;
  lumaHistogram: number[]; // 8 buckets (0-12.5%, 12.5-25%, ..., 87.5-100%)
  status: 'optimal' | 'warning' | 'clipping';
}

/**
 * Sample pixels across the active canvas to produce real-time Broadcast Color & Luminance Telemetry
 */
export function analyzeCanvasColorMetrics(
  canvas: HTMLCanvasElement | null,
  colorCfg?: ColorCalibrationConfig
): CanvasColorAnalysisResult {
  const fallback: CanvasColorAnalysisResult = {
    avgR: 128,
    avgG: 128,
    avgB: 128,
    avgHex: '#808080',
    avgLuminanceIRE: 50,
    minLuminanceIRE: 0,
    maxLuminanceIRE: 100,
    contrastRatio: '10.0:1',
    estimatedKelvin: 6500,
    blackCrushPct: 0,
    whiteClipPct: 0,
    gamutOverloadPct: 0,
    lumaHistogram: [12, 14, 15, 16, 15, 12, 9, 7],
    status: 'optimal',
  };

  if (!canvas || canvas.width === 0 || canvas.height === 0) return fallback;

  try {
    // Hardware-accelerated GPU downscale into a tiny 48x27 buffer (reads only 5 KB instead of 33MB-132MB on 4K/8K!)
    const sampleW = 48;
    const sampleH = 27;
    if (!telemetrySampleCanvas) {
      telemetrySampleCanvas = document.createElement('canvas');
      telemetrySampleCanvas.width = sampleW;
      telemetrySampleCanvas.height = sampleH;
      telemetrySampleCtx = telemetrySampleCanvas.getContext('2d', {
        willReadFrequently: true,
      });
    }
    if (!telemetrySampleCtx) return fallback;

    telemetrySampleCtx.clearRect(0, 0, sampleW, sampleH);
    telemetrySampleCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
    const imgData = telemetrySampleCtx.getImageData(0, 0, sampleW, sampleH).data;

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumLuma = 0;
    let minLuma = 255;
    let maxLuma = 0;
    let blackCrushCount = 0;
    let whiteClipCount = 0;
    let gamutOverloadCount = 0;
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
    const totalSamples = sampleW * sampleH;

    for (let i = 0; i < totalSamples; i++) {
      const idx = i * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];

      sumR += r;
      sumG += g;
      sumB += b;

      // Rec.709 Luminance Y' = 0.2126 R + 0.7152 G + 0.0722 B
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sumLuma += luma;
      if (luma < minLuma) minLuma = luma;
      if (luma > maxLuma) maxLuma = luma;

      const ire = (luma / 255) * 100;
      if (ire < 3) blackCrushCount++;
      if (ire > 97) whiteClipCount++;

      const maxCh = Math.max(r, g, b);
      const minCh = Math.min(r, g, b);
      if (maxCh > 250 && maxCh - minCh > 220) {
        gamutOverloadCount++;
      }

      const bIdx = Math.min(7, Math.max(0, Math.floor((ire / 100) * 8)));
      buckets[bIdx]++;
    }

    const avgR = Math.round(sumR / totalSamples);
    const avgG = Math.round(sumG / totalSamples);
    const avgB = Math.round(sumB / totalSamples);
    const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    const avgHex = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;

    const avgLuminanceIRE = Math.round(((sumLuma / totalSamples) / 255) * 100);
    const minLuminanceIRE = Math.round((minLuma / 255) * 100);
    const maxLuminanceIRE = Math.round((maxLuma / 255) * 100);

    const l1 = maxLuma / 255 + 0.05;
    const l2 = minLuma / 255 + 0.05;
    const ratioVal = Number((l1 / l2).toFixed(1));
    const contrastRatio = `${ratioVal}:1`;

    // Estimate Kelvin based on R/B balance and temperature slider
    const tempOffset = (colorCfg?.temperature ?? 0) * -22;
    const rbShift = (avgB - avgR) * 8;
    const estimatedKelvin = Math.max(
      2500,
      Math.min(12000, Math.round(6500 + tempOffset + rbShift))
    );

    const blackCrushPct = Math.round((blackCrushCount / totalSamples) * 100);
    const whiteClipPct = Math.round((whiteClipCount / totalSamples) * 100);
    const gamutOverloadPct = Math.round((gamutOverloadCount / totalSamples) * 100);

    const lumaHistogram = buckets.map((c) => Math.round((c / totalSamples) * 100));

    let status: 'optimal' | 'warning' | 'clipping' = 'optimal';
    if (whiteClipPct > 20 || blackCrushPct > 45 || gamutOverloadPct > 30) {
      status = 'clipping';
    } else if (whiteClipPct > 8 || blackCrushPct > 25 || gamutOverloadPct > 15) {
      status = 'warning';
    }

    return {
      avgR,
      avgG,
      avgB,
      avgHex,
      avgLuminanceIRE,
      minLuminanceIRE,
      maxLuminanceIRE,
      contrastRatio,
      estimatedKelvin,
      blackCrushPct,
      whiteClipPct,
      gamutOverloadPct,
      lumaHistogram,
      status,
    };
  } catch {
    return fallback;
  }
}

/**
 * Sample a single pixel (x, y) from a 4K/8K canvas using a 1x1 willReadFrequently offscreen buffer
 * so the main GPU canvas texture is never locked or copied to CPU RAM on mousemove.
 */
export function sampleCanvasPixelFast(
  canvas: HTMLCanvasElement | null,
  x: number,
  y: number
): { x: number; y: number; r: number; g: number; b: number; hex: string; ire: number } | null {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  try {
    if (!singlePixelSampleCanvas) {
      singlePixelSampleCanvas = document.createElement('canvas');
      singlePixelSampleCanvas.width = 1;
      singlePixelSampleCanvas.height = 1;
      singlePixelSampleCtx = singlePixelSampleCanvas.getContext('2d', {
        willReadFrequently: true,
      });
    }
    if (!singlePixelSampleCtx) return null;

    const sx = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
    const sy = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
    singlePixelSampleCtx.clearRect(0, 0, 1, 1);
    singlePixelSampleCtx.drawImage(canvas, sx, sy, 1, 1, 0, 0, 1, 1);
    const p = singlePixelSampleCtx.getImageData(0, 0, 1, 1).data;
    const r = p[0];
    const g = p[1];
    const b = p[2];
    const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    const ire = Math.round(((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * 100);
    return { x: sx, y: sy, r, g, b, hex, ire };
  } catch {
    return null;
  }
}

/**
 * Generate an Adobe After Effects ExtendScript (.jsx) file
 */
export function generateAfterEffectsJSX(
  project: StudioProject,
  computed: ComputedGridResult
): string {
  const safeName = project.name.replace(/"/g, '\\"');
  const cellDataJson = JSON.stringify(
    computed.cells.map((c) => ({
      id: c.displayId,
      coord: c.coordId,
      x: c.x,
      y: c.y,
      w: c.width,
      h: c.height,
      rgb: hexToRgb(c.effectiveColor).map((v) => Number((v / 255).toFixed(4))),
      label: c.resolvedNoteText || '',
    })),
    null,
    2
  );

  return `/**
 * Adobe After Effects Calibration & Camera Blocking Grid Script (.jsx)
 * Project: ${project.name} (${project.compWidth}x${project.compHeight} px)
 */

(function createStudioCalibrationGrid() {
  app.beginUndoGroup("Studio Grid - ${safeName}");

  var compW = ${project.compWidth};
  var compH = ${project.compHeight};
  var comp = app.project.items.addComp("${safeName}", compW, compH, 1.0, 10.0, 25);
  comp.bgColor = [0.035, 0.051, 0.086];

  var cells = ${cellDataJson};

  for (var i = cells.length - 1; i >= 0; i--) {
    var cell = cells[i];
    var solidName = "Cell_" + cell.coord + (cell.label ? "_" + cell.label : "");
    var solidLayer = comp.layers.addSolid(cell.rgb, solidName, Math.max(4, cell.w - ${project.gridLineWidth}), Math.max(4, cell.h - ${project.gridLineWidth}), 1.0);
    solidLayer.property("Position").setValue([cell.x + cell.w / 2, cell.y + cell.h / 2]);
    if (cell.label) {
      solidLayer.comment = cell.label;
    }

    var numTextLayer = comp.layers.addText(cell.id);
    numTextLayer.name = "ID_" + cell.coord;
    var textProp = numTextLayer.property("Source Text");
    var textDoc = textProp.value;
    textDoc.fontSize = Math.max(14, Math.min(cell.w, cell.h) * 0.28);
    textDoc.fillColor = [1, 1, 1];
    textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
    textProp.setValue(textDoc);
    numTextLayer.property("Position").setValue([
      cell.x + cell.w / 2,
      cell.y + cell.h * 0.54
    ]);
  }

  app.endUndoGroup();
  comp.openInViewer();
})();
`;
}

/**
 * Render an offscreen 1:1 exact native-resolution PNG of a single screen and trigger download.
 */
export function exportScreenNativePixelMapPng(
  screen: StudioProject,
  screenOrderIndex = 0
): void {
  const offCanvas = document.createElement('canvas');
  offCanvas.width = screen.compWidth;
  offCanvas.height = screen.compHeight;
  const ctx = offCanvas.getContext('2d');
  if (!ctx) return;

  const computed = computeGrid(screen);
  renderStudioCanvas(ctx, screen, computed, {
    isLiveOutput: false,
    screenOrderIndex,
  });

  const safeName = screen.name.replace(/[^\w\u0600-\u06FF-]+/g, '_');
  const link = document.createElement('a');
  link.download = `PixelMap_${String(screenOrderIndex + 1).padStart(2, '0')}_${safeName}_${screen.compWidth}x${screen.compHeight}.png`;
  link.href = offCanvas.toDataURL('image/png');
  link.click();
}

/**
 * Export all screens as individual 1:1 native PNGs PLUS a composite Multi-Screen Wall Map PNG.
 */
export function exportAllScreensPixelMapPack(
  screens: StudioProject[],
  workspaceName = 'Studio_Wall'
): void {
  if (!screens || screens.length === 0) return;

  // 1. Export each screen at exact 1:1 native pixel resolution (staggered slightly for browser download manager)
  screens.forEach((scr, idx) => {
    window.setTimeout(() => {
      exportScreenNativePixelMapPng(scr, idx);
    }, idx * 220);
  });

  // 2. If there are multiple screens, also export a composite Spatial Wall Map PNG
  if (screens.length > 1) {
    window.setTimeout(() => {
      let runningX = 0;
      const gap = 60;
      const rects = screens.map((scr, idx) => {
        const hasPos =
          typeof scr.wallPosX === 'number' &&
          Number.isFinite(scr.wallPosX) &&
          typeof scr.wallPosY === 'number' &&
          Number.isFinite(scr.wallPosY);
        const x = hasPos ? Math.round(scr.wallPosX!) : runningX;
        const y = hasPos ? Math.round(scr.wallPosY!) : 0;
        runningX = x + scr.compWidth + gap;
        return { scr, idx, x, y, w: scr.compWidth, h: scr.compHeight };
      });

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const r of rects) {
        if (r.x < minX) minX = r.x;
        if (r.y < minY) minY = r.y;
        if (r.x + r.w > maxX) maxX = r.x + r.w;
        if (r.y + r.h > maxY) maxY = r.y + r.h;
      }

      const rawW = Math.max(1, maxX - minX);
      const rawH = Math.max(1, maxY - minY);
      // Cap composite canvas dimension to 8192px to remain within browser canvas memory limits
      const scale = Math.min(1, 8192 / Math.max(rawW, rawH));
      const compCanvas = document.createElement('canvas');
      compCanvas.width = Math.max(1, Math.round(rawW * scale));
      compCanvas.height = Math.max(1, Math.round(rawH * scale));
      const cCtx = compCanvas.getContext('2d');
      if (!cCtx) return;

      cCtx.fillStyle = '#070A10';
      cCtx.fillRect(0, 0, compCanvas.width, compCanvas.height);

      for (const r of rects) {
        const subCanvas = document.createElement('canvas');
        subCanvas.width = r.w;
        subCanvas.height = r.h;
        const sCtx = subCanvas.getContext('2d');
        if (sCtx) {
          const comp = computeGrid(r.scr);
          renderStudioCanvas(sCtx, r.scr, comp, {
            isLiveOutput: false,
            screenOrderIndex: r.idx,
          });
          cCtx.drawImage(
            subCanvas,
            Math.round((r.x - minX) * scale),
            Math.round((r.y - minY) * scale),
            Math.round(r.w * scale),
            Math.round(r.h * scale)
          );
        }
      }

      const safeWs = workspaceName.replace(/[^\w\u0600-\u06FF-]+/g, '_');
      const link = document.createElement('a');
      link.download = `${safeWs}_Composite_Wall_${rawW}x${rawH}.png`;
      link.href = compCanvas.toDataURL('image/png');
      link.click();
    }, screens.length * 240);
  }
}

