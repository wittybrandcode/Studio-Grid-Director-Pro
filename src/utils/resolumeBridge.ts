import {
  DEFAULT_CABINET_CONFIG,
  DEFAULT_CENTER_CONFIG,
  DEFAULT_COLOR_CALIBRATION,
  DEFAULT_NDI_CONFIG,
  DEFAULT_STUDIO_PROJECT,
  PROCESSOR_ZONE_COLORS,
  ProcessorZone,
  StudioProject,
} from '../types/studio';
import { computeGrid, renderStudioCanvas } from './gridEngine';
import { saveStudioBinaryFile } from './tauriBridge';

export type ArenaInputPackMode = 'auto_atlas' | 'stage_layout' | 'direct_origin';
export type ArenaSliceGenMode =
  | 'full_screen'
  | 'processor_zones'
  | 'color_groups'
  | 'combined';

export interface ArenaScreenPlacement {
  screen: StudioProject;
  screenIndex: number;
  inputX: number;
  inputY: number;
  width: number;
  height: number;
  slices: ArenaGeneratedSlice[];
}

export interface ArenaGeneratedSlice {
  id: string;
  name: string;
  kind: 'master' | 'processor_zone' | 'color_group' | 'polygon';
  colorHex: string;
  // Coordinates inside the unified Resolume Composition (Input Selection)
  inputX: number;
  inputY: number;
  inputW: number;
  inputH: number;
  // Coordinates inside the physical Screen Output (Output Transformation)
  outputX: number;
  outputY: number;
  outputW: number;
  outputH: number;
}

export interface ArenaAtlasPlan {
  compWidth: number;
  compHeight: number;
  atlasWidth: number;
  atlasHeight: number;
  atlasScale: number;
  isExceeding8192: boolean;
  placements: ArenaScreenPlacement[];
  totalSlices: number;
}

