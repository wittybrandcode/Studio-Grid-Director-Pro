export type GridDivisionMode = 'pixels' | 'counts';

export type NumberingSystem = 'coordinates' | 'sequential' | 'col-row';

export type ColoringMode = 'distinct16' | 'rainbow' | 'row' | 'col' | 'checkerboard';

export type FillStyle = 'plate' | 'solid' | 'badge';

export type RoleIconType = 'none' | 'presenter' | 'desk' | 'camera' | 'mic' | 'warning';

export type UILanguage = 'bilingual' | 'ar' | 'en';

export type NoteScope = 'single' | 'color-group';

export interface StudioNoteItem {
  id: string;
  text: string;
  scope: NoteScope;
  targetCellKey?: string;
  targetColor?: string;
  createdAt: string;
}

export interface CellOverride {
  cellKey: string; // e.g., "0-0" (row-col)
  color?: string;
  label?: string;
  icon?: RoleIconType;
  directorNote?: string;
  rolePresetId?: string;
  updatedAt?: string;
}

export type TestPatternType =
  | 'none'
  | 'bars'
  | 'border'
  | 'white'
  | 'black'
  | 'rgb_red'
  | 'rgb_green'
  | 'rgb_blue'
  | 'grayscale_ramp'
  | 'pixel_checker';

export type AspectRatioMaskType =
  | 'none'
  | '2.39:1'
  | '1.85:1'
  | '16:9'
  | '9:16'
  | '4:3';

export type DataCablingPattern =
  | 'snake_h_tl'
  | 'snake_h_tr'
  | 'snake_v_tl'
  | 'snake_v_bl';

export type GridRemainderAlign = 'start' | 'center';

export interface CalibrationOverlays {
  centerCrosshair: boolean;
  diagonals: boolean;
  safeMargins: boolean;
  safeActionPct?: number; // default 90
  safeTitlePct?: number; // default 80
  hudBadge: boolean;
  pixelRulers: boolean;
  showScreenSlate?: boolean;
  pinnedIdentify?: boolean;
  showClock?: boolean;
  showAllNoteLabels?: boolean;
  noteFontScalePct?: number; // 60 to 180 (default 100)
  mergeNoteGroupBorders?: boolean; // default true
  showRulers?: boolean; // master show/hide toggle for all custom rulers (default true)
  showRulerDistances?: boolean;
  showProcessorZones?: boolean; // default true when processorZones exist
  testPattern?: TestPatternType;
  // Moving Genlock / Tearing Sync Bar
  movingSyncBar?: boolean;
  syncBarOrientation?: 'vertical' | 'horizontal';
  syncBarSpeed?: number; // 1 to 5 (default 2)
  // Broadcast & Cinema Aspect Ratio Mask
  aspectMask?: AspectRatioMaskType;
  aspectMaskOpacity?: number; // 20 to 95 (default 72)
  // Edge Blending / Overlap Guides (px)
  edgeBlendEnabled?: boolean;
  edgeBlendTopPx?: number;
  edgeBlendRightPx?: number;
  edgeBlendBottomPx?: number;
  edgeBlendLeftPx?: number;
  // Freehand Pen & Shape Layer visibility
  showDrawings?: boolean;
}

export interface CabinetAndPitchConfig {
  enabled: boolean;
  pixelPitchMm: number; // e.g., 1.2, 1.5, 1.9, 2.5, 2.6, 2.9, 3.9 mm
  cabinetWidthPx: number; // e.g., 192, 256, 384 px
  cabinetHeightPx: number; // e.g., 192, 256, 216 px
  modulesCols: number; // modules per cabinet horizontally (e.g., 2, 3, 4)
  modulesRows: number; // modules per cabinet vertically (e.g., 2, 3, 4)
  showCabinetLabels: boolean; // C01-01, C01-02...
  showModuleGrid: boolean; // dashed inner module boundaries
  strokeColor: string;
  // Data Cabling Topology & Electrical Power Calculator
  showDataCabling?: boolean;
  cablingPattern?: DataCablingPattern;
  wattsPerCabinetMax?: number; // default 160 W per cabinet
  supplyVoltage?: 220 | 110; // default 220 V
}

