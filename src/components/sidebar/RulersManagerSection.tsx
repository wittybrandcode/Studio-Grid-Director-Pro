import React, { useEffect, useState } from 'react';
import {
  ArrowsOutLineHorizontal,
  BoundingBox,
  CaretDown,
  CaretUp,
  Columns,
  DotsThreeOutline,
  Eye,
  EyeSlash,
  FrameCorners,
  Hash,
  LockSimple,
  LockSimpleOpen,
  Magnet,
  Palette,
  Ruler,
  SplitHorizontal,
  SplitVertical,
  Trash,
} from '@phosphor-icons/react';
import {
  AspectRatioMaskType,
  RULER_COLOR_PALETTE,
  RulerOrientation,
  StudioProject,
  StudioRuler,
  UILanguage,
} from '../../types/studio';
import { NumericInput } from '../NumericInput';
import { ColorPickerModal } from '../ColorPickerModal';

interface RulersManagerSectionProps {
  project: StudioProject;
  rulers: StudioRuler[];
  lang: UILanguage;
  expandSignal?: { open: boolean; seq: number };
  snapRulersEnabled: boolean;
  selectedCellsCount: number;
  onToggleSnapRulers: () => void;
  onToggleShowDistances: () => void;
  onAddRuler: (orientation: RulerOrientation) => void;
  onAddRulersAroundSelection: () => void;
  onUpdateRuler: (rulerId: string, updater: (r: StudioRuler) => StudioRuler) => void;
  onDeleteRuler: (rulerId: string) => void;
  onToggleLockAllRulers: () => void;
  onUpdateOverlays?: (patch: Partial<StudioProject['overlays']>) => void;
}

