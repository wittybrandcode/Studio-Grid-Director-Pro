import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowsLeftRight,
  BoundingBox,
  CaretDown,
  CaretUp,
  Cpu,
  Cube,
  Eraser,
  Eye,
  EyeSlash,
  GridFour,
  Hash,
  Lightning,
  LockKey,
  NotePencil,
  Palette,
  Plugs,
  Plus,
  Ruler,
  SelectionInverse,
  SelectionPlus,
  Tag,
  Target,
  Trash,
} from '@phosphor-icons/react';
import {
  CABINET_SIZE_PRESETS,
  CabinetAndPitchConfig,
  ColoringMode,
  DataCablingPattern,
  DEFAULT_CABINET_CONFIG,
  FillStyle,
  GridDivisionMode,
  GridRemainderAlign,
  NumberingSystem,
  PIXEL_PITCH_PRESETS,
  PROCESSOR_ZONE_COLORS,
  ProcessorZone,
  RESOLUTION_PRESETS,
  SELECTION_COLOR_SWATCHES,
  StudioNoteItem,
  StudioProject,
  UILanguage,
} from '../../types/studio';
import {
  ComputedGridResult,
  computePhysicalWallMetrics,
  getNoteMatchingCellKeys,
} from '../../utils/gridEngine';
import { NumericInput } from '../NumericInput';
import { ColorPickerModal } from '../ColorPickerModal';

interface GridAndNotesSectionProps {
  project: StudioProject;
  computed: ComputedGridResult;
  lang: UILanguage;
  expandSignal?: { open: boolean; seq: number };
  activePresetId: string;
  selectedCellsCount: number;
  colorToNoteMap: Map<string, StudioNoteItem>;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  displaySection?: 'both' | 'grid' | 'notes';
  onUpdateProject: (updater: (prev: StudioProject) => StudioProject) => void;
  onDeleteNoteById: (noteId: string) => void;
  onBlinkCellsOnLiveScreen: (cellKeys: string[]) => void;
  onInvertSelection: () => void;
}