export const DEFAULT_CABINET_CONFIG: CabinetAndPitchConfig = {
  enabled: false,
  pixelPitchMm: 2.6,
  cabinetWidthPx: 192,
  cabinetHeightPx: 192,
  modulesCols: 2,
  modulesRows: 2,
  showCabinetLabels: true,
  showModuleGrid: true,
  strokeColor: '#38BDF8',
  showDataCabling: false,
  cablingPattern: 'snake_h_tl',
  wattsPerCabinetMax: 160,
  supplyVoltage: 220,
};

export const PIXEL_PITCH_PRESETS: { label: string; mm: number }[] = [
  { label: 'P1.2', mm: 1.25 },
  { label: 'P1.5', mm: 1.56 },
  { label: 'P1.9', mm: 1.95 },
  { label: 'P2.5', mm: 2.5 },
  { label: 'P2.6', mm: 2.6 },
  { label: 'P2.9', mm: 2.97 },
  { label: 'P3.9', mm: 3.91 },
];

export const CABINET_SIZE_PRESETS: { labelAr: string; labelEn: string; w: number; h: number }[] = [
  { labelAr: 'كابينة 192×192 (50×50سم)', labelEn: 'Cabinet 192×192px', w: 192, h: 192 },
  { labelAr: 'كابينة 256×256 (50×50سم)', labelEn: 'Cabinet 256×256px', w: 256, h: 256 },
  { labelAr: 'كابينة 192×384 (50×100سم)', labelEn: 'Cabinet 192×384px', w: 192, h: 384 },
  { labelAr: 'كابينة 384×216 (16:9)', labelEn: 'Cabinet 384×216px (16:9)', w: 384, h: 216 },
  { labelAr: 'كابينة 480×270 (16:9)', labelEn: 'Cabinet 480×270px (16:9)', w: 480, h: 270 },
];

export interface ProcessorZone {
  id: string;
  name: string;
  portLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  visible: boolean;
}

export const PROCESSOR_ZONE_COLORS: string[] = [
  '#38BDF8', // Cyan
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#F43F5E', // Rose
  '#A855F7', // Purple
  '#FACC15', // Yellow
];

export type NdiBgKeyMode = 'solid' | 'alpha' | 'chroma_green' | 'chroma_blue';
export type NdiFrameRate = 25 | 30 | 50 | 60;

export interface NdiChannelConfig {
  enabled: boolean;
  sourceName: string; // e.g. "SGD_SCREEN_1"
  frameRate: NdiFrameRate; // 25 | 30 | 50 | 60
  bgKeyMode: NdiBgKeyMode; // 'solid' | 'alpha' | 'chroma_green' | 'chroma_blue'
  onlySelectedAndGuidesInAlpha: boolean; // When bgKeyMode !== 'solid', hide unselected background tiles so only selected tiles, notes, rulers, crosshair, and laser overlay on top of live video
}

export const DEFAULT_NDI_CONFIG: NdiChannelConfig = {
  enabled: false,
  sourceName: 'SGD_SCREEN_1',
  frameRate: 30,
  bgKeyMode: 'solid',
  onlySelectedAndGuidesInAlpha: false,
};

export interface CenterOverlayConfig {
  showLines: boolean;
  showCircle: boolean;
  circleSizePct: number; // 5 to 95 (diameter % of min screen dimension)
  circleAspectMode?: 'circle' | 'ellipse'; // 'circle' (1:1) or 'ellipse' (screen aspect)
  showCrosshairTicks?: boolean; // graduation ticks along center crosshair lines
  offsetX?: number; // px offset from center X (default 0)
  offsetY?: number; // px offset from center Y (default 0)
  strokeWidth: number; // 1 to 40 px
  strokeColor: string;
  strokeOpacity: number; // 5 to 100 %
  fillEnabled: boolean;
  fillColor: string;
  fillOpacity: number; // 0 to 100 %
}