export interface ArenaLiveStatus {
  connected: boolean;
  productName?: string;
  version?: string;
  compName?: string;
  compWidth?: number;
  compHeight?: number;
  masterOpacity?: number;
  columnsCount?: number;
  layersCount?: number;
  error?: string;
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeUniqueNumericId(seedIndex: number, subIndex = 0): string {
  const base = 1718000000000 + seedIndex * 10000 + subIndex * 37;
  return String(base);
}

/**
 * Compute bounding-box slices for each distinct custom color or note group on a screen.
 */
function computeColorGroupSlicesForScreen(
  screen: StudioProject,
  screenInputX: number,
  screenInputY: number
): ArenaGeneratedSlice[] {
  const computed = computeGrid(screen);
  const slices: ArenaGeneratedSlice[] = [];

  // 1. Group cells that have custom overrides or belong to a note
  const colorBuckets = new Map<
    string,
    {
      label: string;
      color: string;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      count: number;
    }
  >();

  for (const cell of computed.cells) {
    if (!cell.hasCustomColor && !cell.resolvedNoteText) continue;
    const key = (cell.effectiveColor || '#38BDF8').toUpperCase();
    const existing = colorBuckets.get(key);
    const noteLabel = cell.resolvedNoteText?.trim() || '';
    if (!existing) {
      colorBuckets.set(key, {
        label: noteLabel || `Color Group ${key}`,
        color: key,
        minX: cell.x,
        minY: cell.y,
        maxX: cell.x + cell.width,
        maxY: cell.y + cell.height,
        count: 1,
      });
    } else {
      if (!existing.label || existing.label.startsWith('Color Group')) {
        if (noteLabel) existing.label = noteLabel;
      }
      existing.minX = Math.min(existing.minX, cell.x);
      existing.minY = Math.min(existing.minY, cell.y);
      existing.maxX = Math.max(existing.maxX, cell.x + cell.width);
      existing.maxY = Math.max(existing.maxY, cell.y + cell.height);
      existing.count += 1;
    }
  }

  let idx = 1;
  colorBuckets.forEach((bucket) => {
    const w = Math.max(1, bucket.maxX - bucket.minX);
    const h = Math.max(1, bucket.maxY - bucket.minY);
    slices.push({
      id: `cg-${screen.id}-${idx}`,
      name: `${screen.name} :: ${bucket.label} (${bucket.count} cells)`,
      kind: 'color_group',
      colorHex: bucket.color,
      inputX: screenInputX + bucket.minX,
      inputY: screenInputY + bucket.minY,
      inputW: w,
      inputH: h,
      outputX: bucket.minX,
      outputY: bucket.minY,
      outputW: w,
      outputH: h,
    });
    idx++;
  });

  return slices;
}

/**
 * Compute the complete Arena Composition Atlas layout & slice plan for all screens.
 */
export function buildArenaAtlasPlan(
  screens: StudioProject[],
  packMode: ArenaInputPackMode = 'auto_atlas',
  sliceMode: ArenaSliceGenMode = 'combined',
  atlasGapPx = 0
): ArenaAtlasPlan {
  if (!screens || screens.length === 0) {
    return {
      compWidth: 1920,
      compHeight: 1080,
      atlasWidth: 1920,
      atlasHeight: 1080,
      atlasScale: 1,
      isExceeding8192: false,
      placements: [],
      totalSlices: 0,
    };
  }

  const rawCoords: { scr: StudioProject; idx: number; x: number; y: number }[] = [];

  if (packMode === 'direct_origin') {
    screens.forEach((scr, idx) => {
      rawCoords.push({ scr, idx, x: 0, y: 0 });
    });
  } else if (packMode === 'stage_layout') {
    let fallbackX = 0;
    screens.forEach((scr, idx) => {
      const hasPos =
        typeof scr.wallPosX === 'number' &&
        Number.isFinite(scr.wallPosX) &&
        typeof scr.wallPosY === 'number' &&
        Number.isFinite(scr.wallPosY);
      const x = hasPos ? Math.round(scr.wallPosX!) : fallbackX;
      const y = hasPos ? Math.round(scr.wallPosY!) : 0;
      fallbackX = x + scr.compWidth + atlasGapPx;
      rawCoords.push({ scr, idx, x, y });
    });
  } else {
    // 'auto_atlas': intelligent horizontal row / shelf packing up to 7680px wide before wrapping
    const maxRowWidth = Math.max(
      3840,
      ...screens.map((s) => s.compWidth),
      screens.reduce((sum, s) => sum + s.compWidth, 0) <= 7680 ? 7680 : 4096
    );
    let curX = 0;
    let curY = 0;
    let rowH = 0;

    screens.forEach((scr, idx) => {
      if (curX > 0 && curX + scr.compWidth > maxRowWidth) {
        curX = 0;
        curY += rowH + atlasGapPx;
        rowH = 0;
      }
      rawCoords.push({ scr, idx, x: curX, y: curY });
      curX += scr.compWidth + atlasGapPx;
      rowH = Math.max(rowH, scr.compHeight);
    });
  }

  // Normalize so minimum X and Y start at 0,0 inside the Resolume Composition
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of rawCoords) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.scr.compWidth);
    maxY = Math.max(maxY, item.y + item.scr.compHeight);
  }

  const compWidth = Math.max(1, Math.round(maxX - minX));
  const compHeight = Math.max(1, Math.round(maxY - minY));
  const maxDim = Math.max(compWidth, compHeight);
  const isExceeding8192 = maxDim > 8192;
  const atlasScale = isExceeding8192 ? 8192 / maxDim : 1;
  const atlasWidth = Math.max(1, Math.round(compWidth * atlasScale));
  const atlasHeight = Math.max(1, Math.round(compHeight * atlasScale));

  let totalSlices = 0;

  const placements: ArenaScreenPlacement[] = rawCoords.map(({ scr, idx, x, y }) => {
    const inputX = Math.round(x - minX);
    const inputY = Math.round(y - minY);
    const slices: ArenaGeneratedSlice[] = [];

    // 1. Full Screen Master Slice
    if (sliceMode === 'full_screen' || sliceMode === 'combined') {
      slices.push({
        id: `master-${scr.id}`,
        name: `${scr.name} [Master ${scr.compWidth}x${scr.compHeight}]`,
        kind: 'master',
        colorHex: scr.selectionColor || '#38BDF8',
        inputX,
        inputY,
        inputW: scr.compWidth,
        inputH: scr.compHeight,
        outputX: 0,
        outputY: 0,
        outputW: scr.compWidth,
        outputH: scr.compHeight,
      });
    }

    // 2. Processor Output Zones Slices
    if (
      (sliceMode === 'processor_zones' || sliceMode === 'combined') &&
      Array.isArray(scr.processorZones) &&
      scr.processorZones.length > 0
    ) {
      scr.processorZones.forEach((zone, zIdx) => {
        const zx = Math.max(0, Math.min(scr.compWidth - 1, Math.round(zone.x)));
        const zy = Math.max(0, Math.min(scr.compHeight - 1, Math.round(zone.y)));
        const zw = Math.max(1, Math.min(scr.compWidth - zx, Math.round(zone.width)));
        const zh = Math.max(1, Math.min(scr.compHeight - zy, Math.round(zone.height)));

        slices.push({
          id: `pz-${scr.id}-${zone.id || zIdx}`,
          name: `${scr.name} :: ${zone.portLabel} (${zone.name})`,
          kind: 'processor_zone',
          colorHex: zone.color || '#F59E0B',
          inputX: inputX + zx,
          inputY: inputY + zy,
          inputW: zw,
          inputH: zh,
          outputX: zx,
          outputY: zy,
          outputW: zw,
          outputH: zh,
        });
      });
    }

    // 3. Color / Note Group Bounding-Box Slices
    if (sliceMode === 'color_groups' || sliceMode === 'combined') {
      const colorSlices = computeColorGroupSlicesForScreen(scr, inputX, inputY);
      slices.push(...colorSlices);
    }

    // Fallback: if user selected 'processor_zones' or 'color_groups' only, but screen has none, ensure at least 1 full slice
    if (slices.length === 0) {
      slices.push({
        id: `fallback-${scr.id}`,
        name: `${scr.name} [Full ${scr.compWidth}x${scr.compHeight}]`,
        kind: 'master',
        colorHex: scr.selectionColor || '#38BDF8',
        inputX,
        inputY,
        inputW: scr.compWidth,
        inputH: scr.compHeight,
        outputX: 0,
        outputY: 0,
        outputW: scr.compWidth,
        outputH: scr.compHeight,
      });
    }

    totalSlices += slices.length;

    return {
      screen: scr,
      screenIndex: idx,
      inputX,
      inputY,
      width: scr.compWidth,
      height: scr.compHeight,
      slices,
    };
  });

  return {
    compWidth,
    compHeight,
    atlasWidth,
    atlasHeight,
    atlasScale,
    isExceeding8192,
    placements,
    totalSlices,
  };
}

