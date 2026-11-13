import {
  BROADCAST_16_PALETTE,
  CabinetAndPitchConfig,
  ComputedCell,
  DEFAULT_CABINET_CONFIG,
  StudioNoteItem,
  StudioProject,
} from '../types/studio';

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
  const cycleMs = 340;
  const burstIndex = Math.floor(t / cycleMs);
  if (burstIndex >= 5) return 0;
  const localPhase = (t % cycleMs) / cycleMs;
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