export type RulerOrientation = 'horizontal' | 'vertical';

export interface StudioRuler {
  id: string;
  name: string;
  orientation: RulerOrientation;
  positionPx: number;
  color: string;
  strokeWidth: number;
  opacity: number; // 10 to 100 %
  dashed: boolean;
  showTicks: boolean;
  visible: boolean;
  locked?: boolean;
}

export const DEFAULT_CENTER_CONFIG: CenterOverlayConfig = {
  showLines: true,
  showCircle: true,
  circleSizePct: 44,
  circleAspectMode: 'circle',
  showCrosshairTicks: false,
  offsetX: 0,
  offsetY: 0,
  strokeWidth: 3,
  strokeColor: '#FFFFFF',
  strokeOpacity: 90,
  fillEnabled: false,
  fillColor: '#F59E0B',
  fillOpacity: 20,
};

export const RULER_COLOR_PALETTE: string[] = [
  '#38BDF8', // Sky Cyan
  '#F59E0B', // Amber Gold
  '#10B981', // Emerald Green
  '#F43F5E', // Coral Rose
  '#A855F7', // Purple
  '#FACC15', // Bright Yellow
  '#FFFFFF', // Pure White
];

export type RGBChannelFilter = 'all' | 'r' | 'g' | 'b' | 'luma';

export type ColorSwatchMode =
  | 'none'
  | 'solid'
  | 'grayscale16'
  | 'rgb_ramps'
  | 'color_checker';

export type TestImagePresetType =
  | 'none'
  | 'custom'
  | 'broadcast_chart'
  | 'hdr_ramp'
  | 'newsroom_scene';

export type ImageFitMode = 'contain' | 'cover' | 'stretch' | 'center';

export interface ColorCalibrationConfig {
  enabled: boolean;
  brightness: number; // 0 to 200 (default 100)
  contrast: number; // 0 to 200 (default 100)
  saturation: number; // 0 to 200 (default 100)
  hueRotate: number; // -180 to 180 deg (default 0)
  temperature: number; // -100 (Cool/Blue) to +100 (Warm/Amber), default 0
  gamma: number; // 0.5 to 2.5 (default 1.0)
  rgbChannel: RGBChannelFilter;
  // Split-Screen A/B Compare (Original vs Calibrated)
  splitCompareEnabled?: boolean;
  splitComparePositionPct?: number; // 10 to 90 % (default 50)
  swatchMode: ColorSwatchMode;
  solidPatchColor: string;
  solidPatchOpacity: number; // 10 to 100 %
  solidFullScreen: boolean;
  // Test Image inside Canvas
  testImagePreset: TestImagePresetType;
  customImageDataUrl?: string | null;
  customImageName?: string;
  imageOpacity: number; // 0 to 100 %
  imageFit: ImageFitMode;
  imageScalePct: number; // 20 to 200 %
  imageOffsetX?: number; // -1000 to 1000 px
  imageOffsetY?: number; // -1000 to 1000 px
  imageFlipH?: boolean;
  imageFlipV?: boolean;
  showGridOverImage: boolean;
  gridOverlayOpacity: number; // 10 to 100 %
  // Report metadata
  calibrationStatus: 'approved' | 'needs_adjustment' | 'testing';
  engineerNotes: string;
}