/**
 * Generate a 4x4 BezierMesh warper XML block using normalized 0.0..1.0 UV coordinates
 * as required by Resolume Arena 6 & 7 inside <Warper>.
 */
function buildWarperVerticesXml(): string {
  const vertices: string[] = [];
  for (let row = 0; row < 4; row++) {
    const vy = row / 3;
    for (let col = 0; col < 4; col++) {
      const vx = col / 3;
      vertices.push(`                <v x="${vx.toFixed(6)}" y="${vy.toFixed(6)}"/>`);
    }
  }
  return vertices.join('\n');
}

/**
 * Generate a native Resolume Arena 6 & 7 Advanced Output Preset XML (.xml).
 */
export function generateResolumeAdvancedOutputXml(
  screens: StudioProject[],
  workspaceName = 'Studio_Grid_Director',
  packMode: ArenaInputPackMode = 'auto_atlas',
  sliceMode: ArenaSliceGenMode = 'combined',
  atlasGapPx = 0,
  scaleXmlToAtlasCap = false
): string {
  const plan = buildArenaAtlasPlan(screens, packMode, sliceMode, atlasGapPx);
  const inputScale = scaleXmlToAtlasCap && plan.isExceeding8192 ? plan.atlasScale : 1;
  const xmlCompWidth = inputScale < 1 ? plan.atlasWidth : plan.compWidth;
  const xmlCompHeight = inputScale < 1 ? plan.atlasHeight : plan.compHeight;

  const screensXmlBlocks = plan.placements.map((placement, sIdx) => {
    const scr = placement.screen;
    const screenUniqueId = makeUniqueNumericId(sIdx + 1, 0);

    const slicesXml = placement.slices
      .map((slice, slIdx) => {
        const sliceUniqueId = makeUniqueNumericId(sIdx + 1, slIdx + 1);
        const ix0 = Math.round(slice.inputX * inputScale);
        const iy0 = Math.round(slice.inputY * inputScale);
        const ix1 = Math.max(ix0 + 1, Math.round((slice.inputX + slice.inputW) * inputScale));
        const iy1 = Math.max(iy0 + 1, Math.round((slice.inputY + slice.inputH) * inputScale));

        const ox0 = slice.outputX;
        const oy0 = slice.outputY;
        const ox1 = slice.outputX + slice.outputW;
        const oy1 = slice.outputY + slice.outputH;

        return `          <Slice uniqueId="${sliceUniqueId}" name="${escapeXml(slice.name)}">
            <params name="Params">
              <Param name="Name" T="STRING" default="Slice" value="${escapeXml(slice.name)}"/>
              <Param name="Enabled" T="BOOL" default="1" value="1"/>
              <ParamChoice name="InputSource" default="0" value="0" storeChoices="0"/>
              <Param name="InputOpacity" T="BOOL" default="1" value="1"/>
              <Param name="InputBypass" T="BOOL" default="1" value="1"/>
              <Param name="SoftEdge" T="BOOL" default="0" value="0"/>
            </params>
            <InputRect orientation="0">
              <v x="${ix0}" y="${iy0}"/>
              <v x="${ix1}" y="${iy0}"/>
              <v x="${ix1}" y="${iy1}"/>
              <v x="${ix0}" y="${iy1}"/>
            </InputRect>
            <OutputRect orientation="0">
              <v x="${ox0}" y="${oy0}"/>
              <v x="${ox1}" y="${oy0}"/>
              <v x="${ox1}" y="${oy1}"/>
              <v x="${ox0}" y="${oy1}"/>
            </OutputRect>
            <warper>
              <Warper>
                <params name="Params">
                  <ParamChoice name="PointMode" default="0" value="0" storeChoices="0"/>
                  <Param name="LockToInput" T="BOOL" default="0" value="0"/>
                </params>
                <vertices type="BezierMesh" rows="4" columns="4">
${buildWarperVerticesXml()}
                </vertices>
              </Warper>
            </warper>
          </Slice>`;
      })
      .join('\n');

    return `      <Screen name="${escapeXml(scr.name)}" uniqueId="${screenUniqueId}">
        <params name="Params">
          <Param name="Name" T="STRING" default="Screen" value="${escapeXml(scr.name)}"/>
          <Param name="Enabled" T="BOOL" default="1" value="1"/>
          <Param name="Hidden" T="BOOL" default="0" value="0"/>
          <Param name="Collapsed" T="BOOL" default="0" value="0"/>
          <ParamRange name="Opacity" T="DOUBLE" default="1" value="1"/>
          <ParamRange name="Brightness" T="DOUBLE" default="0" value="0"/>
          <ParamRange name="Contrast" T="DOUBLE" default="0" value="0"/>
          <ParamRange name="Red" T="DOUBLE" default="0" value="0"/>
          <ParamRange name="Green" T="DOUBLE" default="0" value="0"/>
          <ParamRange name="Blue" T="DOUBLE" default="0" value="0"/>
        </params>
        <layers>
${slicesXml}
        </layers>
        <OutputDevice>
          <OutputDeviceVirtual name="${escapeXml(scr.name)}" width="${scr.compWidth}" height="${scr.compHeight}" deviceIdHash="0"/>
        </OutputDevice>
      </Screen>`;
  });

  const scaleNote =
    inputScale < 1
      ? ` | Scaled Input Map: ${xmlCompWidth}x${xmlCompHeight}px (${(inputScale * 100).toFixed(2)}%)`
      : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by Studio Grid Director Pro for Resolume Arena Advanced Output -->
<!-- Workspace: ${escapeXml(workspaceName)} | Composition Size: ${xmlCompWidth}x${xmlCompHeight}px (Native ${plan.compWidth}x${plan.compHeight}px)${scaleNote} | Screens: ${plan.placements.length} | Slices: ${plan.totalSlices} -->
<XmlState name="${escapeXml(workspaceName)}_Arena_Preset">
  <versionInfo name="Resolume Arena" majorVersion="7" minorVersion="18" microVersion="0" revision="29742"/>
  <ScreenSetup name="ScreenSetup">
    <CurrentCompositionTextureSize width="${xmlCompWidth}" height="${xmlCompHeight}"/>
    <screens>
${screensXmlBlocks.join('\n')}
    </screens>
  </ScreenSetup>
</XmlState>
`;
}

/**
 * Trigger download / native save of the Resolume Arena Advanced Output .xml preset.
 */
export async function exportResolumeArenaXmlPreset(
  screens: StudioProject[],
  workspaceName = 'Studio_Grid_Director',
  packMode: ArenaInputPackMode = 'auto_atlas',
  sliceMode: ArenaSliceGenMode = 'combined',
  atlasGapPx = 0,
  scaleXmlToAtlasCap = false
): Promise<void> {
  const xmlString = generateResolumeAdvancedOutputXml(
    screens,
    workspaceName,
    packMode,
    sliceMode,
    atlasGapPx,
    scaleXmlToAtlasCap
  );
  const blob = new Blob([xmlString], { type: 'application/xml;charset=utf-8' });
  const safeName = workspaceName.replace(/[^\w\u0600-\u06FF-]+/g, '_');
  const fileName = `${safeName}_Resolume_AdvancedOutput.xml`;

  await saveStudioBinaryFile(blob, fileName, {
    filterName: 'Resolume Arena Advanced Output XML (.xml)',
    extensions: ['xml'],
  });
}

/**
 * Render and export the unified 1:1 Resolume Arena Composition Atlas PNG
 * matching the exact (inputX, inputY) coordinates in the XML preset.
 */
export function exportArenaCompositionAtlasPng(
  screens: StudioProject[],
  workspaceName = 'Studio_Grid_Director',
  packMode: ArenaInputPackMode = 'auto_atlas',
  sliceMode: ArenaSliceGenMode = 'combined',
  atlasGapPx = 0
): void {
  const plan = buildArenaAtlasPlan(screens, packMode, sliceMode, atlasGapPx);
  if (plan.placements.length === 0) return;

  const scale = plan.atlasScale;
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = plan.atlasWidth;
  atlasCanvas.height = plan.atlasHeight;
  const releaseAtlasCanvas = () => {
    atlasCanvas.width = 0;
    atlasCanvas.height = 0;
  };

  try {
    const ctx = atlasCanvas.getContext('2d');
    if (!ctx) {
      releaseAtlasCanvas();
      return;
    }

    // Clear to transparent or dark broadcast slate
    ctx.fillStyle = '#05070B';
    ctx.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);

    const orderedPlacements = [...plan.placements].sort(
      (a, b) => (a.screen.wallZIndex ?? a.screenIndex) - (b.screen.wallZIndex ?? b.screenIndex)
    );

    orderedPlacements.forEach((p) => {
      const subCanvas = document.createElement('canvas');
      subCanvas.width = p.width;
      subCanvas.height = p.height;
      try {
        const sCtx = subCanvas.getContext('2d');
        if (!sCtx) return;

        const comp = computeGrid(p.screen);
        renderStudioCanvas(sCtx, p.screen, comp, {
          isLiveOutput: false,
          screenOrderIndex: p.screenIndex,
        });

        ctx.drawImage(
          subCanvas,
          Math.round(p.inputX * scale),
          Math.round(p.inputY * scale),
          Math.round(p.width * scale),
          Math.round(p.height * scale)
        );
      } finally {
        subCanvas.width = 0;
        subCanvas.height = 0;
      }
    });

    const safeName = workspaceName.replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const fileName = `${safeName}_Arena_Composition_Atlas_${atlasCanvas.width}x${atlasCanvas.height}.png`;
    atlasCanvas.toBlob((blob) => {
      try {
        if (!blob) return;
        void saveStudioBinaryFile(blob, fileName, {
          filterName: 'Resolume Arena Composition Map (.png)',
          extensions: ['png'],
        });
      } finally {
        releaseAtlasCanvas();
      }
    }, 'image/png');
  } catch {
    releaseAtlasCanvas();
  }
}

/**
 * Export a 1:1 Alpha Mask PNG (White = Active/Selected Cells & Polygons, Transparent/Black = Masked Out)
 * ready to be dropped into a Resolume Arena Slice Mask or Layer Mask.
 */
export function exportArenaSliceMaskPng(
  screen: StudioProject,
  invertMask = false
): void {
  const canvas = document.createElement('canvas');
  canvas.width = screen.compWidth;
  canvas.height = screen.compHeight;
  const releaseMaskCanvas = () => {
    canvas.width = 0;
    canvas.height = 0;
  };

  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      releaseMaskCanvas();
      return;
    }

    const computed = computeGrid(screen);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (invertMask) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.fillStyle = '#FFFFFF';
    }

    let hasAnySelection = false;

    // 1. Selected / Colored cells
    for (const cell of computed.cells) {
      if (cell.hasCustomColor || cell.resolvedNoteText) {
        hasAnySelection = true;
        ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
      }
    }

    // 2. Closed Freehand / Polygon shapes
    if (Array.isArray(screen.drawings)) {
      for (const d of screen.drawings) {
        if (!d.points || d.points.length < 3) continue;
        hasAnySelection = true;
        ctx.beginPath();
        if (d.mode === 'ellipse') {
          const p0 = d.points[0];
          const p1 = d.points[d.points.length - 1];
          const cx = (p0.x + p1.x) / 2;
          const cy = (p0.y + p1.y) / 2;
          const rx = Math.abs(p1.x - p0.x) / 2;
          const ry = Math.abs(p1.y - p0.y) / 2;
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        } else {
          ctx.moveTo(d.points[0].x, d.points[0].y);
          for (let i = 1; i < d.points.length; i++) {
            ctx.lineTo(d.points[i].x, d.points[i].y);
          }
          ctx.closePath();
        }
        ctx.fill();
      }
    }

    // Fallback: if no specific cell or polygon is selected, draw a checkerboard of odd cells so mask is still useful
    if (!hasAnySelection) {
      for (const cell of computed.cells) {
        if ((cell.row + cell.col) % 2 === 0) {
          ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';

    const safeName = screen.name.replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const fileName = `${safeName}_Arena_Slice_Mask_${screen.compWidth}x${screen.compHeight}.png`;
    canvas.toBlob((blob) => {
      try {
        if (!blob) return;
        void saveStudioBinaryFile(blob, fileName, {
          filterName: 'Resolume Arena Slice Mask (.png)',
          extensions: ['png'],
        });
      } finally {
        releaseMaskCanvas();
      }
    }, 'image/png');
  } catch {
    releaseMaskCanvas();
  }
}

/**
 * Parse a Resolume Arena Advanced Output (.xml) file and convert its <Screen> and <Slice> definitions
 * into StudioProject screens (with ProcessorZones for internal slices).
 */
export function parseResolumeAdvancedOutputXml(xmlText: string): {
  ok: boolean;
  workspaceName: string;
  compWidth: number;
  compHeight: number;
  screens: StudioProject[];
  error?: string;
} {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return {
        ok: false,
        workspaceName: '',
        compWidth: 1920,
        compHeight: 1080,
        screens: [],
        error: 'ملف XML غير صالح أو تالف (Invalid XML format)',
      };
    }

    const xmlStateEl = doc.querySelector('XmlState');
    const workspaceName =
      xmlStateEl?.getAttribute('name')?.replace(/_Arena_Preset$/i, '') ||
      'Resolume_Arena_Setup';

    const compSizeEl = doc.querySelector('CurrentCompositionTextureSize');
    const compWidth = Math.max(
      64,
      Number(compSizeEl?.getAttribute('width')) || 3840
    );
    const compHeight = Math.max(
      64,
      Number(compSizeEl?.getAttribute('height')) || 2160
    );

    const screenNodes = Array.from(doc.querySelectorAll('screens > Screen, Screen'));
    const parsedScreens: StudioProject[] = [];

    const parseRectBounds = (rectEl: Element | null) => {
      if (!rectEl) return null;
      const verts = Array.from(rectEl.querySelectorAll('v'));
      if (verts.length === 0) return null;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const v of verts) {
        const vx = Number(v.getAttribute('x'));
        const vy = Number(v.getAttribute('y'));
        if (Number.isFinite(vx) && Number.isFinite(vy)) {
          minX = Math.min(minX, vx);
          minY = Math.min(minY, vy);
          maxX = Math.max(maxX, vx);
          maxY = Math.max(maxY, vy);
        }
      }
      if (!Number.isFinite(minX)) return null;
      return {
        x: Math.round(minX),
        y: Math.round(minY),
        w: Math.max(1, Math.round(maxX - minX)),
        h: Math.max(1, Math.round(maxY - minY)),
      };
    };

    screenNodes.forEach((screenEl, sIdx) => {
      // Skip collapsed or helper Screen nodes if they have no layers and no OutputDevice
      const layersEl = screenEl.querySelector('layers');
      const outputDevEl = screenEl.querySelector(
        'OutputDeviceVirtual, OutputDeviceDisplay, OutputDevice, ScreenSetup > screens > Screen'
      );
      if (!layersEl && !outputDevEl) return;

      const paramNameEl = screenEl.querySelector('params > Param[name="Name"]');
      const screenName =
        paramNameEl?.getAttribute('value') ||
        screenEl.getAttribute('name') ||
        `Arena Screen ${sIdx + 1}`;

      const virtualDev =
        screenEl.querySelector('OutputDeviceVirtual') ||
        screenEl.querySelector('OutputDeviceDisplay') ||
        screenEl.querySelector('OutputDevice > *');

      let scrW = Number(virtualDev?.getAttribute('width')) || 0;
      let scrH = Number(virtualDev?.getAttribute('height')) || 0;

      const sliceNodes = Array.from(
        screenEl.querySelectorAll('layers > Slice, layers > Polygon, Slice')
      );

      let minInputX = Infinity;
      let minInputY = Infinity;
      let maxOutputX = 0;
      let maxOutputY = 0;

      const parsedSlices: {
        name: string;
        input: { x: number; y: number; w: number; h: number } | null;
        output: { x: number; y: number; w: number; h: number } | null;
      }[] = [];

      for (const sliceEl of sliceNodes) {
        const sliceNameParam = sliceEl.querySelector('params > Param[name="Name"]');
        const sliceName =
          sliceNameParam?.getAttribute('value') ||
          sliceEl.getAttribute('name') ||
          `Slice ${parsedSlices.length + 1}`;

        const inputBounds = parseRectBounds(sliceEl.querySelector('InputRect'));
        const outputBounds = parseRectBounds(sliceEl.querySelector('OutputRect'));

        if (inputBounds) {
          minInputX = Math.min(minInputX, inputBounds.x);
          minInputY = Math.min(minInputY, inputBounds.y);
        }
        if (outputBounds) {
          maxOutputX = Math.max(maxOutputX, outputBounds.x + outputBounds.w);
          maxOutputY = Math.max(maxOutputY, outputBounds.y + outputBounds.h);
        }

        parsedSlices.push({
          name: sliceName,
          input: inputBounds,
          output: outputBounds,
        });
      }

      if (scrW <= 0) scrW = maxOutputX > 0 ? maxOutputX : 1920;
      if (scrH <= 0) scrH = maxOutputY > 0 ? maxOutputY : 1080;

      // Convert sub-slices into ProcessorZones if there are multiple slices or sub-rect slices
      const processorZones: ProcessorZone[] = [];
      parsedSlices.forEach((sl, zIdx) => {
        const rect = sl.output || sl.input;
        if (!rect) return;
        // Skip adding a redundant zone if it's the only slice and covers the entire screen
        if (
          parsedSlices.length === 1 &&
          rect.x === 0 &&
          rect.y === 0 &&
          rect.w === scrW &&
          rect.h === scrH
        ) {
          return;
        }
        processorZones.push({
          id: `arena-slice-${Date.now()}-${sIdx}-${zIdx}`,
          name: sl.name.replace(/^.*?::\s*/, ''),
          portLabel: `SLICE ${zIdx + 1}`,
          x: Math.max(0, Math.min(scrW - 1, rect.x)),
          y: Math.max(0, Math.min(scrH - 1, rect.y)),
          width: Math.max(1, Math.min(scrW, rect.w)),
          height: Math.max(1, Math.min(scrH, rect.h)),
          color: PROCESSOR_ZONE_COLORS[zIdx % PROCESSOR_ZONE_COLORS.length],
          visible: true,
        });
      });

      const bestSquare = scrW >= 3840 ? 240 : scrW >= 1920 ? 160 : 120;

      const newScreen: StudioProject = {
        ...DEFAULT_STUDIO_PROJECT,
        id: `arena-screen-${Date.now()}-${sIdx + 1}`,
        name: screenName,
        updatedAt: new Date().toISOString(),
        compWidth: scrW,
        compHeight: scrH,
        divisionMode: 'pixels',
        squareSizePx: bestSquare,
        cellWidthPx: bestSquare,
        cellHeightPx: bestSquare,
        wallPosX: Number.isFinite(minInputX) ? minInputX : sIdx * (scrW + 40),
        wallPosY: Number.isFinite(minInputY) ? minInputY : 0,
        wallZIndex: sIdx + 1,
        processorZones,
        overlays: {
          ...DEFAULT_STUDIO_PROJECT.overlays,
          showProcessorZones: processorZones.length > 0,
        },
        centerConfig: { ...DEFAULT_CENTER_CONFIG },
        colorCalibration: { ...DEFAULT_COLOR_CALIBRATION },
        cabinetConfig: { ...DEFAULT_CABINET_CONFIG },
        ndiConfig: {
          ...DEFAULT_NDI_CONFIG,
          sourceName: `SGD_ARENA_${sIdx + 1}`,
        },
        rulers: [],
        drawings: [],
        notes: [],
        overrides: {},
      };

      parsedScreens.push(newScreen);
    });

    if (parsedScreens.length === 0) {
      return {
        ok: false,
        workspaceName,
        compWidth,
        compHeight,
        screens: [],
        error:
          'لم يتم العثور على عناصر <Screen> داخل ملف XML. تأكد من أنه ملف Resolume Advanced Output.',
      };
    }

    return {
      ok: true,
      workspaceName,
      compWidth,
      compHeight,
      screens: parsedScreens,
    };
  } catch (err) {
    return {
      ok: false,
      workspaceName: '',
      compWidth: 1920,
      compHeight: 1080,
      screens: [],
      error: err instanceof Error ? err.message : 'خطأ أثناء قراءة ملف XML',
    };
  }
}

/**
 * Resolume Arena 7 Built-in REST API Client (Default: http://127.0.0.1:8080/api/v1)
 * Routes requests through backend `/api/resolume/proxy` first to avoid browser CORS blocks,
 * with direct fallback for standalone runtimes (e.g., Tauri desktop).
 */
async function requestResolumeApi<T = unknown>(
  baseUrl: string,
  apiPath: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  payload?: unknown
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3000);

  try {
    try {
      const proxyRes = await fetch('/api/resolume/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBaseUrl: cleanBase,
          apiPath,
          method,
          payload,
        }),
        signal: controller.signal,
      });
      if (proxyRes.status !== 404) {
        const wrapper = (await proxyRes.json().catch(() => null)) as
          | { ok?: boolean; status?: number; data?: T }
          | null;
        if (wrapper && typeof wrapper === 'object') {
          return {
            ok: Boolean(wrapper.ok ?? proxyRes.ok),
            status: wrapper.status ?? proxyRes.status,
            data: (wrapper.data ?? null) as T | null,
          };
        }
      }
    } catch {
      // Proxy unavailable (e.g. Tauri desktop build), fallback to direct fetch
    }

    const directRes = await fetch(`${cleanBase}${apiPath}`, {
      method,
      headers: payload !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    const contentType = directRes.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? ((await directRes.json().catch(() => null)) as T | null)
      : null;
    return {
      ok: directRes.ok || directRes.status === 204,
      status: directRes.status,
      data,
    };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchResolumeArenaStatus(
  baseUrl: string
): Promise<ArenaLiveStatus> {
  const [prodRes, compRes] = await Promise.all([
    requestResolumeApi<{ name?: string; major?: number; minor?: number; micro?: number }>(
      baseUrl,
      '/api/v1/product',
      'GET'
    ),
    requestResolumeApi<{
      name?: { value?: string };
      width?: { value?: number };
      height?: { value?: number };
      master?: { value?: number };
      columns?: unknown[];
      layers?: unknown[];
    }>(baseUrl, '/api/v1/composition', 'GET'),
  ]);

  if (!compRes.ok || !compRes.data) {
    return {
      connected: false,
      error:
        compRes.status > 0
          ? `HTTP ${compRes.status}: تعذر قراءة بيانات الـ Composition من Resolume Arena`
          : 'تعذر الاتصال بخادم Resolume Webserver. تأكد من تفعيل Webserver في (Arena -> Preferences -> Webserver) على المنفذ 8080.',
    };
  }

  const prodJson = prodRes.ok ? prodRes.data : null;
  const compJson = compRes.data;

  return {
    connected: true,
    productName: prodJson?.name || 'Resolume Arena',
    version: prodJson
      ? `${prodJson.major ?? 7}.${prodJson.minor ?? 0}.${prodJson.micro ?? 0}`
      : '7.x',
    compName: compJson?.name?.value || 'Arena Composition',
    compWidth: Number(compJson?.width?.value) || undefined,
    compHeight: Number(compJson?.height?.value) || undefined,
    masterOpacity:
      typeof compJson?.master?.value === 'number'
        ? Math.round(compJson.master.value * 100)
        : 100,
    columnsCount: Array.isArray(compJson?.columns) ? compJson.columns.length : 0,
    layersCount: Array.isArray(compJson?.layers) ? compJson.layers.length : 0,
  };
}

/**
 * Trigger a Column in Resolume Arena via REST API (1-based column index).
 */
export async function triggerResolumeArenaColumn(
  baseUrl: string,
  columnIndex: number
): Promise<boolean> {
  const safeCol = Math.max(1, Math.round(columnIndex));
  const res = await requestResolumeApi(
    baseUrl,
    `/api/v1/composition/columns/${safeCol}/connect`,
    'POST'
  );
  return res.ok;
}

/**
 * Disconnect / Clear all playing clips in Resolume Arena.
 */
export async function clearResolumeArenaClips(baseUrl: string): Promise<boolean> {
  const res = await requestResolumeApi(
    baseUrl,
    '/api/v1/composition/disconnect-all',
    'POST'
  );
  return res.ok;
}

/**
 * Set Master Opacity (0..100%) in Resolume Arena via PUT /api/v1/composition.
 */
export async function setResolumeArenaMasterOpacity(
  baseUrl: string,
  opacityPct: number
): Promise<boolean> {
  const normalized = Math.max(0, Math.min(1, opacityPct / 100));
  const res = await requestResolumeApi(baseUrl, '/api/v1/composition', 'PUT', {
    master: { value: normalized },
  });
  return res.ok;
}
