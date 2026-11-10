import React from 'react';
import {
  Grid,
  Hash,
  Layers,
  Maximize,
  Palette,
  ArrowLeftRight,
  Crosshair,
} from 'lucide-react';
import {
  ColoringMode,
  FillStyle,
  GridDivisionMode,
  NumberingSystem,
  RESOLUTION_PRESETS,
  StudioProject,
  UILanguage,
} from '../types/studio';
import { ComputedGridResult } from '../utils/gridEngine';
import { NumericInput } from './NumericInput';

interface CompositionSidebarProps {
  project: StudioProject;
  computed: ComputedGridResult;
  lang: UILanguage;
  onUpdateProject: (updater: (prev: StudioProject) => StudioProject) => void;
}

export const CompositionSidebar: React.FC<CompositionSidebarProps> = ({
  project,
  computed,
  lang,
  onUpdateProject,
}) => {
  const t = (ar: string, en: string) => {
    if (lang === 'ar') return ar;
    if (lang === 'en') return en;
    return `${ar} | ${en}`;
  };

  const handlePresetChange = (presetId: string) => {
    const preset = RESOLUTION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onUpdateProject((prev) => ({
      ...prev,
      compWidth: preset.width,
      compHeight: preset.height,
      squareSizePx: preset.recommendedSquarePx,
      cellWidthPx: preset.recommendedSquarePx,
      cellHeightPx: preset.recommendedSquarePx,
    }));
  };

  const activePresetId =
    RESOLUTION_PRESETS.find(
      (p) => p.width === project.compWidth && p.height === project.compHeight
    )?.id || 'custom';

  const swapDimensions = () => {
    onUpdateProject((prev) => ({
      ...prev,
      compWidth: prev.compHeight,
      compHeight: prev.compWidth,
    }));
  };

  return (
    <aside className="w-80 xl:w-88 shrink-0 bg-[#0F1522] border-l border-slate-800/90 flex flex-col h-full overflow-y-auto select-none">
      {/* Section 1: Composition Dimensions */}
      <div className="p-4 border-b border-slate-800/80 space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-wide text-slate-200 flex items-center gap-2">
            <Maximize className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{t('أبعاد الشاشة والتكوين', 'Composition Size')}</span>
          </h2>
          <span dir="ltr" className="text-[11px] font-mono tabular-nums text-amber-400">
            {project.compWidth}×{project.compHeight}px
          </span>
        </div>

        {/* Presets Dropdown */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-slate-400">
            {t('قوالب الشاشات القياسية', 'Broadcast Screen Presets')}
          </label>
          <select
            value={activePresetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="w-full bg-[#090D16] border border-slate-700/90 focus:border-amber-500 rounded-lg px-2.5 py-2 text-xs text-slate-100 font-medium outline-none transition-colors cursor-pointer"
          >
            <option value="custom">
              {t('أبعاد مخصصة (Custom Dimensions)', 'Custom Pixel Dimensions')}
            </option>
            {RESOLUTION_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.nameAr} — {preset.width}×{preset.height} ({preset.aspectLabel})
              </option>
            ))}
          </select>
        </div>

        {/* Width & Height Inputs */}
        <div className="grid grid-cols-11 gap-2 items-end">
          <div className="col-span-5 space-y-1">
            <label className="block text-[11px] text-slate-400">
              {t('العرض (W px)', 'Width (px)')}
            </label>
            <NumericInput
              value={project.compWidth}
              min={100}
              max={16384}
              step={10}
              onChange={(val) =>
                onUpdateProject((prev) => ({ ...prev, compWidth: val }))
              }
            />
          </div>

          <div className="col-span-1 flex justify-center pb-1">
            <button
              type="button"
              onClick={swapDimensions}
              title={t('تبديل العرض والارتفاع', 'Swap Width & Height')}
              className="p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="col-span-5 space-y-1">
            <label className="block text-[11px] text-slate-400">
              {t('الارتفاع (H px)', 'Height (px)')}
            </label>
            <NumericInput
              value={project.compHeight}
              min={100}
              max={16384}
              step={10}
              onChange={(val) =>
                onUpdateProject((prev) => ({ ...prev, compHeight: val }))
              }
            />
          </div>
        </div>
      </div>

      {/* Section 2: Grid Division Mode */}
      <div className="p-4 border-b border-slate-800/80 space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-wide text-slate-200 flex items-center gap-2">
            <Grid className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{t('نظام تقسيم المربعات', 'Grid Division Mode')}</span>
          </h2>
          <span dir="ltr" className="text-[11px] font-mono tabular-nums text-slate-400">
            {computed.cols}×{computed.rows} ({computed.cells.length})
          </span>
        </div>

        {/* Segmented Control for Mode A vs Mode B */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#090D16] rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() =>
              onUpdateProject((prev) => ({ ...prev, divisionMode: 'pixels' as GridDivisionMode }))
            }
            className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap truncate cursor-pointer ${
              project.divisionMode === 'pixels'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('بحجم البكسل (px)', 'By Pixel Size')}
          </button>
          <button
            type="button"
            onClick={() =>
              onUpdateProject((prev) => ({ ...prev, divisionMode: 'counts' as GridDivisionMode }))
            }
            className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap truncate cursor-pointer ${
              project.divisionMode === 'counts'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('بعدد الأعمدة × الصفوف', 'By Cols × Rows')}
          </button>
        </div>

        {project.divisionMode === 'pixels' ? (
          <div className="space-y-3">
            {/* Toggle uniform square vs custom rectangular cell */}
            <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
              <span>{t('تخصيص عرض وارتفاع المربع منفصلين', 'Custom Rectangular Cell W×H')}</span>
              <input
                type="checkbox"
                checked={project.useCustomRectPx}
                onChange={(e) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    useCustomRectPx: e.target.checked,
                    cellWidthPx: prev.squareSizePx,
                    cellHeightPx: prev.squareSizePx,
                  }))
                }
                className="accent-amber-500 w-3.5 h-3.5 rounded cursor-pointer"
              />
            </label>

            {!project.useCustomRectPx ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    {t('حجم المربع (Square px)', 'Square Size (px)')}
                  </span>
                  <NumericInput
                    value={project.squareSizePx}
                    min={40}
                    max={1000}
                    step={10}
                    onChange={(val) =>
                      onUpdateProject((prev) => ({ ...prev, squareSizePx: val }))
                    }
                    className="w-32"
                  />
                </div>
                <input
                  type="range"
                  min={40}
                  max={1000}
                  step={5}
                  value={project.squareSizePx}
                  onChange={(e) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      squareSizePx: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
                {/* Quick pixel size buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[120, 160, 180, 200, 240, 320, 480].map((px) => (
                    <button
                      key={px}
                      type="button"
                      onClick={() =>
                        onUpdateProject((prev) => ({ ...prev, squareSizePx: px }))
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums border transition-colors cursor-pointer ${
                        project.squareSizePx === px
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                          : 'bg-[#090D16] border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {px}px
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-400">
                    {t('عرض الخلية (px)', 'Cell Width (px)')}
                  </label>
                  <NumericInput
                    value={project.cellWidthPx}
                    min={40}
                    max={2000}
                    step={10}
                    onChange={(val) =>
                      onUpdateProject((prev) => ({ ...prev, cellWidthPx: val }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-400">
                    {t('ارتفاع الخلية (px)', 'Cell Height (px)')}
                  </label>
                  <NumericInput
                    value={project.cellHeightPx}
                    min={40}
                    max={2000}
                    step={10}
                    onChange={(val) =>
                      onUpdateProject((prev) => ({ ...prev, cellHeightPx: val }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">
                  {t('عدد الأعمدة (Columns)', 'Columns Count')}
                </label>
                <NumericInput
                  value={project.columnsCount}
                  min={1}
                  max={120}
                  step={1}
                  onChange={(val) =>
                    onUpdateProject((prev) => ({ ...prev, columnsCount: val }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">
                  {t('عدد الصفوف (Rows)', 'Rows Count')}
                </label>
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
            </div>
            <div className="text-[11px] text-slate-400 font-mono tabular-nums flex items-center justify-between pt-1">
              <span>{t('أبعاد الخلية الناتجة:', 'Calculated Cell Size:')}</span>
              <span dir="ltr" className="text-amber-300">
                {Math.round(computed.baseCellWidth)}×{Math.round(computed.baseCellHeight)} px
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Numbering System */}
      <div className="p-4 border-b border-slate-800/80 space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-slate-200 flex items-center gap-2">
          <Hash className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{t('نظام ترقيم المربعات', 'Square Numbering System')}</span>
        </h2>

        <div className="grid grid-cols-3 gap-1.5">
          {[
            {
              id: 'coordinates',
              labelAr: 'إحداثيات',
              sample: 'A1, B2',
            },
            {
              id: 'sequential',
              labelAr: 'تسلسلي',
              sample: '01, 02',
            },
            {
              id: 'col-row',
              labelAr: 'عمود-صف',
              sample: '1-1, 2-1',
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onUpdateProject((prev) => ({
                  ...prev,
                  numberingSystem: item.id as NumberingSystem,
                }))
              }
              className={`px-2 py-2 rounded-lg border text-center transition-colors cursor-pointer ${
                project.numberingSystem === item.id
                  ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                  : 'bg-[#090D16] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="text-[11px] font-semibold whitespace-nowrap">{item.labelAr}</div>
              <div dir="ltr" className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5">
                {item.sample}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Section 4: Global Coloring & Fill Style */}
      <div className="p-4 border-b border-slate-800/80 space-y-3.5">
        <h2 className="text-xs font-bold tracking-wide text-slate-200 flex items-center gap-2">
          <Palette className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{t('نظام التلوين والنمط البصري', 'Coloring & Fill Style')}</span>
        </h2>

        <div className="space-y-1.5">
          <label className="block text-[11px] text-slate-400">
            {t('توزيع الألوان الشامل', 'Global Grid Coloring Mode')}
          </label>
          <select
            value={project.coloringMode}
            onChange={(e) =>
              onUpdateProject((prev) => ({
                ...prev,
                coloringMode: e.target.value as ColoringMode,
              }))
            }
            className="w-full bg-[#090D16] border border-slate-700/90 focus:border-amber-500 rounded-lg px-2.5 py-2 text-xs text-slate-100 outline-none cursor-pointer"
          >
            <option value="distinct16">
              {t(
                'كل مربع بلون مختلف (16 لون بث متباين)',
                'Every Square Distinct Color (16 Broadcast)'
              )}
            </option>
            <option value="rainbow">
              {t('طيف لوني كامل (Full Spectrum Rainbow)', 'Full Spectrum Rainbow HSL')}
            </option>
            <option value="row">
              {t('تلوين حسب الصفوف (Color by Row A, B...)', 'Color by Row (A, B, C...)')}
            </option>
            <option value="col">
              {t('تلوين حسب الأعمدة (Color by Column)', 'Color by Column (1, 2, 3...)')}
            </option>
            <option value="checkerboard">
              {t('رقعة شطرنج داكنة (Dark Broadcast Slate)', 'Dark Broadcast Checkerboard')}
            </option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] text-slate-400">
            {t('نمط تعبئة المربع (Fill Style)', 'Square Fill Style')}
          </label>
          <div className="space-y-1.5">
            {[
              {
                id: 'plate',
                ar: 'مربع ملون كامل + لوحة رقم داكنة متباينة',
                en: 'Full Colored Square + Dark Number Plate',
              },
              {
                id: 'solid',
                ar: 'مربع ملون صلب 100% (تباين نص تلقائي)',
                en: 'Full Colored Square (Auto Contrast Text)',
              },
              {
                id: 'badge',
                ar: 'شارة داخلية دائرية (74%) داخل شبكة داكنة',
                en: 'Rounded Inner Badge (74%) inside Dark Grid',
              },
            ].map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    fillStyle: style.id as FillStyle,
                  }))
                }
                className={`w-full text-right px-3 py-2 rounded-lg border text-xs transition-colors flex items-center justify-between cursor-pointer ${
                  project.fillStyle === style.id
                    ? 'bg-amber-500/15 border-amber-500 text-amber-200 font-semibold'
                    : 'bg-[#090D16] border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span className="truncate">{t(style.ar, style.en)}</span>
                <Layers className="w-3.5 h-3.5 shrink-0 text-amber-400/80 mr-2" />
              </button>
            ))}
          </div>
        </div>

        {/* Font Scale & Border Width */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>{t('حجم الخط', 'Font Scale')}</span>
              <span dir="ltr" className="font-mono tabular-nums text-slate-200">
                {project.fontScale}%
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={150}
              step={5}
              value={project.fontScale}
              onChange={(e) =>
                onUpdateProject((prev) => ({ ...prev, fontScale: Number(e.target.value) }))
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>{t('سمك الخطوط', 'Grid Border')}</span>
              <span dir="ltr" className="font-mono tabular-nums text-slate-200">
                {project.gridLineWidth}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={project.gridLineWidth}
              onChange={(e) =>
                onUpdateProject((prev) => ({ ...prev, gridLineWidth: Number(e.target.value) }))
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Section 5: Calibration Overlays */}
      <div className="p-4 space-y-2.5">
        <h2 className="text-xs font-bold tracking-wide text-slate-200 flex items-center gap-2">
          <Crosshair className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{t('طبقات المعايرة الهندسية', 'Calibration Overlays')}</span>
        </h2>

        <div className="space-y-2">
          {[
            {
              key: 'centerCrosshair' as const,
              ar: 'علامة المنتصف والدائرة (Center Crosshair & Circle)',
              en: 'Center Crosshair + Circle',
            },
            {
              key: 'safeMargins' as const,
              ar: 'حدود الأمان للبث (Safe Action 90% / Title 80%)',
              en: 'Safe Action/Title Margins (90% / 80%)',
            },
            {
              key: 'diagonals' as const,
              ar: 'أقطار الشاشة (Corner-to-Corner Diagonals)',
              en: 'Corner-to-Corner Diagonals',
            },
            {
              key: 'hudBadge' as const,
              ar: 'لوحة معلومات الدقة السفلية (Bottom HUD Badge)',
              en: 'Bottom Resolution HUD Badge',
            },
            {
              key: 'pixelRulers' as const,
              ar: 'مسطرة البكسل العلوية (Top Pixel Ruler)',
              en: 'Top Pixel Coordinate Ruler',
            },
          ].map((item) => (
            <label
              key={item.key}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#090D16] border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-colors"
            >
              <span className="text-[11px] text-slate-300">{t(item.ar, item.en)}</span>
              <input
                type="checkbox"
                checked={project.overlays[item.key]}
                onChange={(e) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    overlays: {
                      ...prev.overlays,
                      [item.key]: e.target.checked,
                    },
                  }))
                }
                className="accent-amber-500 w-3.5 h-3.5 rounded cursor-pointer"
              />
            </label>
          ))}
        </div>
      </div>
    </aside>
  );
};