export const DEFAULT_COLOR_CALIBRATION: ColorCalibrationConfig = {
  enabled: true,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hueRotate: 0,
  temperature: 0,
  gamma: 1.0,
  rgbChannel: 'all',
  splitCompareEnabled: false,
  splitComparePositionPct: 50,
  swatchMode: 'none',
  solidPatchColor: '#FF0000',
  solidPatchOpacity: 100,
  solidFullScreen: false,
  testImagePreset: 'none',
  customImageDataUrl: null,
  customImageName: '',
  imageOpacity: 100,
  imageFit: 'contain',
  imageScalePct: 100,
  imageOffsetX: 0,
  imageOffsetY: 0,
  imageFlipH: false,
  imageFlipV: false,
  showGridOverImage: true,
  gridOverlayOpacity: 45,
  calibrationStatus: 'testing',
  engineerNotes: '',
};

export const CALIBRATION_SWATCH_PRESETS: {
  hex: string;
  nameAr: string;
  nameEn: string;
  ire: number;
}[] = [
  { hex: '#FF0000', nameAr: 'أحمر نقي (Red)', nameEn: 'Pure Red', ire: 21 },
  { hex: '#00FF00', nameAr: 'أخضر نقي (Green)', nameEn: 'Pure Green', ire: 71 },
  { hex: '#0000FF', nameAr: 'أزرق نقي (Blue)', nameEn: 'Pure Blue', ire: 7 },
  { hex: '#00FFFF', nameAr: 'سماوي (Cyan)', nameEn: 'Broadcast Cyan', ire: 78 },
  { hex: '#FF00FF', nameAr: 'أرجواني (Magenta)', nameEn: 'Broadcast Magenta', ire: 29 },
  { hex: '#FFFF00', nameAr: 'أصفر (Yellow)', nameEn: 'Broadcast Yellow', ire: 93 },
  { hex: '#FFFFFF', nameAr: 'أبيض 100% (100 IRE)', nameEn: 'White 100 IRE', ire: 100 },
  { hex: '#B4B4B4', nameAr: 'رمادي 75% (75 IRE)', nameEn: 'Gray 75 IRE', ire: 70 },
  { hex: '#808080', nameAr: 'رمادي نصفي 50%', nameEn: 'Mid Gray 50%', ire: 50 },
  { hex: '#2E2E2E', nameAr: 'رمادي داكن 18%', nameEn: 'Dark Gray 18%', ire: 18 },
  { hex: '#000000', nameAr: 'أسود 0% (0 IRE)', nameEn: 'Black 0 IRE', ire: 0 },
  { hex: '#D89B7C', nameAr: 'بشرة دافئة مرجعية', nameEn: 'Skin Tone Ref', ire: 65 },
];

export interface StudioProject {
  id: string;
  name: string;
  updatedAt: string;
  compWidth: number;
  compHeight: number;
  divisionMode: GridDivisionMode;
  gridRemainderAlign?: GridRemainderAlign;
  showFractionalCellDimensions?: boolean;
  squareSizePx: number;
  useCustomRectPx: boolean;
  cellWidthPx: number;
  cellHeightPx: number;
  columnsCount: number;
  rowsCount: number;
  numberingSystem: NumberingSystem;
  coloringMode: ColoringMode;
  fillStyle: FillStyle;
  gridLineWidth: number;
  fontScale: number;
  selectionColor: string;
  notes: StudioNoteItem[];
  focusedNoteId: string | null;
  overlays: CalibrationOverlays;
  centerConfig?: CenterOverlayConfig;
  colorCalibration?: ColorCalibrationConfig;
  cabinetConfig?: CabinetAndPitchConfig;
  processorZones?: ProcessorZone[];
  ndiConfig?: NdiChannelConfig;
  rulers?: StudioRuler[];
  drawings?: FreehandDrawingItem[];
  wallPosX?: number; // X position in studio pixels on the Multi-Screen Stage
  wallPosY?: number; // Y position in studio pixels on the Multi-Screen Stage
  wallZIndex?: number; // Layer order on the Multi-Screen Stage
  overrides: Record<string, CellOverride>;
}

export type FreehandDrawMode = 'polygon' | 'freehand' | 'lasso_tiles' | 'ellipse' | 'arrow';

