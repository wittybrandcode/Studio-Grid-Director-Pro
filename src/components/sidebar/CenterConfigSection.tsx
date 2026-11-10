import React, { useEffect, useState } from 'react';
import {
  ArrowCounterClockwise,
  CaretDown,
  CaretUp,
  Circle,
  Crosshair,
  Drop,
  Palette,
  Plus,
  Ruler,
} from '@phosphor-icons/react';
import {
  CenterOverlayConfig,
  RULER_COLOR_PALETTE,
  UILanguage,
} from '../../types/studio';
import { NumericInput } from '../NumericInput';
import { ColorPickerModal } from '../ColorPickerModal';

interface CenterConfigSectionProps {
  centerConfig: CenterOverlayConfig;
  compWidth: number;
  compHeight: number;
  lang: UILanguage;
  expandSignal?: { open: boolean; seq: number };
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onUpdateCenterConfig: (
    updater: (prev: CenterOverlayConfig) => CenterOverlayConfig
  ) => void;
}

export const CenterConfigSection: React.FC<CenterConfigSectionProps> = React.memo(({
  centerConfig,
  compWidth,
  compHeight,
  lang,
  expandSignal,
  canvasRef,
  onUpdateCenterConfig,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [pickerTarget, setPickerTarget] = useState<'stroke' | 'fill' | null>(null);
  const t = (ar: string, en: string) => (lang === 'en' ? en : ar);

  useEffect(() => {
    if (expandSignal && expandSignal.seq > 0) {
      setIsOpen(expandSignal.open);
    }
  }, [expandSignal]);

  const offsetX = centerConfig.offsetX || 0;
  const offsetY = centerConfig.offsetY || 0;
  const maxOffsetX = Math.round(compWidth / 2);
  const maxOffsetY = Math.round(compHeight / 2);

  return (
    <div className="bg-[#2A2D34] border border-[#434853] rounded-none">
      {/* Compact Header with Inline Icon Toggles (Lines, Circle, Ticks, Reset Offset) */}
      <div
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center justify-between px-2.5 py-1.5 bg-[#32363F] border-b border-[#434853] cursor-pointer select-none"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Crosshair weight="bold" className="w-4 h-4 text-[#38BDF8] shrink-0" />
          <span className="text-xs font-bold text-[#DCE0E8] truncate">
            {t('المركز والدائرة', 'Center & Circle')}
          </span>
        </div>

        {/* Icon-Only Quick Toggles in Header */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() =>
              onUpdateCenterConfig((prev) => ({
                ...prev,
                showLines: !prev.showLines,
              }))
            }
            title={t(
              centerConfig.showLines
                ? 'إخفاء الخطين المتقاطعين للمركز (+)'
                : 'إظهار الخطين المتقاطعين للمركز (+)',
              'Toggle Center Crosshair Lines (+)'
            )}
            className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
              centerConfig.showLines
                ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
            }`}
          >
            <Plus weight="bold" className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateCenterConfig((prev) => ({
                ...prev,
                showCircle: !prev.showCircle,
              }))
            }
            title={t(
              centerConfig.showCircle
                ? 'إخفاء الدائرة الوسطى (◯)'
                : 'إظهار الدائرة الوسطى (◯)',
              'Toggle Center Circle (◯)'
            )}
            className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
              centerConfig.showCircle
                ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
            }`}
          >
            <Circle weight={centerConfig.showCircle ? 'fill' : 'bold'} className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateCenterConfig((prev) => ({
                ...prev,
                showCrosshairTicks: !prev.showCrosshairTicks,
              }))
            }
            title={t('إظهار/إخفاء تدريجات القياس على خطي المركز', 'Toggle Crosshair Graduation Ticks')}
            className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
              centerConfig.showCrosshairTicks
                ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
            }`}
          >
            <Ruler weight="bold" className="w-3.5 h-3.5" />
          </button>

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
          {/* Row 1: Circle Shape (◯ 1:1 vs ⬭ Aspect) + Diameter % Scrubber */}
          <div className="p-1.5 bg-[#202328] border border-[#434853] rounded-none flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 shrink-0" dir="ltr">
              <button
                type="button"
                onClick={() =>
                  onUpdateCenterConfig((prev) => ({
                    ...prev,
                    circleAspectMode: 'circle',
                  }))
                }
                title={t('دائرة هندسية متساوية الأبعاد (1:1 Circle)', '1:1 Geometric Circle')}
                className={`h-6 px-1.5 rounded-none border text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                  (centerConfig.circleAspectMode || 'circle') === 'circle'
                    ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                    : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                }`}
              >
                ◯ 1:1
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateCenterConfig((prev) => ({
                    ...prev,
                    circleAspectMode: 'ellipse',
                  }))
                }
                title={t('شكل بيضاوي متناسب مع أبعاد الشاشة (Aspect Ellipse)', 'Screen Aspect Ellipse')}
                className={`h-6 px-1.5 rounded-none border text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                  centerConfig.circleAspectMode === 'ellipse'
                    ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                    : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                }`}
              >
                ⬭ W:H
              </button>
            </div>

            <span
              dir="ltr"
              title={t('حجم قطر الدائرة بالنسبة للشاشة (%)', 'Circle Diameter (%)')}
              className="text-[10px] font-mono font-bold text-[#9FA6B3] shrink-0"
            >
              Ø%
            </span>
            <input
              type="range"
              min={5}
              max={120}
              value={centerConfig.circleSizePct}
              onChange={(e) =>
                onUpdateCenterConfig((prev) => ({
                  ...prev,
                  circleSizePct: Number(e.target.value),
                }))
              }
              className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
            />
            <NumericInput
              value={centerConfig.circleSizePct}
              min={5}
              max={150}
              step={2}
              onChange={(val) =>
                onUpdateCenterConfig((prev) => ({
                  ...prev,
                  circleSizePct: val,
                }))
              }
              className="w-20 shrink-0"
            />
          </div>

          {/* Row 2: Compact Offset X / Y with Inline Prefix Badges + Icon Reset */}
          <div className="p-1.5 bg-[#202328] border border-[#434853] rounded-none flex items-center gap-1.5" dir="ltr">
            <div className="flex-1 flex items-center gap-1 min-w-0">
              <span
                title={t('إزاحة المركز أفقياً (Offset X px)', 'Center Offset X (px)')}
                className="w-5 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[10px] font-mono font-bold text-[#38BDF8] shrink-0"
              >
                X
              </span>
              <NumericInput
                value={offsetX}
                min={-maxOffsetX}
                max={maxOffsetX}
                step={10}
                onChange={(val) =>
                  onUpdateCenterConfig((prev) => ({
                    ...prev,
                    offsetX: val,
                  }))
                }
                className="flex-1 min-w-0"
              />
            </div>

            <div className="flex-1 flex items-center gap-1 min-w-0">
              <span
                title={t('إزاحة المركز عمودياً (Offset Y px)', 'Center Offset Y (px)')}
                className="w-5 h-7 flex items-center justify-center bg-[#181A1F] border border-[#3A3E47] text-[10px] font-mono font-bold text-[#38BDF8] shrink-0"
              >
                Y
              </span>
              <NumericInput
                value={offsetY}
                min={-maxOffsetY}
                max={maxOffsetY}
                step={10}
                onChange={(val) =>
                  onUpdateCenterConfig((prev) => ({
                    ...prev,
                    offsetY: val,
                  }))
                }
                className="flex-1 min-w-0"
              />
            </div>

            {(offsetX !== 0 || offsetY !== 0) && (
              <button
                type="button"
                onClick={() =>
                  onUpdateCenterConfig((prev) => ({
                    ...prev,
                    offsetX: 0,
                    offsetY: 0,
                  }))
                }
                title={t('إعادة تصفير إزاحة المركز (0,0)', 'Reset Center Offset (0,0)')}
                className="w-7 h-7 flex items-center justify-center bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none cursor-pointer shrink-0 transition-colors"
              >
                <ArrowCounterClockwise weight="bold" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Row 3: Stroke Swatches + Compact Width (px) & Opacity (%) */}
          <div className="p-2 bg-[#202328] border border-[#434853] rounded-none space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPickerTarget('stroke')}
                  className="w-6 h-6 bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                  title={t('لون مخصص للخطين وإطار الدائرة (Stroke Color)', 'Custom Stroke Color')}
                >
                  <Palette weight="bold" className="w-3.5 h-3.5" />
                </button>
                {RULER_COLOR_PALETTE.map((c) => {
                  const isSelected =
                    centerConfig.strokeColor.toUpperCase() === c.toUpperCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        onUpdateCenterConfig((prev) => ({
                          ...prev,
                          strokeColor: c,
                        }))
                      }
                      style={{ backgroundColor: c }}
                      className={`w-5 h-5 rounded-none border cursor-pointer transition-transform ${
                        isSelected
                          ? 'border-[#DCE0E8] ring-1 ring-[#DCE0E8] scale-110'
                          : 'border-[#434853]'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Toggle Circle Fill Icon Button */}
              <button
                type="button"
                onClick={() =>
                  onUpdateCenterConfig((prev) => ({
                    ...prev,
                    fillEnabled: !prev.fillEnabled,
                  }))
                }
                title={t(
                  centerConfig.fillEnabled ? 'إيقاف تعبئة الدائرة' : 'تفعيل تعبئة الدائرة (Fill)',
                  'Toggle Circle Fill'
                )}
                className={`h-6 px-1.5 rounded-none border text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors ${
                  centerConfig.fillEnabled
                    ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                    : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                }`}
              >
                <Drop weight={centerConfig.fillEnabled ? 'fill' : 'bold'} className="w-3 h-3" />
                <span>Fill</span>
              </button>
            </div>

            {/* Compact Stroke Width (px) & Opacity (%) Single Row */}
            <div className="grid grid-cols-2 gap-2 pt-0.5" dir="ltr">
              <div className="flex items-center gap-1.5">
                <span
                  title={t('سمك الخط (Stroke px)', 'Stroke Width (px)')}
                  className="text-[10px] font-mono font-bold text-[#9FA6B3] w-8 shrink-0"
                >
                  {centerConfig.strokeWidth}px
                </span>
                <input
                  type="range"
                  min={1}
                  max={25}
                  value={centerConfig.strokeWidth}
                  onChange={(e) =>
                    onUpdateCenterConfig((prev) => ({
                      ...prev,
                      strokeWidth: Number(e.target.value),
                    }))
                  }
                  className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span
                  title={t('شفافية الخط (Opacity %)', 'Stroke Opacity (%)')}
                  className="text-[10px] font-mono font-bold text-[#9FA6B3] w-9 shrink-0"
                >
                  {centerConfig.strokeOpacity}%
                </span>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={centerConfig.strokeOpacity}
                  onChange={(e) =>
                    onUpdateCenterConfig((prev) => ({
                      ...prev,
                      strokeOpacity: Number(e.target.value),
                    }))
                  }
                  className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                />
              </div>
            </div>

            {/* Fill Swatches & Opacity (Only when Fill is ON) */}
            {centerConfig.fillEnabled && (
              <div className="pt-1.5 border-t border-[#343944] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setPickerTarget('fill')}
                    className="w-5 h-5 bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] rounded-none flex items-center justify-center cursor-pointer shrink-0"
                    title={t('لون مخصص لتعبئة الدائرة (Fill Color)', 'Custom Fill Color')}
                  >
                    <Palette weight="bold" className="w-3 h-3" />
                  </button>
                  {RULER_COLOR_PALETTE.map((c) => {
                    const isSelected =
                      centerConfig.fillColor.toUpperCase() === c.toUpperCase();
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          onUpdateCenterConfig((prev) => ({
                            ...prev,
                            fillColor: c,
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

                <div className="flex items-center gap-1 w-28 shrink-0" dir="ltr">
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={centerConfig.fillOpacity}
                    onChange={(e) =>
                      onUpdateCenterConfig((prev) => ({
                        ...prev,
                        fillOpacity: Number(e.target.value),
                      }))
                    }
                    className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                  />
                  <span className="text-[10px] font-mono text-[#DCE0E8] w-8 text-right">
                    {centerConfig.fillOpacity}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Professional Studio Color Picker Modal */}
      <ColorPickerModal
        isOpen={Boolean(pickerTarget)}
        initialColor={
          pickerTarget === 'fill' ? centerConfig.fillColor : centerConfig.strokeColor
        }
        title={
          pickerTarget === 'fill'
            ? t('اختيار لون تعبئة الدائرة الوسطى', 'Center Circle Fill Color')
            : t('اختيار لون الخطين وإطار الدائرة الوسطى', 'Center Crosshair & Circle Stroke Color')
        }
        lang={lang}
        canvasRef={canvasRef}
        onApply={(newHex) => {
          if (pickerTarget === 'fill') {
            onUpdateCenterConfig((prev) => ({ ...prev, fillColor: newHex }));
          } else {
            onUpdateCenterConfig((prev) => ({ ...prev, strokeColor: newHex }));
          }
        }}
        onClose={() => setPickerTarget(null)}
      />
    </div>
  );
});