export const RulersManagerSection: React.FC<RulersManagerSectionProps> = React.memo(({
  project,
  rulers,
  lang,
  expandSignal,
  snapRulersEnabled,
  selectedCellsCount,
  onToggleSnapRulers,
  onToggleShowDistances,
  onAddRuler,
  onAddRulersAroundSelection,
  onUpdateRuler,
  onDeleteRuler,
  onToggleLockAllRulers,
  onUpdateOverlays,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [collapsedRulerIds, setCollapsedRulerIds] = useState<Record<string, boolean>>({});
  const [colorPickerRulerId, setColorPickerRulerId] = useState<string | null>(null);
  const t = (ar: string, en: string) => (lang === 'en' ? en : ar);

  useEffect(() => {
    if (expandSignal && expandSignal.seq > 0) {
      setIsOpen(expandSignal.open);
    }
  }, [expandSignal]);

  const allLocked = rulers.length > 0 && rulers.every((r) => r.locked);
  const showDistances = project.overlays?.showRulerDistances !== false;
  const showRulersMaster = project.overlays?.showRulers !== false;

  const toggleRulerCollapse = (id: string) => {
    setCollapsedRulerIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="bg-[#2A2D34] border border-[#434853] rounded-none">
      {/* Main Collapsible Header with Icon-Only Action Strip */}
      <div
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center justify-between px-2.5 py-1.5 bg-[#32363F] border-b border-[#434853] cursor-pointer select-none"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Ruler weight="bold" className="w-4 h-4 text-[#38BDF8] shrink-0" />
          <span className="text-xs font-bold text-[#DCE0E8] truncate">
            {t('المساطر', 'Rulers')}
          </span>
          <span className="px-1 py-0.2 bg-[#1B1E24] border border-[#3A3F4B] text-[10px] font-mono font-bold text-[#9FA6B3]">
            {rulers.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Add Horizontal (Y) Ruler Icon Button */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              onAddRuler('horizontal');
            }}
            title={t('إضافة مسطرة أفقية (+Y)', 'Add Horizontal Ruler (+Y)')}
            className="h-6 px-1.5 flex items-center gap-0.5 rounded-none bg-[#1B2C3B] hover:bg-[#38BDF8] text-[#7DD3FC] hover:text-[#09131C] border border-[#2C4C66] text-[10px] font-mono font-bold cursor-pointer transition-colors"
          >
            <SplitVertical weight="bold" className="w-3.5 h-3.5" />
            <span>+Y</span>
          </button>

          {/* Add Vertical (X) Ruler Icon Button */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              onAddRuler('vertical');
            }}
            title={t('إضافة مسطرة عمودية (+X)', 'Add Vertical Ruler (+X)')}
            className="h-6 px-1.5 flex items-center gap-0.5 rounded-none bg-[#1B2C3B] hover:bg-[#38BDF8] text-[#7DD3FC] hover:text-[#09131C] border border-[#2C4C66] text-[10px] font-mono font-bold cursor-pointer transition-colors"
          >
            <SplitHorizontal weight="bold" className="w-3.5 h-3.5" />
            <span>+X</span>
          </button>

          {/* Frame Selection with 4 Rulers (Icon Only) */}
          {selectedCellsCount > 0 && (
            <button
              type="button"
              onClick={onAddRulersAroundSelection}
              title={t('إحاطة التحديد الحالي بـ 4 مساطر تلقائياً', 'Frame Selection with 4 Rulers')}
              className="w-6 h-6 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#F59E0B] text-[#FCD34D] hover:text-[#140E05] border border-[#664B24] cursor-pointer transition-colors"
            >
              <BoundingBox weight="bold" className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Distance Badges Toggle (Icon Only) */}
          <button
            type="button"
            onClick={onToggleShowDistances}
            title={t(
              'إظهار/إخفاء المسافة بالبكسل والنسبة المئوية بين المساطر (Δpx)',
              'Toggle distance measurements (Δpx & %) between rulers'
            )}
            className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
              showDistances
                ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
            }`}
          >
            <ArrowsOutLineHorizontal weight="bold" className="w-3.5 h-3.5" />
          </button>

          {/* Magnetic Snap Toggle (Icon Only) */}
          <button
            type="button"
            onClick={onToggleSnapRulers}
            title={t(
              'الالتصاق المغناطيسي للمساطر بخطوط الشبكة والمركز (Snap)',
              'Toggle magnetic snapping to grid lines and center'
            )}
            className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
              snapRulersEnabled
                ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
            }`}
          >
            <Magnet weight={snapRulersEnabled ? 'fill' : 'bold'} className="w-3.5 h-3.5" />
          </button>

          {/* Master Show/Hide All Rulers */}
          {onUpdateOverlays && (
            <button
              type="button"
              onClick={() => onUpdateOverlays({ showRulers: !showRulersMaster })}
              title={t(
                showRulersMaster ? 'إخفاء جميع المساطر مؤقتاً' : 'إظهار جميع المساطر',
                showRulersMaster ? 'Hide all rulers' : 'Show all rulers'
              )}
              className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                showRulersMaster
                  ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                  : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
              }`}
            >
              {showRulersMaster ? (
                <Eye weight="bold" className="w-3.5 h-3.5" />
              ) : (
                <EyeSlash weight="bold" className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Lock/Unlock All Rulers */}
          {rulers.length > 0 && (
            <button
              type="button"
              onClick={onToggleLockAllRulers}
              title={t('قفل/فك قفل كل المساطر', 'Lock/Unlock all rulers')}
              className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                allLocked
                  ? 'bg-[#F59E0B] text-[#140E05] border-[#FEF3C7]'
                  : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
              }`}
            >
              {allLocked ? (
                <LockSimple weight="fill" className="w-3.5 h-3.5" />
              ) : (
                <LockSimpleOpen weight="bold" className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
            title={isOpen ? t('طي الصندوق', 'Collapse') : t('فتح الصندوق', 'Expand')}
          >
            {isOpen ? (
              <CaretUp weight="bold" className="w-3.5 h-3.5" />
            ) : (
              <CaretDown weight="bold" className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-2 space-y-2">
          {/* Individual Collapsible Ruler Cards */}
          {rulers.length > 0 ? (
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
              {rulers.map((r) => {
                const isHorizontal = r.orientation === 'horizontal';
                const maxPos = isHorizontal ? project.compHeight : project.compWidth;
                const isRulerCollapsed = Boolean(collapsedRulerIds[r.id]);

                return (
                  <div
                    key={r.id}
                    className={`bg-[#202328] border rounded-none transition-colors ${
                      r.visible ? 'border-[#434853]' : 'border-[#333740] opacity-70'
                    }`}
                  >
                    {/* Individual Ruler Compact Header */}
                    <div className="flex items-center gap-1 p-1.5 bg-[#272B33] border-b border-[#3F444E]">
                      <button
                        type="button"
                        onClick={() => toggleRulerCollapse(r.id)}
                        className="w-5 h-5 flex items-center justify-center bg-[#202328] hover:bg-[#383E4A] text-[#AEB5C2] border border-[#3A3E47] rounded-none shrink-0 cursor-pointer"
                        title={
                          isRulerCollapsed
                            ? t('فتح إعدادات المسطرة', 'Expand ruler settings')
                            : t('طي إعدادات المسطرة', 'Collapse ruler settings')
                        }
                      >
                        {isRulerCollapsed ? (
                          <CaretDown weight="bold" className="w-3 h-3" />
                        ) : (
                          <CaretUp weight="bold" className="w-3 h-3" />
                        )}
                      </button>

                      <span
                        style={{ backgroundColor: r.color }}
                        className="w-5 h-5 flex items-center justify-center rounded-none text-[10px] font-mono font-black text-[#090D16] shrink-0"
                      >
                        {isHorizontal ? 'Y' : 'X'}
                      </span>

                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) =>
                          onUpdateRuler(r.id, (prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder={t('اسم...', 'Name...')}
                        className="flex-1 min-w-0 h-6 bg-[#1B1E23] border border-[#434853] focus:border-[#38BDF8] rounded-none px-1.5 text-[11px] font-bold text-[#DCE0E8] outline-none"
                      />

                      <span
                        dir="ltr"
                        className="text-[10px] font-mono text-[#FEF08A] shrink-0 px-1"
                      >
                        {r.positionPx}px
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateRuler(r.id, (prev) => ({
                            ...prev,
                            locked: !prev.locked,
                          }))
                        }
                        title={r.locked ? t('فك القفل', 'Unlock') : t('قفل الموقع', 'Lock')}
                        className={`w-6 h-6 flex items-center justify-center rounded-none border shrink-0 cursor-pointer transition-colors ${
                          r.locked
                            ? 'bg-[#F59E0B] text-[#140E05] border-[#FEF3C7]'
                            : 'bg-[#202328] hover:bg-[#383E4A] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        {r.locked ? (
                          <LockSimple weight="fill" className="w-3 h-3" />
                        ) : (
                          <LockSimpleOpen weight="bold" className="w-3 h-3" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateRuler(r.id, (prev) => ({
                            ...prev,
                            visible: !prev.visible,
                          }))
                        }
                        title={r.visible ? t('إخفاء', 'Hide') : t('إظهار', 'Show')}
                        className={`w-6 h-6 flex items-center justify-center rounded-none border shrink-0 cursor-pointer transition-colors ${
                          r.visible
                            ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                            : 'bg-[#202328] hover:bg-[#383E4A] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        {r.visible ? (
                          <Eye weight="bold" className="w-3 h-3" />
                        ) : (
                          <EyeSlash weight="bold" className="w-3 h-3" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteRuler(r.id)}
                        title={t('حذف المسطرة', 'Delete Ruler')}
                        className="w-6 h-6 flex items-center justify-center rounded-none bg-[#202328] hover:bg-[#EF4444] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] shrink-0 cursor-pointer transition-colors"
                      >
                        <Trash weight="bold" className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Collapsible Body */}
                    {!isRulerCollapsed && (
                      <div className="p-2 space-y-1.5">
                        {/* Position Slider + Numeric Input */}
                        <div className="flex items-center gap-1.5" dir="ltr">
                          <input
                            type="range"
                            min={0}
                            max={maxPos}
                            disabled={Boolean(r.locked)}
                            value={r.positionPx}
                            onChange={(e) =>
                              onUpdateRuler(r.id, (prev) => ({
                                ...prev,
                                positionPx: Number(e.target.value),
                              }))
                            }
                            className="flex-1 min-w-0 cursor-pointer disabled:opacity-40 accent-[#38BDF8]"
                          />
                          <NumericInput
                            value={r.positionPx}
                            min={0}
                            max={maxPos}
                            step={10}
                            onChange={(val) => {
                              if (r.locked) return;
                              onUpdateRuler(r.id, (prev) => ({
                                ...prev,
                                positionPx: val,
                              }));
                            }}
                            className="w-20 shrink-0"
                          />
                        </div>

                        {/* Quick Fractional Position Presets (25%, 33.3%, 50%, 66.7%, 75%) */}
                        <div className="grid grid-cols-5 gap-1" dir="ltr">
                          {[
                            { label: '25%', ratio: 0.25 },
                            { label: '33%', ratio: 1 / 3 },
                            { label: '50%', ratio: 0.5 },
                            { label: '67%', ratio: 2 / 3 },
                            { label: '75%', ratio: 0.75 },
                          ].map((preset) => {
                            const targetPx = Math.round(maxPos * preset.ratio);
                            const isAtPreset = Math.abs(r.positionPx - targetPx) <= 1;
                            return (
                              <button
                                key={preset.label}
                                type="button"
                                disabled={Boolean(r.locked)}
                                onClick={() =>
                                  onUpdateRuler(r.id, (prev) => ({
                                    ...prev,
                                    positionPx: targetPx,
                                  }))
                                }
                                className={`py-0.5 rounded-none border text-[9px] font-mono font-bold cursor-pointer disabled:opacity-40 transition-colors ${
                                  isAtPreset
                                    ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                                    : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                                }`}
                                title={`${preset.label} (${targetPx}px)`}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Single-Row Swatches + Icon Toggles (Ticks, Dashed) + Width/Opacity Selects */}
                        <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#363B44]" dir="ltr">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setColorPickerRulerId(r.id)}
                              className="w-5 h-5 studio-btn-elevated border rounded-none flex items-center justify-center cursor-pointer shrink-0"
                              title={t('لون مخصص للمسطرة', 'Pick custom ruler color')}
                            >
                              <Palette weight="bold" className="w-3 h-3" />
                            </button>
                            {RULER_COLOR_PALETTE.map((c) => {
                              const isSelected =
                                r.color.toUpperCase() === c.toUpperCase();
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() =>
                                    onUpdateRuler(r.id, (prev) => ({
                                      ...prev,
                                      color: c,
                                    }))
                                  }
                                  style={{ backgroundColor: c }}
                                  className={`w-4 h-4 rounded-none border cursor-pointer ${
                                    isSelected
                                      ? 'border-[#DCE0E8] ring-1 ring-[#DCE0E8] scale-110'
                                      : 'border-[#434853]'
                                  }`}
                                />
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateRuler(r.id, (prev) => ({
                                  ...prev,
                                  showTicks: prev.showTicks === false,
                                }))
                              }
                              className={`w-5 h-5 flex items-center justify-center rounded-none border cursor-pointer ${
                                r.showTicks !== false
                                  ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                                  : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                              }`}
                              title={t('إظهار/إخفاء تدريجات المسطرة (Ticks)', 'Toggle ruler graduation ticks')}
                            >
                              <Hash weight="bold" className="w-3 h-3" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                onUpdateRuler(r.id, (prev) => ({
                                  ...prev,
                                  dashed: !prev.dashed,
                                }))
                              }
                              className={`w-5 h-5 flex items-center justify-center rounded-none border cursor-pointer ${
                                r.dashed
                                  ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                                  : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                              }`}
                              title={t('خط متقطع / متصل (Dashed)', 'Toggle dashed line')}
                            >
                              <DotsThreeOutline weight="bold" className="w-3 h-3" />
                            </button>

                            <select
                              value={r.strokeWidth}
                              onChange={(e) =>
                                onUpdateRuler(r.id, (prev) => ({
                                  ...prev,
                                  strokeWidth: Number(e.target.value),
                                }))
                              }
                              title={t('سمك خط المسطرة (px)', 'Stroke Width (px)')}
                              className="h-5 bg-[#272B33] border border-[#434853] rounded-none px-1 text-[9px] font-mono text-[#DCE0E8] outline-none"
                            >
                              {[1, 2, 3, 4, 6, 8, 10, 12].map((w) => (
                                <option key={w} value={w}>
                                  {w}px
                                </option>
                              ))}
                            </select>

                            <select
                              value={r.opacity}
                              onChange={(e) =>
                                onUpdateRuler(r.id, (prev) => ({
                                  ...prev,
                                  opacity: Number(e.target.value),
                                }))
                              }
                              title={t('شفافية المسطرة (%)', 'Opacity (%)')}
                              className="h-5 bg-[#272B33] border border-[#434853] rounded-none px-1 text-[9px] font-mono text-[#DCE0E8] outline-none"
                            >
                              {[25, 50, 75, 90, 100].map((op) => (
                                <option key={op} value={op}>
                                  {op}%
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[10px] text-[#98A0AE] text-center py-1.5 bg-[#202328] border border-dashed border-[#434853] rounded-none">
              {t('اضغط +Y أو +X في الأعلى لإضافة مسطرة', 'Click +Y or +X above to add a ruler')}
            </div>
          )}

          {/* Compact Aspect Ratio Masks Bar */}
          {onUpdateOverlays && (
            <div className="bg-[#202328] border border-[#434853] rounded-none p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#DCE0E8]">
                  <FrameCorners weight="bold" className="w-3.5 h-3.5 text-[#FACC15]" />
                  <span>{t('قناع النسبة (Aspect)', 'Aspect Mask')}</span>
                </div>
                <span dir="ltr" className="text-[10px] font-mono text-[#FACC15]">
                  {project.overlays?.aspectMask && project.overlays.aspectMask !== 'none'
                    ? project.overlays.aspectMask
                    : 'OFF'}
                </span>
              </div>

              <div className="grid grid-cols-6 gap-1" dir="ltr">
                {(
                  [
                    { id: 'none', label: 'OFF' },
                    { id: '2.39:1', label: '2.39' },
                    { id: '1.85:1', label: '1.85' },
                    { id: '16:9', label: '16:9' },
                    { id: '9:16', label: '9:16' },
                    { id: '4:3', label: '4:3' },
                  ] as { id: AspectRatioMaskType; label: string }[]
                ).map((mask) => {
                  const active = (project.overlays?.aspectMask || 'none') === mask.id;
                  return (
                    <button
                      key={mask.id}
                      type="button"
                      onClick={() => onUpdateOverlays({ aspectMask: mask.id })}
                      className={`py-1 px-1 rounded-none border text-[9px] font-mono font-bold cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#F59E0B] text-[#140E05] border-[#FEF3C7]'
                          : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                      }`}
                    >
                      {mask.label}
                    </button>
                  );
                })}
              </div>

              {project.overlays?.aspectMask && project.overlays.aspectMask !== 'none' && (
                <div className="flex items-center gap-1.5 pt-0.5" dir="ltr">
                  <span className="text-[9px] font-mono text-[#9FA6B3] shrink-0">Op%</span>
                  <input
                    type="range"
                    min={20}
                    max={95}
                    step={5}
                    value={project.overlays?.aspectMaskOpacity ?? 70}
                    onChange={(e) =>
                      onUpdateOverlays({ aspectMaskOpacity: Number(e.target.value) })
                    }
                    className="flex-1 cursor-pointer accent-[#F59E0B]"
                  />
                  <span className="text-[10px] font-mono text-[#DCE0E8] w-8 text-right">
                    {project.overlays?.aspectMaskOpacity ?? 70}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Compact Edge Blending / Overlap Guides (R / L / T / B Code Badges) */}
          {onUpdateOverlays && (
            <div className="bg-[#202328] border border-[#434853] rounded-none p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#DCE0E8]">
                  <Columns weight="bold" className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <span>{t('دمج الحواف (Edge Blend)', 'Edge Overlap')}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateOverlays({
                      edgeBlendEnabled: !project.overlays?.edgeBlendEnabled,
                      edgeBlendRightPx:
                        !project.overlays?.edgeBlendEnabled &&
                        !project.overlays?.edgeBlendTopPx &&
                        !project.overlays?.edgeBlendRightPx &&
                        !project.overlays?.edgeBlendBottomPx &&
                        !project.overlays?.edgeBlendLeftPx
                          ? 120
                          : project.overlays?.edgeBlendRightPx ?? 0,
                    })
                  }
                  className={`px-2 py-0.5 rounded-none border text-[10px] font-mono font-bold cursor-pointer ${
                    project.overlays?.edgeBlendEnabled
                      ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                      : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                  }`}
                >
                  {project.overlays?.edgeBlendEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {project.overlays?.edgeBlendEnabled && (
                <div className="space-y-1.5 pt-0.5" dir="ltr">
                  <div className="grid grid-cols-2 gap-1">
                    <div className="flex items-center gap-1">
                      <span
                        title={t('تداخل الحافة اليسرى (Left px)', 'Left Overlap (px)')}
                        className="w-5 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[10px] font-mono font-bold text-[#38BDF8] shrink-0"
                      >
                        L
                      </span>
                      <NumericInput
                        value={project.overlays?.edgeBlendLeftPx ?? 0}
                        min={0}
                        max={Math.floor(project.compWidth / 2)}
                        step={10}
                        onChange={(val) => onUpdateOverlays({ edgeBlendLeftPx: val })}
                        className="flex-1 min-w-0"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        title={t('تداخل الحافة اليمنى (Right px)', 'Right Overlap (px)')}
                        className="w-5 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[10px] font-mono font-bold text-[#38BDF8] shrink-0"
                      >
                        R
                      </span>
                      <NumericInput
                        value={project.overlays?.edgeBlendRightPx ?? 0}
                        min={0}
                        max={Math.floor(project.compWidth / 2)}
                        step={10}
                        onChange={(val) => onUpdateOverlays({ edgeBlendRightPx: val })}
                        className="flex-1 min-w-0"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        title={t('تداخل الحافة العلوية (Top px)', 'Top Overlap (px)')}
                        className="w-5 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[10px] font-mono font-bold text-[#38BDF8] shrink-0"
                      >
                        T
                      </span>
                      <NumericInput
                        value={project.overlays?.edgeBlendTopPx ?? 0}
                        min={0}
                        max={Math.floor(project.compHeight / 2)}
                        step={10}
                        onChange={(val) => onUpdateOverlays({ edgeBlendTopPx: val })}
                        className="flex-1 min-w-0"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        title={t('تداخل الحافة السفلية (Bottom px)', 'Bottom Overlap (px)')}
                        className="w-5 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[10px] font-mono font-bold text-[#38BDF8] shrink-0"
                      >
                        B
                      </span>
                      <NumericInput
                        value={project.overlays?.edgeBlendBottomPx ?? 0}
                        min={0}
                        max={Math.floor(project.compHeight / 2)}
                        step={10}
                        onChange={(val) => onUpdateOverlays({ edgeBlendBottomPx: val })}
                        className="flex-1 min-w-0"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    {[60, 120, 240].map((px) => (
                      <button
                        key={px}
                        type="button"
                        onClick={() =>
                          onUpdateOverlays({
                            edgeBlendLeftPx: px,
                            edgeBlendRightPx: px,
                          })
                        }
                        className="py-0.5 bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] text-[9px] font-mono font-bold cursor-pointer"
                      >
                        L+R {px}px
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Professional Studio Color Picker Modal for Ruler */}
      <ColorPickerModal
        isOpen={Boolean(colorPickerRulerId)}
        initialColor={
          rulers.find((r) => r.id === colorPickerRulerId)?.color || '#38BDF8'
        }
        title={t('اختيار لون المسطرة الهندسية', 'Ruler Custom Color Picker')}
        lang={lang}
        onApply={(newHex) => {
          if (colorPickerRulerId) {
            onUpdateRuler(colorPickerRulerId, (prev) => ({
              ...prev,
              color: newHex,
            }));
          }
        }}
        onClose={() => setColorPickerRulerId(null)}
      />
    </div>
  );
});