export interface FreehandDrawingItem {
  id: string;
  mode: 'polygon' | 'freehand' | 'ellipse' | 'arrow';
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  closed?: boolean;
  fillOpacity?: number;
  label?: string;
}

export interface SavedWorkspaceProject {
  id: string;
  name: string;
  updatedAt: string;
  activeScreenId: string;
  screens: StudioProject[];
}

export interface ComputedCell {
  key: string; // `${row}-${col}`
  row: number;
  col: number;
  seqIndex: number; // 1-based
  displayId: string; // e.g. "A1", "01", "1-1"
  coordId: string; // Always "A1" for reference
  x: number;
  y: number;
  width: number;
  height: number;
  defaultColor: string;
  effectiveColor: string;
  hasCustomColor: boolean;
  resolvedNoteText?: string;
  override?: CellOverride;
}

export type LaserModeType = 'free' | 'line' | 'crosshair';

export interface LaserTrailPoint {
  x: number;
  y: number;
  t?: number;
}

export interface LaserPointerState {
  active: boolean;
  isDown?: boolean;
  x: number;
  y: number;
  originX?: number;
  originY?: number;
  color?: string; // '#FF2424' (Red), '#FACC15' (Yellow), '#FFFFFF' (White), '#10B981' (Green), '#38BDF8' (Cyan)
  laserMode?: LaserModeType;
  cellKey: string | null;
  displayId: string | null;
  trail?: LaserTrailPoint[];
  drawnStroke?: LaserTrailPoint[];
}

export interface SyncPayload {
  type:
    | 'PROJECT_UPDATE'
    | 'BLINK_CELLS'
    | 'LASER_MOVE'
    | 'IDENTIFY_SCREEN'
    | 'PING'
    | 'OUTPUT_HEARTBEAT';
  screenId?: string;
  project?: StudioProject;
  blinkingCellKeys?: string[];
  blinkActive?: boolean;
  laser?: LaserPointerState;
  timestamp: number;
}

export interface ResolutionPreset {
  id: string;
  nameAr: string;
  nameEn: string;
  width: number;
  height: number;
  aspectLabel: string;
  recommendedSquarePx: number;
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  {
    id: 'fhd',
    nameAr: 'Full HD شاشة قياسية',
    nameEn: 'Full HD Standard',
    width: 1920,
    height: 1080,
    aspectLabel: '16:9',
    recommendedSquarePx: 240,
  },
  {
    id: 'uhd4k',
    nameAr: '4K UHD فائق الدقة',
    nameEn: '4K UHD Broadcast',
    width: 3840,
    height: 2160,
    aspectLabel: '16:9',
    recommendedSquarePx: 360,
  },
  {
    id: 'ultrawide_32_9',
    nameAr: 'LED Wall عريض 32:9',
    nameEn: 'LED Wall Ultra-Wide 32:9',
    width: 3840,
    height: 1080,
    aspectLabel: '32:9',
    recommendedSquarePx: 240,
  },
  {
    id: 'triple_fhd_48_9',
    nameAr: 'LED Wall ثلاثي عريض 48:9',
    nameEn: 'LED Wall Triple FHD 48:9',
    width: 5760,
    height: 1080,
    aspectLabel: '48:9',
    recommendedSquarePx: 240,
  },
  {
    id: 'panorama_3_1',
    nameAr: 'LED Wall بانوراما 3:1',
    nameEn: 'LED Wall Panorama 3:1',
    width: 5760,
    height: 1920,
    aspectLabel: '3:1',
    recommendedSquarePx: 320,
  },
  {
    id: 'superwide_4_1',
    nameAr: 'LED Wall جدار عملاق 4:1',
    nameEn: 'LED Wall Super-Wide 4:1',
    width: 7680,
    height: 1920,
    aspectLabel: '4:1',
    recommendedSquarePx: 320,
  },
  {
    id: 'uhd8k',
    nameAr: '8K UHD جدار فائق الضخامة',
    nameEn: '8K UHD Giant Wall',
    width: 7680,
    height: 4320,
    aspectLabel: '16:9',
    recommendedSquarePx: 480,
  },
  {
    id: 'led_12k_ribbon',
    nameAr: '12K LED Ribbon بانوراما عملاقة',
    nameEn: '12K LED Panorama Ribbon',
    width: 11520,
    height: 2160,
    aspectLabel: '16:3',
    recommendedSquarePx: 360,
  },
  {
    id: 'vertical_totem',
    nameAr: 'شاشة عمودية Totem',
    nameEn: 'Studio Vertical Totem',
    width: 1080,
    height: 1920,
    aspectLabel: '9:16',
    recommendedSquarePx: 180,
  },
];