export const GridAndNotesSection: React.FC<GridAndNotesSectionProps> = React.memo(({
  project,
  computed,
  lang,
  expandSignal,
  activePresetId,
  selectedCellsCount,
  colorToNoteMap,
  canvasRef,
  displaySection = 'both',
  onUpdateProject,
  onDeleteNoteById,
  onBlinkCellsOnLiveScreen,
  onInvertSelection,
}) => {
  const [isGridOpen, setIsGridOpen] = useState<boolean>(true);
  const [isCabinetsOpen, setIsCabinetsOpen] = useState<boolean>(false);
  const [isZonesOpen, setIsZonesOpen] = useState<boolean>(false);
  const [isNotesOpen, setIsNotesOpen] = useState<boolean>(true);
  const [pickerTarget, setPickerTarget] = useState<
    | { mode: 'selection'; initialColor: string }
    | { mode: 'note'; note: StudioNoteItem; initialColor: string }
    | null
  >(null);
  const t = (ar: string, en: string) => (lang === 'en' ? en : ar);

  useEffect(() => {
    if (expandSignal && expandSignal.seq > 0) {
      setIsGridOpen(expandSignal.open);
      setIsCabinetsOpen(expandSignal.open);
      setIsZonesOpen(expandSignal.open);
      setIsNotesOpen(expandSignal.open);
    }
  }, [expandSignal]);

  const cabCfg: CabinetAndPitchConfig = useMemo(
    () => ({
      ...DEFAULT_CABINET_CONFIG,
      ...(project.cabinetConfig || {}),
    }),
    [project.cabinetConfig]
  );

  const physMetrics = useMemo(() => computePhysicalWallMetrics(project), [project]);
  const processorZones: ProcessorZone[] = project.processorZones || [];
  const showProcessorZones = project.overlays?.showProcessorZones !== false;

  const updateCabinetConfig = (patch: Partial<CabinetAndPitchConfig>) => {
    onUpdateProject((prev) => ({
      ...prev,
      cabinetConfig: {
        ...DEFAULT_CABINET_CONFIG,
        ...(prev.cabinetConfig || {}),
        ...patch,
      },
    }));
  };

  const applyProcessorPreset = (
    preset: 'quad2x2' | 'halves_lr' | 'cols3' | 'rows2_tb' | 'custom_one'
  ) => {
    const W = project.compWidth;
    const H = project.compHeight;
    const hw = Math.round(W / 2);
    const hh = Math.round(H / 2);
    const thirdW = Math.round(W / 3);
    const now = Date.now();

    let nextZones: ProcessorZone[] = [];
    if (preset === 'quad2x2') {
      nextZones = [
        {
          id: `z-${now}-1`,
          portLabel: 'PORT 1',
          name: t('أعلى يسار (TL)', 'Top-Left'),
          x: 0,
          y: 0,
          width: hw,
          height: hh,
          color: PROCESSOR_ZONE_COLORS[0],
          visible: true,
        },
        {
          id: `z-${now}-2`,
          portLabel: 'PORT 2',
          name: t('أعلى يمين (TR)', 'Top-Right'),
          x: hw,
          y: 0,
          width: W - hw,
          height: hh,
          color: PROCESSOR_ZONE_COLORS[1],
          visible: true,
        },
        {
          id: `z-${now}-3`,
          portLabel: 'PORT 3',
          name: t('أسفل يسار (BL)', 'Bottom-Left'),
          x: 0,
          y: hh,
          width: hw,
          height: H - hh,
          color: PROCESSOR_ZONE_COLORS[2],
          visible: true,
        },
        {
          id: `z-${now}-4`,
          portLabel: 'PORT 4',
          name: t('أسفل يمين (BR)', 'Bottom-Right'),
          x: hw,
          y: hh,
          width: W - hw,
          height: H - hh,
          color: PROCESSOR_ZONE_COLORS[3],
          visible: true,
        },
      ];
    } else if (preset === 'halves_lr') {
      nextZones = [
        {
          id: `z-${now}-1`,
          portLabel: 'PORT 1',
          name: t('نصف أيسر (Left)', 'Left Half'),
          x: 0,
          y: 0,
          width: hw,
          height: H,
          color: PROCESSOR_ZONE_COLORS[0],
          visible: true,
        },
        {
          id: `z-${now}-2`,
          portLabel: 'PORT 2',
          name: t('نصف أيمن (Right)', 'Right Half'),
          x: hw,
          y: 0,
          width: W - hw,
          height: H,
          color: PROCESSOR_ZONE_COLORS[1],
          visible: true,
        },
      ];
    } else if (preset === 'cols3') {
      nextZones = [
        {
          id: `z-${now}-1`,
          portLabel: 'PORT 1',
          name: t('معالج 1 (يسار)', 'Proc 1 Left'),
          x: 0,
          y: 0,
          width: thirdW,
          height: H,
          color: PROCESSOR_ZONE_COLORS[0],
          visible: true,
        },
        {
          id: `z-${now}-2`,
          portLabel: 'PORT 2',
          name: t('معالج 2 (وسط)', 'Proc 2 Center'),
          x: thirdW,
          y: 0,
          width: thirdW,
          height: H,
          color: PROCESSOR_ZONE_COLORS[1],
          visible: true,
        },
        {
          id: `z-${now}-3`,
          portLabel: 'PORT 3',
          name: t('معالج 3 (يمين)', 'Proc 3 Right'),
          x: thirdW * 2,
          y: 0,
          width: W - thirdW * 2,
          height: H,
          color: PROCESSOR_ZONE_COLORS[2],
          visible: true,
        },
      ];
    } else if (preset === 'rows2_tb') {
      nextZones = [
        {
          id: `z-${now}-1`,
          portLabel: 'PORT 1',
          name: t('صف علوي (Top)', 'Top Row'),
          x: 0,
          y: 0,
          width: W,
          height: hh,
          color: PROCESSOR_ZONE_COLORS[0],
          visible: true,
        },
        {
          id: `z-${now}-2`,
          portLabel: 'PORT 2',
          name: t('صف سفلي (Bottom)', 'Bottom Row'),
          x: 0,
          y: hh,
          width: W,
          height: H - hh,
          color: PROCESSOR_ZONE_COLORS[1],
          visible: true,
        },
      ];
    } else {
      const idx = processorZones.length + 1;
      const newZone: ProcessorZone = {
        id: `z-${now}-${idx}`,
        portLabel: `PORT ${idx}`,
        name: t(`مخرج ${idx}`, `Output ${idx}`),
        x: 0,
        y: 0,
        width: Math.min(W, 1920),
        height: Math.min(H, 1080),
        color: PROCESSOR_ZONE_COLORS[(idx - 1) % PROCESSOR_ZONE_COLORS.length],
        visible: true,
      };
      nextZones = [...processorZones, newZone];
    }

    onUpdateProject((prev) => ({
      ...prev,
      overlays: {
        ...prev.overlays,
        showProcessorZones: true,
      },
      processorZones: nextZones,
    }));
  };

  const showAllNoteLabels = Boolean(project.overlays?.showAllNoteLabels);
  const mergeGroupBorders = project.overlays?.mergeNoteGroupBorders !== false;
  const noteFontScale = project.overlays?.noteFontScalePct ?? 100;

  const handleUpdateNoteText = (noteId: string, newText: string) => {
    onUpdateProject((prev) => ({
      ...prev,
      notes: (prev.notes || []).map((n) => (n.id === noteId ? { ...n, text: newText } : n)),
    }));
  };

  const handleUpdateNoteColor = (note: StudioNoteItem, newColorHex: string) => {
    const upper = newColorHex.toUpperCase();
    const matchingKeys = getNoteMatchingCellKeys(note, computed.cells);
    onUpdateProject((prev) => {
      const nextOverrides = { ...prev.overrides };
      for (const k of matchingKeys) {
        nextOverrides[k] = {
          ...(nextOverrides[k] || { cellKey: k }),
          color: upper,
          updatedAt: new Date().toISOString(),
        };
      }
      return {
        ...prev,
        overrides: nextOverrides,
        notes: (prev.notes || []).map((n) =>
          n.id === note.id ? { ...n, targetColor: upper } : n
        ),
      };
    });
  };

  const handleToggleNoteScope = (note: StudioNoteItem) => {
    const matchingKeys = getNoteMatchingCellKeys(note, computed.cells);
    const noteHex = (
      note.targetColor ||
      computed.cellMap[note.targetCellKey || '']?.effectiveColor ||
      project.selectionColor ||
      '#FFFFFF'
    ).toUpperCase();

    if (note.scope === 'single') {
      onUpdateProject((prev) => {
        const nextOverrides = { ...prev.overrides };
        if (note.targetCellKey) {
          nextOverrides[note.targetCellKey] = {
            ...(nextOverrides[note.targetCellKey] || { cellKey: note.targetCellKey }),
            color: noteHex,
            updatedAt: new Date().toISOString(),
          };
        }
        return {
          ...prev,
          overrides: nextOverrides,
          notes: (prev.notes || []).map((n) =>
            n.id === note.id
              ? { ...n, scope: 'color-group', targetColor: noteHex, targetCellKey: undefined }
              : n
          ),
        };
      });
    } else {
      const firstKey = matchingKeys[0] || note.targetCellKey || '0-0';
      onUpdateProject((prev) => ({
        ...prev,
        notes: (prev.notes || []).map((n) =>
          n.id === note.id
            ? { ...n, scope: 'single', targetCellKey: firstKey, targetColor: noteHex }
            : n
        ),
      }));
    }
  };

  const handleActivateNoteColorForPainting = (note: StudioNoteItem) => {
    const noteHex = (
      note.targetColor ||
      computed.cellMap[note.targetCellKey || '']?.effectiveColor ||
      '#FFFFFF'
    ).toUpperCase();

    onUpdateProject((prev) => ({
      ...prev,
      selectionColor: noteHex,
      notes: (prev.notes || []).map((n) =>
        n.id === note.id ? { ...n, scope: 'color-group', targetColor: noteHex } : n
      ),
    }));
  };

  const showGridSection = displaySection === 'both' || displaySection === 'grid';
  const showNotesSection = displaySection === 'both' || displaySection === 'notes';

  return (
    <div className="space-y-2">
      {/* Collapsible Box 1: Screen & Grid Dimensions (Compact W / H / □px / C×R Badges) */}
      {showGridSection && (
        <div className="bg-[#2A2D34] border border-[#434853] rounded-none">
          <div
            onClick={() => setIsGridOpen((v) => !v)}
            className="flex items-center justify-between px-2.5 py-1.5 bg-[#32363F] border-b border-[#434853] cursor-pointer select-none"
          >
            <div className="flex items-center gap-1.5">
              <GridFour weight="bold" className="w-4 h-4 text-[#38BDF8] shrink-0" />
              <span className="text-xs font-bold text-[#DCE0E8]">
                {t('الشبكة والأبعاد', 'Grid & Size')}
              </span>
              <span dir="ltr" className="text-[10px] font-mono text-[#FEF08A]">
                ({computed.cols}×{computed.rows})
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsGridOpen((v) => !v);
              }}
              className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
            >
              {isGridOpen ? (
                <CaretUp weight="bold" className="w-3.5 h-3.5" />
              ) : (
                <CaretDown weight="bold" className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {isGridOpen && (
            <div className="p-2 space-y-2">
              <select
                value={activePresetId}
                onChange={(e) => {
                  const preset = RESOLUTION_PRESETS.find((p) => p.id === e.target.value);
                  if (!preset) return;
                  onUpdateProject((prev) => ({
                    ...prev,
                    compWidth: preset.width,
                    compHeight: preset.height,
                    squareSizePx: preset.recommendedSquarePx,
                    columnsCount: Math.max(1, Math.round(preset.width / preset.recommendedSquarePx)),
                    rowsCount: Math.max(1, Math.round(preset.height / preset.recommendedSquarePx)),
                  }));
                }}
                className="w-full h-7 bg-[#202328] border border-[#434853] focus:border-[#38BDF8] px-2 text-xs text-[#DCE0E8] outline-none cursor-pointer rounded-none"
              >
                <option value="custom">{t('أبعاد مخصصة (Custom)', 'Custom Resolution')}</option>
                {RESOLUTION_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {lang === 'en' ? p.nameEn : p.nameAr} ({p.width}×{p.height})
                  </option>
                ))}
              </select>

              {/* Inline W & H Prefix Row */}
              <div className="grid grid-cols-2 gap-1.5" dir="ltr">
                <div className="flex items-center gap-1">
                  <span
                    title={t('عرض الشاشة بالبكسل (Width px)', 'Screen Width (px)')}
                    className="w-6 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[10px] font-mono font-bold text-[#38BDF8] shrink-0"
                  >
                    W
                  </span>
                  <NumericInput
                    value={project.compWidth}
                    min={100}
                    max={16384}
                    step={60}
                    onChange={(val) =>
                      onUpdateProject((prev) => ({ ...prev, compWidth: val }))
                    }
                    className="flex-1 min-w-0"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span
                    title={t('ارتفاع الشاشة بالبكسل (Height px)', 'Screen Height (px)')}
                    className="w-6 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[10px] font-mono font-bold text-[#38BDF8] shrink-0"
                  >
                    H
                  </span>
                  <NumericInput
                    value={project.compHeight}
                    min={100}
                    max={16384}
                    step={60}
                    onChange={(val) =>
                      onUpdateProject((prev) => ({ ...prev, compHeight: val }))
                    }
                    className="flex-1 min-w-0"
                  />
                </div>
              </div>

              {/* Division Mode Toggle + Inline Input */}
              <div className="flex items-center gap-1.5" dir="ltr">
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        divisionMode: 'pixels' as GridDivisionMode,
                      }))
                    }
                    title={t('التقسيم حسب حجم المربع بالبكسل (Square px)', 'Divide by Square Size (px)')}
                    className={`h-7 px-2 text-[10px] font-mono font-bold border rounded-none cursor-pointer transition-colors ${
                      project.divisionMode === 'pixels'
                        ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                        : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                    }`}
                  >
                    □ px
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        divisionMode: 'counts' as GridDivisionMode,
                      }))
                    }
                    title={t('التقسيم حسب عدد الأعمدة والصفوف (Cols × Rows)', 'Divide by Columns × Rows')}
                    className={`h-7 px-2 text-[10px] font-mono font-bold border rounded-none cursor-pointer transition-colors ${
                      project.divisionMode === 'counts'
                        ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                        : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                    }`}
                  >
                    C×R
                  </button>
                </div>

                {project.divisionMode === 'pixels' ? (
                  <NumericInput
                    value={project.squareSizePx}
                    min={40}
                    max={1000}
                    step={10}
                    onChange={(val) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        squareSizePx: val,
                        useCustomRectPx: false,
                      }))
                    }
                    className="flex-1 min-w-0"
                  />
                ) : (
                  <div className="flex-1 grid grid-cols-2 gap-1 min-w-0">
                    <NumericInput
                      value={project.columnsCount}
                      min={1}
                      max={120}
                      step={1}
                      onChange={(val) =>
                        onUpdateProject((prev) => ({ ...prev, columnsCount: val }))
                      }
                    />
                    <NumericInput
                      value={project.rowsCount}
                      min={1}
                      max={120}
                      step={1}
                      onChange={(val) =>
                        onUpdateProject((prev) => ({ ...prev, rowsCount: val }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* Compact Remainder Bar when resolution has fractional edge cells */}
              {project.divisionMode === 'pixels' &&
                (computed.hasRemainderX || computed.hasRemainderY) && (
                  <div className="px-2 py-1 bg-[#202328] border border-[#434853] flex items-center justify-between gap-1" dir="ltr">
                    <span className="text-[10px] font-mono text-[#FEF08A] truncate">
                      {computed.hasRemainderX ? `ΔX:${computed.remainderWidthPx} ` : ''}
                      {computed.hasRemainderY ? `ΔY:${computed.remainderHeightPx}` : ''}
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      {(
                        [
                          { id: 'start', label: '↖ Edge', title: t('البواقي على الأطراف', 'Remainders at Edge') },
                          { id: 'center', label: '⊕ Center', title: t('توسيط الشبكة وتوزيع البواقي', 'Center Grid') },
                        ] as { id: GridRemainderAlign; label: string; title: string }[]
                      ).map((opt) => {
                        const active = (project.gridRemainderAlign || 'start') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            title={opt.title}
                            onClick={() =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                gridRemainderAlign: opt.id,
                              }))
                            }
                            className={`px-1.5 py-0.5 text-[9px] font-mono font-bold border rounded-none cursor-pointer ${
                              active
                                ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                                : 'bg-[#282C35] text-[#AEB5C2] border-[#3A3E47]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateProject((prev) => ({
                            ...prev,
                            showFractionalCellDimensions:
                              prev.showFractionalCellDimensions === false ? true : false,
                          }))
                        }
                        title={t('إظهار/إخفاء مقاس البكسلات على مربعات الحواف', 'Toggle Edge Cell px Badges')}
                        className={`px-1.5 py-0.5 text-[9px] font-mono font-bold border rounded-none cursor-pointer ${
                          project.showFractionalCellDimensions !== false
                            ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                            : 'bg-[#282C35] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        px
                      </button>
                    </div>
                  </div>
                )}

              {/* Compact Single-Row Colors & Numbering Selects */}
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={project.coloringMode}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      coloringMode: e.target.value as ColoringMode,
                    }))
                  }
                  title={t('نظام تلوين الشبكة', 'Grid Coloring Mode')}
                  className="w-full h-7 bg-[#202328] border border-[#434853] px-2 text-[11px] text-[#DCE0E8] outline-none cursor-pointer rounded-none"
                >
                  <option value="distinct16">{t('ألوان متباينة (16)', 'Distinct 16')}</option>
                  <option value="rainbow">{t('طيف قوس قزح', 'Rainbow')}</option>
                  <option value="row">{t('حسب الصفوف', 'By Row')}</option>
                  <option value="col">{t('حسب الأعمدة', 'By Column')}</option>
                  <option value="checkerboard">{t('شطرنج داكن', 'Dark Slate')}</option>
                </select>

                <select
                  value={project.numberingSystem}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      numberingSystem: e.target.value as NumberingSystem,
                    }))
                  }
                  title={t('نظام ترقيم المربعات', 'Square Numbering System')}
                  className="w-full h-7 bg-[#202328] border border-[#434853] px-2 text-[11px] font-mono text-[#DCE0E8] outline-none cursor-pointer rounded-none"
                >
                  <option value="coordinates">A1, A2, B1</option>
                  <option value="sequential">01, 02, 03</option>
                  <option value="col-row">1-1, 2-1</option>
                </select>
              </div>

              {/* Compact Grid Line Width (┼ px), Font Scale (Aa %) & Badge Style */}
              <div className="p-1.5 bg-[#202328] border border-[#434853] rounded-none space-y-1.5" dir="ltr">
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className="flex items-center gap-1"
                    title={t('سمك خطوط الشبكة (px)', 'Grid Line Width (px)')}
                  >
                    <span className="text-[10px] font-mono font-bold text-[#9FA6B3] shrink-0">
                      ┼ {project.gridLineWidth ?? 2}px
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      step={1}
                      value={project.gridLineWidth ?? 2}
                      onChange={(e) =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          gridLineWidth: Number(e.target.value),
                        }))
                      }
                      className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                    />
                  </div>

                  <div
                    className="flex items-center gap-1"
                    title={t('حجم خط الترقيم (%)', 'Number Font Size (%)')}
                  >
                    <span className="text-[10px] font-mono font-bold text-[#9FA6B3] shrink-0">
                      Aa {project.fontScale ?? 100}%
                    </span>
                    <input
                      type="range"
                      min={50}
                      max={170}
                      step={5}
                      value={project.fontScale ?? 100}
                      onChange={(e) =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          fontScale: Number(e.target.value),
                        }))
                      }
                      className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'plate', ar: 'لوحة', en: 'Plate' },
                      { id: 'solid', ar: 'مباشر', en: 'Solid' },
                      { id: 'badge', ar: 'بطاقة', en: 'Badge' },
                    ] as { id: FillStyle; ar: string; en: string }[]
                  ).map((st) => {
                    const active = (project.fillStyle || 'plate') === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() =>
                          onUpdateProject((prev) => ({
                            ...prev,
                            fillStyle: st.id,
                          }))
                        }
                        className={`py-0.5 text-[10px] font-bold border rounded-none cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                            : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        {t(st.ar, st.en)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsible Box 1B: LED Cabinets, Modules & Power (Ultra-Compact Telemetry Chips & Arrow Icons) */}
      {showGridSection && (
        <div className="bg-[#2A2D34] border border-[#434853] rounded-none">
          <div
            onClick={() => setIsCabinetsOpen((v) => !v)}
            className="flex items-center justify-between px-2.5 py-1.5 bg-[#32363F] border-b border-[#434853] cursor-pointer select-none"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Cube weight="bold" className="w-4 h-4 text-[#8CC63F] shrink-0" />
              <span className="text-xs font-bold text-[#DCE0E8] truncate">
                {t('كابينات LED', 'LED Cabinets')}
              </span>
              <span dir="ltr" className="text-[10px] font-mono text-[#FEF08A] shrink-0">
                ({physMetrics.widthMeters}×{physMetrics.heightMeters}m · {physMetrics.maxKw}kW)
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => updateCabinetConfig({ enabled: !cabCfg.enabled })}
                className={`w-6 h-6 flex items-center justify-center border rounded-none cursor-pointer transition-colors ${
                  cabCfg.enabled
                    ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                    : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                }`}
                title={t(
                  'إظهار/إخفاء شبكة كابينات وموديولات الـ LED',
                  'Toggle LED cabinets & modules overlay'
                )}
              >
                {cabCfg.enabled ? (
                  <Eye weight="bold" className="w-3.5 h-3.5" />
                ) : (
                  <EyeSlash weight="bold" className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsCabinetsOpen((v) => !v)}
                className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
              >
                {isCabinetsOpen ? (
                  <CaretUp weight="bold" className="w-3.5 h-3.5" />
                ) : (
                  <CaretDown weight="bold" className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {isCabinetsOpen && (
            <div className="p-2 space-y-2">
              {/* 4-Chip Compact Engineering Telemetry Grid (No Verbose Paragraphs) */}
              <div className="grid grid-cols-2 gap-1 text-[10px] font-mono" dir="ltr">
                <div
                  title={t('الأبعاد بالمتر والسنتيمتر والمساحة', 'Physical Dimensions & Area')}
                  className="p-1.5 bg-[#202328] border border-[#3A3E47] flex items-center justify-between"
                >
                  <Ruler weight="bold" className="w-3.5 h-3.5 text-[#FEF08A] shrink-0" />
                  <div className="text-right">
                    <div className="font-bold text-[#FEF08A]">
                      {physMetrics.widthMeters}×{physMetrics.heightMeters}m
                    </div>
                    <div className="text-[9px] text-[#9FA6B3]">
                      {physMetrics.areaSqMeters}m² · ⌀{physMetrics.diagonalInches}&quot;
                    </div>
                  </div>
                </div>

                <div
                  title={t('إجمالي الكابينات والموديولات', 'Total Cabinets & Modules')}
                  className="p-1.5 bg-[#202328] border border-[#3A3E47] flex items-center justify-between"
                >
                  <Cube weight="bold" className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                  <div className="text-right">
                    <div className="font-bold text-[#38BDF8]">
                      {physMetrics.cabinetsCols}×{physMetrics.cabinetsRows} ({physMetrics.totalCabinets} Cab)
                    </div>
                    <div className="text-[9px] text-[#9FA6B3]">
                      {physMetrics.totalModules} Mod ({physMetrics.cabinetWidthCm}×{physMetrics.cabinetHeightCm}cm)
                    </div>
                  </div>
                </div>

                <div
                  title={t('القدرة الكهربائية القصوى والتيار بالأمبير', 'Max Power (kW) & Current (Amps)')}
                  className="p-1.5 bg-[#202328] border border-[#3A3E47] flex items-center justify-between"
                >
                  <Lightning weight="fill" className="w-3.5 h-3.5 text-[#8CC63F] shrink-0" />
                  <div className="text-right">
                    <div className="font-bold text-[#8CC63F]">
                      {physMetrics.maxKw}kW · {physMetrics.maxAmps}A
                    </div>
                    <div className="text-[9px] text-[#9FA6B3]">
                      Avg {physMetrics.avgKw}kW ({physMetrics.supplyVoltage}V)
                    </div>
                  </div>
                </div>

                <div
                  title={t('منافذ الشبكة المطلوبة (650K بكسل لكل منفذ)', 'Required 1GbE Ports (650K px/port)')}
                  className="p-1.5 bg-[#202328] border border-[#3A3E47] flex items-center justify-between"
                >
                  <Plugs weight="bold" className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                  <div className="text-right">
                    <div className="font-bold text-[#FCD34D]">
                      {physMetrics.ethernetPortsRequired} Ports (1GbE)
                    </div>
                    <div className="text-[9px] text-[#9FA6B3]">
                      {physMetrics.maxCabinetsPerPort} Cab / Port
                    </div>
                  </div>
                </div>
              </div>

              {/* Pixel Pitch Quick Chips + Numeric Input */}
              <div className="space-y-1" dir="ltr">
                <div className="grid grid-cols-7 gap-1">
                  {PIXEL_PITCH_PRESETS.map((pp) => {
                    const active = Math.abs(cabCfg.pixelPitchMm - pp.mm) < 0.03;
                    return (
                      <button
                        key={pp.label}
                        type="button"
                        onClick={() => updateCabinetConfig({ pixelPitchMm: pp.mm, enabled: true })}
                        className={`py-0.5 text-[9px] font-mono font-bold border rounded-none cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                            : 'bg-[#202328] hover:bg-[#323742] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        {pp.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cabinet Preset Select + 4-Column Compact Row: W | H | Mc | Mr */}
              <div className="space-y-1.5">
                <select
                  value={
                    CABINET_SIZE_PRESETS.find(
                      (p) => p.w === cabCfg.cabinetWidthPx && p.h === cabCfg.cabinetHeightPx
                    )
                      ? `${cabCfg.cabinetWidthPx}x${cabCfg.cabinetHeightPx}`
                      : 'custom'
                  }
                  onChange={(e) => {
                    if (e.target.value === 'custom') return;
                    const [w, h] = e.target.value.split('x').map(Number);
                    if (w && h) {
                      updateCabinetConfig({
                        cabinetWidthPx: w,
                        cabinetHeightPx: h,
                        enabled: true,
                      });
                    }
                  }}
                  className="w-full h-7 bg-[#202328] border border-[#434853] px-2 text-[11px] text-[#DCE0E8] outline-none cursor-pointer rounded-none"
                >
                  <option value="custom">{t('مقاس كابينة مخصص', 'Custom Cabinet Size')}</option>
                  {CABINET_SIZE_PRESETS.map((cp) => (
                    <option key={`${cp.w}x${cp.h}`} value={`${cp.w}x${cp.h}`}>
                      {lang === 'en' ? cp.labelEn : cp.labelAr}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-1.5" dir="ltr">
                  <div className="flex items-center gap-1">
                    <span
                      title={t('عرض الكابينة بالبكسل (Cabinet W px)', 'Cabinet Width (px)')}
                      className="w-6 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[9px] font-mono font-bold text-[#38BDF8] shrink-0"
                    >
                      Cw
                    </span>
                    <NumericInput
                      value={cabCfg.cabinetWidthPx}
                      min={32}
                      max={2048}
                      step={16}
                      onChange={(val) => updateCabinetConfig({ cabinetWidthPx: val })}
                      className="flex-1 min-w-0"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      title={t('ارتفاع الكابينة بالبكسل (Cabinet H px)', 'Cabinet Height (px)')}
                      className="w-6 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[9px] font-mono font-bold text-[#38BDF8] shrink-0"
                    >
                      Ch
                    </span>
                    <NumericInput
                      value={cabCfg.cabinetHeightPx}
                      min={32}
                      max={2048}
                      step={16}
                      onChange={(val) => updateCabinetConfig({ cabinetHeightPx: val })}
                      className="flex-1 min-w-0"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      title={t('عدد الموديولات أفقياً داخل الكابينة', 'Modules Columns per Cabinet')}
                      className="w-6 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[9px] font-mono font-bold text-[#9FA6B3] shrink-0"
                    >
                      Mc
                    </span>
                    <NumericInput
                      value={cabCfg.modulesCols}
                      min={1}
                      max={12}
                      step={1}
                      onChange={(val) => updateCabinetConfig({ modulesCols: val })}
                      className="flex-1 min-w-0"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      title={t('عدد الموديولات عمودياً داخل الكابينة', 'Modules Rows per Cabinet')}
                      className="w-6 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[9px] font-mono font-bold text-[#9FA6B3] shrink-0"
                    >
                      Mr
                    </span>
                    <NumericInput
                      value={cabCfg.modulesRows}
                      min={1}
                      max={12}
                      step={1}
                      onChange={(val) => updateCabinetConfig({ modulesRows: val })}
                      className="flex-1 min-w-0"
                    />
                  </div>
                </div>
              </div>

              {/* Single-Row Icon & Arrow Strip: Cabinet IDs | Module Grid | Snake Cabling Directions | Voltage */}
              <div className="p-1.5 bg-[#202328] border border-[#434853] rounded-none flex items-center justify-between gap-1" dir="ltr">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      updateCabinetConfig({
                        showCabinetLabels: !cabCfg.showCabinetLabels,
                        enabled: true,
                      })
                    }
                    title={t('إظهار/إخفاء ترقيم الكابينات (C01-01)', 'Toggle Cabinet IDs')}
                    className={`h-6 px-1.5 text-[9px] font-mono font-bold border rounded-none cursor-pointer ${
                      cabCfg.showCabinetLabels
                        ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                        : 'bg-[#282C35] text-[#AEB5C2] border-[#3A3E47]'
                    }`}
                  >
                    ID
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateCabinetConfig({
                        showModuleGrid: !cabCfg.showModuleGrid,
                        enabled: true,
                      })
                    }
                    title={t('إظهار/إخفاء شبكة الموديولات الداخلية', 'Toggle Module Dashed Grid')}
                    className={`h-6 px-1.5 text-[9px] font-mono font-bold border rounded-none cursor-pointer ${
                      cabCfg.showModuleGrid
                        ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                        : 'bg-[#282C35] text-[#AEB5C2] border-[#3A3E47]'
                    }`}
                  >
                    Mod
                  </button>
                </div>

                {/* Snake Cabling Toggle + 4 Arrow Direction Icons */}
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateCabinetConfig({
                        showDataCabling: !cabCfg.showDataCabling,
                        enabled: true,
                      })
                    }
                    title={t('إظهار/إخفاء مسار كابلات الداتا (Snake Cabling)', 'Toggle Snake Data Cabling')}
                    className={`h-6 px-1.5 text-[9px] font-mono font-bold border rounded-none cursor-pointer ${
                      cabCfg.showDataCabling
                        ? 'bg-[#F59E0B] text-[#140E05] border-[#FEF3C7]'
                        : 'bg-[#282C35] text-[#AEB5C2] border-[#3A3E47]'
                    }`}
                  >
                    ⚡
                  </button>
                  {(
                    [
                      { id: 'snake_h_tl', sym: '↘', title: t('مسار أفقي من أعلى يسار', 'Horiz Snake Top-Left') },
                      { id: 'snake_h_tr', sym: '↙', title: t('مسار أفقي من أعلى يمين', 'Horiz Snake Top-Right') },
                      { id: 'snake_v_tl', sym: '↓', title: t('مسار عمودي من أعلى يسار', 'Vert Snake Top-Left') },
                      { id: 'snake_v_bl', sym: '↑', title: t('مسار عمودي من أسفل يسار', 'Vert Snake Bottom-Left') },
                    ] as { id: DataCablingPattern; sym: string; title: string }[]
                  ).map((pat) => {
                    const isPat =
                      cabCfg.showDataCabling && (cabCfg.cablingPattern || 'snake_h_tl') === pat.id;
                    return (
                      <button
                        key={pat.id}
                        type="button"
                        title={pat.title}
                        onClick={() =>
                          updateCabinetConfig({
                            cablingPattern: pat.id,
                            showDataCabling: true,
                            enabled: true,
                          })
                        }
                        className={`w-6 h-6 flex items-center justify-center text-[10px] font-mono font-bold border rounded-none cursor-pointer ${
                          isPat
                            ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                            : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        {pat.sym}
                      </button>
                    );
                  })}
                </div>

                {/* Voltage Toggle (220V / 110V) */}
                <button
                  type="button"
                  onClick={() =>
                    updateCabinetConfig({
                      supplyVoltage: (cabCfg.supplyVoltage || 220) === 220 ? 110 : 220,
                    })
                  }
                  title={t('تبديل الجهد الكهربائي (220V / 110V)', 'Toggle Supply Voltage (220V / 110V)')}
                  className="h-6 px-1.5 bg-[#282C35] hover:bg-[#3E4452] text-[#FCD34D] border border-[#3A3E47] text-[9px] font-mono font-bold rounded-none cursor-pointer"
                >
                  {cabCfg.supplyVoltage || 220}V
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsible Box 1C: Processor Zones & Hardware Outputs Mapping */}
      {showGridSection && (
        <div className="bg-[#2A2D34] border border-[#434853] rounded-none">
          <div
            onClick={() => setIsZonesOpen((v) => !v)}
            className="flex items-center justify-between px-2.5 py-1.5 bg-[#32363F] border-b border-[#434853] cursor-pointer select-none"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Cpu weight="bold" className="w-4 h-4 text-[#A855F7] shrink-0" />
              <span className="text-xs font-bold text-[#DCE0E8] truncate">
                {t('مناطق المعالج', 'Processor Ports')}
              </span>
              <span dir="ltr" className="text-[10px] font-mono text-[#D8B4FE] shrink-0">
                ({processorZones.length})
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setIsZonesOpen(true);
                  applyProcessorPreset('custom_one');
                }}
                title={t('إضافة مخرج معالج مخصص (+)', 'Add Custom Processor Port (+)')}
                className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#38BDF8] text-[#C4CAD4] hover:text-[#09131C] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
              >
                <Plus weight="bold" className="w-3.5 h-3.5" />
              </button>

              {processorZones.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        overlays: {
                          ...prev.overlays,
                          showProcessorZones: prev.overlays?.showProcessorZones === false,
                        },
                      }))
                    }
                    title={t('إظهار/إخفاء مناطق المعالج', 'Toggle Processor Zones')}
                    className={`w-6 h-6 flex items-center justify-center border rounded-none cursor-pointer transition-colors ${
                      showProcessorZones
                        ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                        : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                    }`}
                  >
                    {showProcessorZones ? (
                      <Eye weight="bold" className="w-3.5 h-3.5" />
                    ) : (
                      <EyeSlash weight="bold" className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        processorZones: [],
                      }))
                    }
                    title={t('مسح جميع مخارج المعالج', 'Clear All Processor Ports')}
                    className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#EF4444] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
                  >
                    <Trash weight="bold" className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setIsZonesOpen((v) => !v)}
                className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
              >
                {isZonesOpen ? (
                  <CaretUp weight="bold" className="w-3.5 h-3.5" />
                ) : (
                  <CaretDown weight="bold" className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {isZonesOpen && (
            <div className="p-2 space-y-2">
              {/* Compact Symbolic Auto-Slicing Presets */}
              <div className="grid grid-cols-4 gap-1" dir="ltr">
                <button
                  type="button"
                  onClick={() => applyProcessorPreset('quad2x2')}
                  title={t('تقسيم 2×2 أرباع (4 Ports)', '2×2 Quadrants (4 Ports)')}
                  className="py-1 px-1 bg-[#202328] hover:bg-[#38BDF8] text-[#DCE0E8] hover:text-[#09131C] border border-[#3A3E47] rounded-none text-[10px] font-mono font-bold cursor-pointer transition-colors"
                >
                  ⊞ 2×2
                </button>
                <button
                  type="button"
                  onClick={() => applyProcessorPreset('halves_lr')}
                  title={t('نصفين يمين / يسار (2 Ports)', 'Left / Right Halves (2 Ports)')}
                  className="py-1 px-1 bg-[#202328] hover:bg-[#38BDF8] text-[#DCE0E8] hover:text-[#09131C] border border-[#3A3E47] rounded-none text-[10px] font-mono font-bold cursor-pointer transition-colors"
                >
                  ◫ 2×LR
                </button>
                <button
                  type="button"
                  onClick={() => applyProcessorPreset('cols3')}
                  title={t('3 أعمدة معالجات (3 Ports)', '3 Vertical Columns (3 Ports)')}
                  className="py-1 px-1 bg-[#202328] hover:bg-[#38BDF8] text-[#DCE0E8] hover:text-[#09131C] border border-[#3A3E47] rounded-none text-[10px] font-mono font-bold cursor-pointer transition-colors"
                >
                  Ⅲ 3×Col
                </button>
                <button
                  type="button"
                  onClick={() => applyProcessorPreset('rows2_tb')}
                  title={t('صفين أعلى / أسفل (2 Ports)', 'Top / Bottom Rows (2 Ports)')}
                  className="py-1 px-1 bg-[#202328] hover:bg-[#38BDF8] text-[#DCE0E8] hover:text-[#09131C] border border-[#3A3E47] rounded-none text-[10px] font-mono font-bold cursor-pointer transition-colors"
                >
                  ⊟ 2×TB
                </button>
              </div>

              {/* Active Processor Zones Editable List */}
              {processorZones.length > 0 && (
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {processorZones.map((zone) => {
                    const zPx = zone.width * zone.height;
                    const loadPct = Math.round((zPx / 650_000) * 100);
                    const isOver = zPx > 650_000;
                    return (
                      <div
                        key={zone.id}
                        className="p-1.5 bg-[#202328] border border-[#3F444E] rounded-none space-y-1"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={() => {
                                const nextColor =
                                  PROCESSOR_ZONE_COLORS[
                                    (PROCESSOR_ZONE_COLORS.indexOf(zone.color) + 1) %
                                      PROCESSOR_ZONE_COLORS.length
                                  ];
                                onUpdateProject((prev) => ({
                                  ...prev,
                                  processorZones: (prev.processorZones || []).map((z) =>
                                    z.id === zone.id ? { ...z, color: nextColor } : z
                                  ),
                                }));
                              }}
                              style={{ backgroundColor: zone.color }}
                              className="w-4 h-4 border border-[#DCE0E8] rounded-none shrink-0 cursor-pointer"
                              title={t('تغيير لون المخرج', 'Cycle Zone Color')}
                            />
                            <input
                              type="text"
                              value={zone.portLabel}
                              onChange={(e) =>
                                onUpdateProject((prev) => ({
                                  ...prev,
                                  processorZones: (prev.processorZones || []).map((z) =>
                                    z.id === zone.id ? { ...z, portLabel: e.target.value } : z
                                  ),
                                }))
                              }
                              dir="ltr"
                              className="w-14 h-5 bg-[#181A1F] border border-[#434853] px-1 text-[9px] font-mono font-bold text-[#FEF08A] outline-none rounded-none"
                            />
                            <input
                              type="text"
                              value={zone.name}
                              onChange={(e) =>
                                onUpdateProject((prev) => ({
                                  ...prev,
                                  processorZones: (prev.processorZones || []).map((z) =>
                                    z.id === zone.id ? { ...z, name: e.target.value } : z
                                  ),
                                }))
                              }
                              className="min-w-0 flex-1 h-5 bg-[#181A1F] border border-[#434853] px-1.5 text-[10px] font-bold text-[#DCE0E8] outline-none rounded-none"
                            />
                          </div>

                          <div className="flex items-center gap-1 shrink-0" dir="ltr">
                            <span
                              className={`text-[9px] font-mono font-bold ${
                                isOver ? 'text-[#F87171]' : 'text-[#8CC63F]'
                              }`}
                            >
                              {(zPx / 1000).toFixed(0)}K ({loadPct}%)
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateProject((prev) => ({
                                  ...prev,
                                  processorZones: (prev.processorZones || []).map((z) =>
                                    z.id === zone.id ? { ...z, visible: !z.visible } : z
                                  ),
                                }))
                              }
                              className="w-5 h-5 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border border-[#3A3E47] rounded-none cursor-pointer"
                              title={t('إظهار/إخفاء المخرج', 'Toggle visibility')}
                            >
                              {zone.visible !== false ? (
                                <Eye weight="bold" className="w-3 h-3 text-[#8CC63F]" />
                              ) : (
                                <EyeSlash weight="bold" className="w-3 h-3" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateProject((prev) => ({
                                  ...prev,
                                  processorZones: (prev.processorZones || []).filter(
                                    (z) => z.id !== zone.id
                                  ),
                                }))
                              }
                              className="w-5 h-5 flex items-center justify-center bg-[#282C35] hover:bg-[#EF4444] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] rounded-none cursor-pointer"
                              title={t('حذف المخرج', 'Delete zone')}
                            >
                              <Trash weight="bold" className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-1" dir="ltr">
                          <NumericInput
                            value={zone.x}
                            min={0}
                            max={project.compWidth - 16}
                            step={60}
                            onChange={(val) =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                processorZones: (prev.processorZones || []).map((z) =>
                                  z.id === zone.id ? { ...z, x: val } : z
                                ),
                              }))
                            }
                          />
                          <NumericInput
                            value={zone.y}
                            min={0}
                            max={project.compHeight - 16}
                            step={60}
                            onChange={(val) =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                processorZones: (prev.processorZones || []).map((z) =>
                                  z.id === zone.id ? { ...z, y: val } : z
                                ),
                              }))
                            }
                          />
                          <NumericInput
                            value={zone.width}
                            min={64}
                            max={project.compWidth}
                            step={60}
                            onChange={(val) =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                processorZones: (prev.processorZones || []).map((z) =>
                                  z.id === zone.id ? { ...z, width: val } : z
                                ),
                              }))
                            }
                          />
                          <NumericInput
                            value={zone.height}
                            min={64}
                            max={project.compHeight}
                            step={60}
                            onChange={(val) =>
                              onUpdateProject((prev) => ({
                                ...prev,
                                processorZones: (prev.processorZones || []).map((z) =>
                                  z.id === zone.id ? { ...z, height: val } : z
                                ),
                              }))
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Collapsible Box 2: Selection Color & Registered Notes (100% Icon-First Action Bars) */}
      {showNotesSection && (
        <div className="bg-[#2A2D34] border border-[#434853] rounded-none">
          <div
            onClick={() => setIsNotesOpen((v) => !v)}
            className="flex items-center justify-between px-2.5 py-1.5 bg-[#32363F] border-b border-[#434853] cursor-pointer select-none"
          >
            <div className="flex items-center gap-1.5">
              <NotePencil weight="bold" className="w-4 h-4 text-[#FEF08A] shrink-0" />
              <span className="text-xs font-bold text-[#DCE0E8]">
                {t('التحديد والملاحظات', 'Notes')}
              </span>
              <span className="px-1 py-0.2 bg-[#1B1E24] border border-[#3A3F4B] text-[10px] font-mono font-bold text-[#9FA6B3]">
                {(project.notes || []).length}
              </span>
            </div>

            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {/* Invert Selection Icon Button */}
              {selectedCellsCount > 0 && (
                <button
                  type="button"
                  onClick={onInvertSelection}
                  title={t('عكس المربعات المحددة حالياً (Invert Selection)', 'Invert selected squares')}
                  className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#38BDF8] text-[#AEB5C2] hover:text-[#09131C] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
                >
                  <SelectionInverse weight="bold" className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Clear All Selections & Notes Icon Button */}
              {selectedCellsCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      overrides: {},
                      notes: [],
                      focusedNoteId: null,
                      selectionColor: '#FFFFFF',
                    }))
                  }
                  title={t('مسح جميع التحديدات والملاحظات (Clear All)', 'Clear all selections & notes')}
                  className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#EF4444] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
                >
                  <Eraser weight="bold" className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Show/Hide All Note Labels Icon Toggle */}
              {(project.notes || []).length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      overlays: {
                        ...prev.overlays,
                        showAllNoteLabels: !prev.overlays?.showAllNoteLabels,
                      },
                    }))
                  }
                  title={t(
                    'إظهار/إخفاء عناوين كل الملاحظات فوق مربعاتها دائماً',
                    'Toggle all note titles over squares'
                  )}
                  className={`w-6 h-6 flex items-center justify-center border rounded-none cursor-pointer transition-colors ${
                    showAllNoteLabels
                      ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                      : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                  }`}
                >
                  <Tag weight={showAllNoteLabels ? 'fill' : 'bold'} className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Clear Focus Filter Icon */}
              {project.focusedNoteId && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject((prev) => ({ ...prev, focusedNoteId: null }))
                  }
                  title={t('إلغاء العزل وإظهار كل الشاشة', 'Show All (Exit Focus)')}
                  className="w-6 h-6 flex items-center justify-center bg-[#F59E0B] text-[#140E05] border border-[#FEF3C7] rounded-none cursor-pointer"
                >
                  <Eye weight="bold" className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsNotesOpen((v) => !v)}
                className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
              >
                {isNotesOpen ? (
                  <CaretUp weight="bold" className="w-3.5 h-3.5" />
                ) : (
                  <CaretDown weight="bold" className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {isNotesOpen && (
            <div className="p-2 space-y-2">
              {/* Single-Row Selection Color Swatches + Pro Picker Icon */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() =>
                    setPickerTarget({
                      mode: 'selection',
                      initialColor: project.selectionColor,
                    })
                  }
                  className="w-6 h-6 bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                  title={t('فتح منتقي ألوان التحديد الاحترافي', 'Open Pro Selection Color Picker')}
                >
                  <Palette weight="bold" className="w-3.5 h-3.5" />
                </button>

                {SELECTION_COLOR_SWATCHES.map((sw) => {
                  const isActive =
                    project.selectionColor.toUpperCase() === sw.hex.toUpperCase();
                  const ownerNote = colorToNoteMap.get(sw.hex.toUpperCase());
                  return (
                    <button
                      key={sw.hex}
                      type="button"
                      onClick={() =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          selectionColor: sw.hex,
                        }))
                      }
                      style={{ backgroundColor: sw.hex }}
                      title={
                        ownerNote
                          ? `${lang === 'en' ? sw.nameEn : sw.nameAr} — ${t('مرتبط بـ:', 'Used by:')} ${ownerNote.text}`
                          : lang === 'en'
                          ? sw.nameEn
                          : sw.nameAr
                      }
                      className={`relative w-6 h-6 border flex items-center justify-center rounded-none cursor-pointer ${
                        isActive
                          ? 'border-[#DCE0E8] ring-2 ring-[#C8CDD8] scale-105'
                          : 'border-[#4A4F5C]'
                      }`}
                    >
                      {ownerNote && (
                        <LockKey weight="bold" className="w-3.5 h-3.5 text-[#1C1E22]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Compact Note Font Scale (Aa%) & Contiguous Border Toggle Icon */}
              {(project.notes || []).length > 0 && (
                <div className="px-2 py-1 bg-[#202328] border border-[#3F444E] rounded-none flex items-center gap-2" dir="ltr">
                  <span
                    title={t('حجم خط الملاحظات على الشاشة (%)', 'Canvas Note Font Size (%)')}
                    className="text-[10px] font-mono font-bold text-[#9FA6B3] shrink-0"
                  >
                    Aa {noteFontScale}%
                  </span>
                  <input
                    type="range"
                    min={65}
                    max={175}
                    step={5}
                    value={noteFontScale}
                    onChange={(e) =>
                      onUpdateProject((prev) => ({
                        ...prev,
                        overlays: {
                          ...prev.overlays,
                          noteFontScalePct: Number(e.target.value),
                        },
                      }))
                    }
                    className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                  />
                  {showAllNoteLabels && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          overlays: {
                            ...prev.overlays,
                            mergeNoteGroupBorders:
                              prev.overlays?.mergeNoteGroupBorders === false ? true : false,
                          },
                        }))
                      }
                      title={t(
                        'دمج حدود المربعات المتجاورة لنفس الملاحظة في إطار خارجي موحد',
                        'Merge borders of adjacent squares in the same note group'
                      )}
                      className={`w-6 h-6 flex items-center justify-center border rounded-none cursor-pointer shrink-0 ${
                        mergeGroupBorders
                          ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                          : 'bg-[#282C35] text-[#AEB5C2] border-[#3A3E47]'
                      }`}
                    >
                      <BoundingBox weight="bold" className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Registered Notes List (Pure Icon Action Strip per Note) */}
              {(project.notes || []).length === 0 ? (
                <div className="p-2 bg-[#202328] border border-[#3F444E] text-center text-[10px] text-[#9EA5B3] rounded-none">
                  {t(
                    'انقر بالزر الأيمن على أي مربع في الشاشة لإضافة ملاحظة',
                    'Right-click any square on canvas to attach a note'
                  )}
                </div>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {(project.notes || []).map((note) => {
                    const matchingKeys = getNoteMatchingCellKeys(note, computed.cells);
                    const matchingLabels = matchingKeys
                      .map((k) => computed.cellMap[k]?.displayId)
                      .filter(Boolean);
                    const isFocused = project.focusedNoteId === note.id;

                    const swatchColor =
                      note.targetColor ||
                      computed.cellMap[note.targetCellKey || '']?.effectiveColor ||
                      '#FFFFFF';
                    const isCurrentPaintColor =
                      project.selectionColor.toUpperCase() === swatchColor.toUpperCase();

                    return (
                      <div
                        key={note.id}
                        className={`p-1.5 border transition-colors flex flex-col gap-1 rounded-none ${
                          isFocused
                            ? 'bg-[#2E3440] border-[#38BDF8]'
                            : 'bg-[#202328] border-[#3F444E]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() =>
                                setPickerTarget({
                                  mode: 'note',
                                  note,
                                  initialColor: swatchColor,
                                })
                              }
                              style={{ backgroundColor: swatchColor }}
                              className="w-5 h-5 border border-[#DCE0E8] shrink-0 rounded-none cursor-pointer"
                              title={t('تغيير لون الملاحظة', 'Change note color')}
                            />
                            <input
                              type="text"
                              value={note.text}
                              onChange={(e) => handleUpdateNoteText(note.id, e.target.value)}
                              className="min-w-0 flex-1 h-6 bg-[#1B1E23] border border-[#434853] focus:border-[#38BDF8] px-1.5 text-xs font-bold text-[#DCE0E8] outline-none rounded-none"
                            />
                          </div>

                          {/* Pure Icon-Only Action Strip for Note */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            {/* Paint More Squares with this Note's Color */}
                            <button
                              type="button"
                              onClick={() => handleActivateNoteColorForPainting(note)}
                              title={t(
                                'تفعيل لون هذه الملاحظة لإضافة/إزالة مربعات بالنقر على الشاشة',
                                'Select this note color to paint/add squares on canvas'
                              )}
                              className={`w-6 h-6 flex items-center justify-center border rounded-none cursor-pointer transition-colors ${
                                isCurrentPaintColor
                                  ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                                  : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                              }`}
                            >
                              <SelectionPlus weight="bold" className="w-3.5 h-3.5" />
                            </button>

                            {/* Toggle Single Square vs Color Group Scope */}
                            <button
                              type="button"
                              onClick={() => handleToggleNoteScope(note)}
                              title={t(
                                note.scope === 'single'
                                  ? 'النطاق الحالي: مربع فردي فقط (انقر للتحويل لمجموعة اللون)'
                                  : 'النطاق الحالي: كل مربعات هذا اللون (انقر للتحويل لمربع فردي)',
                                'Toggle scope: Single Square vs Color Group'
                              )}
                              className={`w-6 h-6 flex items-center justify-center border rounded-none cursor-pointer transition-colors ${
                                note.scope === 'color-group'
                                  ? 'bg-[#282C35] text-[#7DD3FC] border-[#2C4C66]'
                                  : 'bg-[#282C35] text-[#AEB5C2] border-[#3A3E47]'
                              }`}
                            >
                              <ArrowsLeftRight weight="bold" className="w-3 h-3" />
                            </button>

                            {/* Spotlight / Focus Note on Canvas */}
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateProject((prev) => ({
                                  ...prev,
                                  focusedNoteId: prev.focusedNoteId === note.id ? null : note.id,
                                }))
                              }
                              className={`w-6 h-6 flex items-center justify-center border rounded-none cursor-pointer transition-colors ${
                                isFocused
                                  ? 'bg-[#F59E0B] text-[#140E05] border-[#FEF3C7]'
                                  : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                              }`}
                              title={t('إبراز وعزل هذه الملاحظة على الشاشة', 'Spotlight this note')}
                            >
                              <Target weight={isFocused ? 'fill' : 'bold'} className="w-3.5 h-3.5" />
                            </button>

                            {/* Blink / Flash Note Squares on Live Output */}
                            {matchingKeys.length > 0 && (
                              <button
                                type="button"
                                onClick={() => onBlinkCellsOnLiveScreen(matchingKeys)}
                                className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#FACC15] text-[#AEB5C2] hover:text-[#111317] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
                                title={t(
                                  'ومضة تنبيهية لمربعات هذه الملاحظة على الشاشة الحية',
                                  'Blink these squares on Live Output'
                                )}
                              >
                                <Lightning weight="fill" className="w-3 h-3" />
                              </button>
                            )}

                            {/* Delete Note */}
                            <button
                              type="button"
                              onClick={() => onDeleteNoteById(note.id)}
                              className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#EF4444] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
                              title={t('حذف الملاحظة', 'Delete Note')}
                            >
                              <Trash weight="bold" className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Compact Monospace Coordinates Readout */}
                        <div className="flex items-center justify-between text-[9px] text-[#9EA5B3] font-mono px-0.5" dir="ltr">
                          <span className="truncate">
                            {matchingLabels.length > 0 ? matchingLabels.join(', ') : '—'}
                          </span>
                          <span className="text-[#38BDF8] font-bold shrink-0">
                            [{matchingKeys.length}]
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Professional Studio Color Picker Modal */}
      <ColorPickerModal
        isOpen={Boolean(pickerTarget)}
        initialColor={pickerTarget?.initialColor || project.selectionColor}
        title={
          pickerTarget?.mode === 'note'
            ? t(`لون الملاحظة: ${pickerTarget.note.text}`, `Note Color: ${pickerTarget.note.text}`)
            : t('اختيار لون التحديد والملاحظات', 'Selection & Note Color Picker')
        }
        lang={lang}
        canvasRef={canvasRef}
        lockedColorsMap={
          pickerTarget?.mode === 'note'
            ? new Map(
                Array.from(colorToNoteMap.entries())
                  .filter(([, n]) => n.id !== pickerTarget.note.id)
                  .map(([hex, n]) => [hex, n.text])
              )
            : undefined
        }
        onApply={(newHex) => {
          if (pickerTarget?.mode === 'note') {
            handleUpdateNoteColor(pickerTarget.note, newHex);
          } else {
            onUpdateProject((prev) => ({
              ...prev,
              selectionColor: newHex.toUpperCase(),
            }));
          }
        }}
        onClose={() => setPickerTarget(null)}
      />
    </div>
  );
});