// 16-Color High-Contrast Broadcast Palette (Note: Neutral White #FFFFFF & Light Gray #E2E8F0 are reserved for selection!)
export const BROADCAST_16_PALETTE: string[] = [
  '#DC2626', // 0: Broadcast Red
  '#2563EB', // 1: Studio Cobalt Blue
  '#059669', // 2: Chroma Emerald
  '#D97706', // 3: Amber Cue
  '#7C3AED', // 4: Royal Violet
  '#0891B2', // 5: Cyan Telemetry
  '#DB2777', // 6: Magenta Key
  '#65A30D', // 7: Lime Marker
  '#EA580C', // 8: Tangerine Stage
  '#4F46E5', // 9: Indigo Deep
  '#0D9488', // 10: Teal Reference
  '#C026D3', // 11: Fuchsia Calibration
  '#CA8A04', // 12: Gold Reference
  '#0284C7', // 13: Sky Monitor
  '#E11D48', // 14: Crimson Tally
  '#16A34A', // 15: Signal Green
];

// Neutral & Selection Colors not present in the 16-color grid palette
export const SELECTION_COLOR_SWATCHES: { hex: string; nameAr: string; nameEn: string }[] = [
  { hex: '#FFFFFF', nameAr: 'أبيض حيادي', nameEn: 'Neutral White' },
  { hex: '#CBD5E1', nameAr: 'رمادي فضي', nameEn: 'Silver Gray' },
  { hex: '#FEF08A', nameAr: 'أصفر باستيل', nameEn: 'Soft Yellow' },
  { hex: '#A7F3D0', nameAr: 'نعناعي فاتح', nameEn: 'Soft Mint' },
  { hex: '#BFDBFE', nameAr: 'سماوي فاتح', nameEn: 'Soft Sky' },
  { hex: '#FBCFE8', nameAr: 'وردي فاتح', nameEn: 'Soft Pink' },
  { hex: '#DDD6FE', nameAr: 'لافندر فاتح', nameEn: 'Soft Lavender' },
  { hex: '#FED7AA', nameAr: 'خوخي فاتح', nameEn: 'Soft Peach' },
];

export interface StudioRoleSwatch {
  id: string;
  nameAr: string;
  nameEn: string;
  defaultLabelAr: string;
  defaultLabelEn: string;
  color: string;
  icon: RoleIconType;
}

export const STUDIO_ROLE_SWATCHES: StudioRoleSwatch[] = [
  {
    id: 'presenter',
    nameAr: 'الصحفي / المذيع',
    nameEn: 'Presenter / Anchor',
    defaultLabelAr: 'موقع الصحفي',
    defaultLabelEn: 'Anchor Stand',
    color: '#FFFFFF',
    icon: 'presenter',
  },
  {
    id: 'guest',
    nameAr: 'الضيف',
    nameEn: 'Studio Guest',
    defaultLabelAr: 'موقع الضيف',
    defaultLabelEn: 'Guest Pos',
    color: '#CBD5E1',
    icon: 'presenter',
  },
  {
    id: 'desk',
    nameAr: 'الطاولة الرئيسية',
    nameEn: 'Studio Desk',
    defaultLabelAr: 'الطاولة',
    defaultLabelEn: 'Main Desk',
    color: '#FEF08A',
    icon: 'desk',
  },
  {
    id: 'camera',
    nameAr: 'منطقة الكاميرا',
    nameEn: 'Camera Zone',
    defaultLabelAr: 'كاميرا 1',
    defaultLabelEn: 'Camera 1 Zone',
    color: '#A7F3D0',
    icon: 'camera',
  },
];

export const DEFAULT_STUDIO_PROJECT: StudioProject = {
  id: 'screen-1',
  name: 'الشاشة 1 — الرئيسية',
  updatedAt: new Date().toISOString(),
  compWidth: 1920,
  compHeight: 1080,
  divisionMode: 'pixels',
  squareSizePx: 240,
  useCustomRectPx: false,
  cellWidthPx: 240,
  cellHeightPx: 240,
  columnsCount: 8,
  rowsCount: 5,
  numberingSystem: 'coordinates',
  coloringMode: 'distinct16',
  fillStyle: 'plate',
  gridLineWidth: 2,
  fontScale: 100,
  selectionColor: '#FEF08A',
  focusedNoteId: null,
  notes: [
    {
      id: 'note-anchor',
      text: 'موقع الصحفي الرئيسي',
      scope: 'single',
      targetCellKey: '2-2',
      targetColor: '#CBD5E1',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'note-desk',
      text: 'طاولة الحوار الرئيسية',
      scope: 'color-group',
      targetColor: '#FFFFFF',
      createdAt: new Date().toISOString(),
    },
  ],
  overlays: {
    centerCrosshair: true,
    diagonals: false,
    safeMargins: false,
    hudBadge: false,
    pixelRulers: false,
  },
  centerConfig: { ...DEFAULT_CENTER_CONFIG },
  ndiConfig: { ...DEFAULT_NDI_CONFIG },
  rulers: [],
  overrides: {
    '2-2': {
      cellKey: '2-2',
      color: '#CBD5E1',
      updatedAt: new Date().toISOString(),
    },
    '3-3': {
      cellKey: '3-3',
      color: '#FFFFFF',
      updatedAt: new Date().toISOString(),
    },
    '3-4': {
      cellKey: '3-4',
      color: '#FFFFFF',
      updatedAt: new Date().toISOString(),
    },
  },
};

export const PRESET_PROJECT_TEMPLATES: StudioProject[] = [
  DEFAULT_STUDIO_PROJECT,
  {
    id: 'screen-2',
    name: 'الشاشة 2 — جدار بانوراما',
    updatedAt: new Date().toISOString(),
    compWidth: 3840,
    compHeight: 1080,
    divisionMode: 'counts',
    squareSizePx: 240,
    useCustomRectPx: false,
    cellWidthPx: 240,
    cellHeightPx: 216,
    columnsCount: 16,
    rowsCount: 5,
    numberingSystem: 'coordinates',
    coloringMode: 'distinct16',
    fillStyle: 'plate',
    gridLineWidth: 2,
    fontScale: 100,
    selectionColor: '#FEF08A',
    focusedNoteId: null,
    notes: [
      {
        id: 'note-wide-desk',
        text: 'خلفية الضيوف البانورامية',
        scope: 'color-group',
        targetColor: '#FFFFFF',
        createdAt: new Date().toISOString(),
      },
    ],
    overlays: {
      centerCrosshair: true,
      diagonals: false,
      safeMargins: false,
      hudBadge: false,
      pixelRulers: false,
    },
    centerConfig: { ...DEFAULT_CENTER_CONFIG },
    rulers: [],
    overrides: {
      '2-7': { cellKey: '2-7', color: '#FFFFFF' },
      '2-8': { cellKey: '2-8', color: '#FFFFFF' },
    },
  },
];


