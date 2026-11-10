import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowsHorizontal,
  ArrowsLeftRight,
  ArrowsVertical,
  CaretDown,
  CaretUp,
  ChartBar,
  CircleHalf,
  Drop,
  Eyedropper,
  GridFour,
  Image as ImageIcon,
  Palette,
  SlidersHorizontal,
  Sun,
  Swatches,
  Thermometer,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react';
import {
  CALIBRATION_SWATCH_PRESETS,
  ColorCalibrationConfig,
  ColorSwatchMode,
  DEFAULT_COLOR_CALIBRATION,
  ImageFitMode,
  RGBChannelFilter,
  TestImagePresetType,
  UILanguage,
} from '../../types/studio';
import { CanvasColorAnalysisResult } from '../../utils/gridEngine';
import { ColorPickerModal } from '../ColorPickerModal';

interface HoveredPixelSample {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  hex: string;
  ire: number;
}

interface ColorCalibrationSectionProps {
  colorConfig: ColorCalibrationConfig;
  colorMetrics: CanvasColorAnalysisResult;
  hoveredPixel: HoveredPixelSample | null;
  lang: UILanguage;
  expandSignal?: { open: boolean; seq: number };
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onUpdateColorConfig: (
    patchOrUpdater:
      | Partial<ColorCalibrationConfig>
      | ((prev: ColorCalibrationConfig) => ColorCalibrationConfig)
  ) => void;
  onOpenReportModal: () => void;
}

export const ColorCalibrationSection: React.FC<ColorCalibrationSectionProps> = React.memo(({
  colorConfig,
  colorMetrics,
  hoveredPixel,
  lang,
  expandSignal,
  canvasRef,
  onUpdateColorConfig,
  onOpenReportModal,
}) => {
  const t = (ar: string, en: string) => (lang === 'en' ? en : ar);
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [isImageBoxOpen, setIsImageBoxOpen] = useState<boolean>(true);
  const [isSwatchBoxOpen, setIsSwatchBoxOpen] = useState<boolean>(true);
  const [isGradingBoxOpen, setIsGradingBoxOpen] = useState<boolean>(true);
  const [isTelemetryBoxOpen, setIsTelemetryBoxOpen] = useState<boolean>(true);
  const [isSolidColorPickerOpen, setIsSolidColorPickerOpen] = useState<boolean>(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (expandSignal && expandSignal.seq > 0) {
      setIsOpen(expandSignal.open);
    }
  }, [expandSignal]);

  const isModified =
    colorConfig.brightness !== 100 ||
    colorConfig.contrast !== 100 ||
    colorConfig.saturation !== 100 ||
    colorConfig.hueRotate !== 0 ||
    colorConfig.temperature !== 0 ||
    colorConfig.gamma !== 1.0 ||
    colorConfig.rgbChannel !== 'all';

  const handleUploadCustomImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const maxDim = 1920;
        let targetW = img.naturalWidth || 1280;
        let targetH = img.naturalHeight || 720;
        if (targetW > maxDim || targetH > maxDim) {
          const ratio = Math.min(maxDim / targetW, maxDim / targetH);
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
        }
        const offscreen = document.createElement('canvas');
        offscreen.width = targetW;
        offscreen.height = targetH;
        const octx = offscreen.getContext('2d');
        if (octx) {
          octx.drawImage(img, 0, 0, targetW, targetH);
          const compressedDataUrl = offscreen.toDataURL('image/jpeg', 0.86);
          onUpdateColorConfig((prev) => ({
            ...prev,
            testImagePreset: 'custom',
            customImageDataUrl: compressedDataUrl,
            customImageName: file.name,
          }));
        } else {
          onUpdateColorConfig((prev) => ({
            ...prev,
            testImagePreset: 'custom',
            customImageDataUrl: rawDataUrl,
            customImageName: file.name,
          }));
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <section className="rounded-none bg-[#2A2D34] border border-[#494F5C]">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadCustomImage}
        className="hidden"
      />

      {/* Main Collapsible Header (Icon-Only Actions) */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#32363F] border-b border-[#494F5C]">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-bold text-[#DCE0E8] cursor-pointer"
        >
          <Palette weight="bold" className="w-4 h-4 text-[#F59E0B]" />
          <span>{t('مختبر الألوان', 'Color Lab')}</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenReportModal}
            title={t('فتح تقرير معايرة الألوان الكامل', 'Open Full Color Calibration Report')}
            className="w-6 h-6 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#F59E0B] border border-[#664B24] text-[#FCD34D] hover:text-[#140E05] cursor-pointer transition-colors"
          >
            <ChartBar weight="bold" className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] rounded-none cursor-pointer transition-colors"
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
          {/* SUB-BOX 1: Test Image Inside Canvas */}
          <div className="rounded-none bg-[#242830] border border-[#434853]">
            <div className="flex items-center justify-between px-2 py-1 bg-[#2E323B] border-b border-[#434853]">
              <button
                type="button"
                onClick={() => setIsImageBoxOpen((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-[#DCE0E8] cursor-pointer"
              >
                <ImageIcon weight="bold" className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>{t('صورة الفحص', 'Test Image')}</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-6 h-6 flex items-center justify-center rounded-none bg-[#1B2C3B] hover:bg-[#38BDF8] border border-[#2C4C66] text-[#7DD3FC] hover:text-[#09131C] cursor-pointer transition-colors"
                  title={t('رفع صورة مخصصة من جهازك داخل الكانفا', 'Upload custom image from device')}
                >
                  <UploadSimple weight="bold" className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsImageBoxOpen((v) => !v)}
                  className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border border-[#3A3E47] rounded-none cursor-pointer"
                >
                  {isImageBoxOpen ? (
                    <CaretUp weight="bold" className="w-3 h-3" />
                  ) : (
                    <CaretDown weight="bold" className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>

            {isImageBoxOpen && (
              <div className="p-2 space-y-1.5">
                {/* Preset Test Images Grid */}
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      { id: 'none', ar: 'إيقاف', en: 'Off' },
                      { id: 'broadcast_chart', ar: 'ألوان', en: 'Chart' },
                      { id: 'hdr_ramp', ar: 'تدرج', en: 'HDR' },
                      { id: 'newsroom_scene', ar: 'استوديو', en: 'Studio' },
                    ] as { id: TestImagePresetType; ar: string; en: string }[]
                  ).map((item) => {
                    const active = (colorConfig.testImagePreset || 'none') === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          onUpdateColorConfig((prev) => ({
                            ...prev,
                            testImagePreset: item.id,
                          }))
                        }
                        className={`py-1 px-1 rounded-none border text-[10px] font-bold cursor-pointer transition-colors truncate ${
                          active
                            ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                            : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        {t(item.ar, item.en)}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Uploaded Image Bar */}
                {colorConfig.customImageDataUrl && (
                  <div className="flex items-center justify-between gap-1 px-2 py-1 bg-[#1B1E24] border border-[#494F5C]">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateColorConfig((prev) => ({
                          ...prev,
                          testImagePreset: 'custom',
                        }))
                      }
                      className={`flex-1 text-right truncate text-[10px] font-bold cursor-pointer ${
                        colorConfig.testImagePreset === 'custom'
                          ? 'text-[#8CC63F]'
                          : 'text-[#DCE0E8]'
                      }`}
                    >
                      {colorConfig.testImagePreset === 'custom' ? '● ' : ''}
                      {colorConfig.customImageName || t('صورة مخصصة', 'Custom Image')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateColorConfig((prev) => ({
                          ...prev,
                          testImagePreset:
                            prev.testImagePreset === 'custom' ? 'none' : prev.testImagePreset,
                          customImageDataUrl: null,
                          customImageName: '',
                        }))
                      }
                      className="w-5 h-5 flex items-center justify-center bg-[#282C35] hover:bg-[#EF4444] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3E47] rounded-none cursor-pointer"
                      title={t('حذف الصورة المرفوعة', 'Remove uploaded image')}
                    >
                      <Trash weight="bold" className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Compact Image Controls when an image is active */}
                {colorConfig.testImagePreset !== 'none' && (
                  <div className="space-y-1.5 pt-1 border-t border-[#3F444E]" dir="ltr">
                    {/* Row 1: Grid Overlay Icon Toggle + Fit Mode + Flip H / Flip V / Reset Offset Icons */}
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateColorConfig((prev) => ({
                            ...prev,
                            showGridOverImage: !prev.showGridOverImage,
                          }))
                        }
                        title={t(
                          colorConfig.showGridOverImage
                            ? 'إخفاء الشبكة فوق الصورة'
                            : 'إظهار الشبكة فوق الصورة',
                          'Toggle Grid Over Image'
                        )}
                        className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
                          colorConfig.showGridOverImage
                            ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                            : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        <GridFour weight="bold" className="w-3.5 h-3.5" />
                      </button>

                      <select
                        value={colorConfig.imageFit || 'contain'}
                        onChange={(e) =>
                          onUpdateColorConfig((prev) => ({
                            ...prev,
                            imageFit: e.target.value as ImageFitMode,
                          }))
                        }
                        className="flex-1 h-6 bg-[#202328] border border-[#494F5C] rounded-none px-1.5 text-[10px] font-mono font-bold text-[#DCE0E8] outline-none cursor-pointer"
                      >
                        <option value="contain">Contain</option>
                        <option value="cover">Cover</option>
                        <option value="stretch">Stretch</option>
                        <option value="center">1:1 Center</option>
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateColorConfig((prev) => ({
                            ...prev,
                            imageFlipH: !prev.imageFlipH,
                          }))
                        }
                        title={t('قلب أفقي (Flip H ↔)', 'Flip Horizontal ↔')}
                        className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer ${
                          colorConfig.imageFlipH
                            ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                            : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        <ArrowsHorizontal weight="bold" className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateColorConfig((prev) => ({
                            ...prev,
                            imageFlipV: !prev.imageFlipV,
                          }))
                        }
                        title={t('قلب عمودي (Flip V ↕)', 'Flip Vertical ↕')}
                        className={`w-6 h-6 flex items-center justify-center rounded-none border cursor-pointer ${
                          colorConfig.imageFlipV
                            ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                            : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        <ArrowsVertical weight="bold" className="w-3.5 h-3.5" />
                      </button>

                      {((colorConfig.imageOffsetX || 0) !== 0 ||
                        (colorConfig.imageOffsetY || 0) !== 0) && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateColorConfig((prev) => ({
                              ...prev,
                              imageOffsetX: 0,
                              imageOffsetY: 0,
                            }))
                          }
                          title={t('تصفير إزاحة الصورة (0,0)', 'Reset Image Offset')}
                          className="w-6 h-6 flex items-center justify-center rounded-none bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] cursor-pointer"
                        >
                          <ArrowCounterClockwise weight="bold" className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Compact Single-Row Sliders: Op% | Sc% | Grid% | X | Y */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="flex items-center gap-1">
                        <span
                          title={t('شفافية الصورة (%)', 'Image Opacity (%)')}
                          className="text-[9px] font-mono text-[#9FA6B3] w-7 shrink-0"
                        >
                          Op%
                        </span>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          step={5}
                          value={colorConfig.imageOpacity ?? 100}
                          onChange={(e) =>
                            onUpdateColorConfig((prev) => ({
                              ...prev,
                              imageOpacity: Number(e.target.value),
                            }))
                          }
                          className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                        />
                        <span className="text-[9px] font-mono text-[#DCE0E8] w-7 text-right">
                          {colorConfig.imageOpacity ?? 100}%
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span
                          title={t('تكبير الصورة (%)', 'Image Scale (%)')}
                          className="text-[9px] font-mono text-[#9FA6B3] w-7 shrink-0"
                        >
                          Sc%
                        </span>
                        <input
                          type="range"
                          min={25}
                          max={200}
                          step={5}
                          value={colorConfig.imageScalePct ?? 100}
                          onChange={(e) =>
                            onUpdateColorConfig((prev) => ({
                              ...prev,
                              imageScalePct: Number(e.target.value),
                            }))
                          }
                          className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                        />
                        <span className="text-[9px] font-mono text-[#DCE0E8] w-7 text-right">
                          {colorConfig.imageScalePct ?? 100}%
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-mono font-bold text-[#38BDF8] w-4 shrink-0">
                          X
                        </span>
                        <input
                          type="range"
                          min={-960}
                          max={960}
                          step={10}
                          value={colorConfig.imageOffsetX || 0}
                          onChange={(e) =>
                            onUpdateColorConfig((prev) => ({
                              ...prev,
                              imageOffsetX: Number(e.target.value),
                            }))
                          }
                          className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                        />
                        <span className="text-[9px] font-mono text-[#DCE0E8] w-8 text-right">
                          {colorConfig.imageOffsetX || 0}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-mono font-bold text-[#38BDF8] w-4 shrink-0">
                          Y
                        </span>
                        <input
                          type="range"
                          min={-540}
                          max={540}
                          step={10}
                          value={colorConfig.imageOffsetY || 0}
                          onChange={(e) =>
                            onUpdateColorConfig((prev) => ({
                              ...prev,
                              imageOffsetY: Number(e.target.value),
                            }))
                          }
                          className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                        />
                        <span className="text-[9px] font-mono text-[#DCE0E8] w-8 text-right">
                          {colorConfig.imageOffsetY || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SUB-BOX 2: Color Swatches & Grayscale/RGB Test Patterns */}
          <div className="rounded-none bg-[#242830] border border-[#434853]">
            <div className="flex items-center justify-between px-2 py-1 bg-[#2E323B] border-b border-[#434853]">
              <button
                type="button"
                onClick={() => setIsSwatchBoxOpen((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-[#DCE0E8] cursor-pointer"
              >
                <Swatches weight="bold" className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>{t('رقاع الألوان', 'Color Swatches')}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSwatchBoxOpen((v) => !v)}
                className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border border-[#3A3E47] rounded-none cursor-pointer"
              >
                {isSwatchBoxOpen ? (
                  <CaretUp weight="bold" className="w-3 h-3" />
                ) : (
                  <CaretDown weight="bold" className="w-3 h-3" />
                )}
              </button>
            </div>

            {isSwatchBoxOpen && (
              <div className="p-2 space-y-1.5">
                <div className="grid grid-cols-5 gap-1">
                  {(
                    [
                      { id: 'none', ar: 'إيقاف', en: 'Off' },
                      { id: 'solid', ar: 'نقي', en: 'Solid' },
                      { id: 'grayscale16', ar: '16 رمادي', en: '16-Gray' },
                      { id: 'rgb_ramps', ar: 'RGB', en: 'RGB' },
                      { id: 'color_checker', ar: '18 لون', en: '18-Col' },
                    ] as { id: ColorSwatchMode; ar: string; en: string }[]
                  ).map((m) => {
                    const active = (colorConfig.swatchMode || 'none') === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          onUpdateColorConfig((prev) => ({
                            ...prev,
                            swatchMode: m.id,
                          }))
                        }
                        className={`py-1 px-1 rounded-none border text-[10px] font-bold cursor-pointer transition-colors truncate ${
                          active
                            ? 'bg-[#F59E0B] text-[#140E05] border-[#FEF3C7]'
                            : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        {t(m.ar, m.en)}
                      </button>
                    );
                  })}
                </div>

                {/* Solid Color Swatch Picker */}
                {colorConfig.swatchMode === 'solid' && (
                  <div className="space-y-1.5 pt-1 border-t border-[#3F444E]">
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => setIsSolidColorPickerOpen(true)}
                        className="h-6 px-2 rounded-none bg-[#C8CDD8] hover:bg-[#D4D9E2] border border-[#3A3E47] text-[10px] font-bold text-[#1C1E22] flex items-center gap-1 cursor-pointer"
                        title={t('منتقي الألوان المخصص', 'Custom Color Picker')}
                      >
                        <span
                          className="w-3 h-3 border border-[#1C1E22] rounded-none shrink-0"
                          style={{ backgroundColor: colorConfig.solidPatchColor || '#FFFFFF' }}
                        />
                        <Palette weight="bold" className="w-3.5 h-3.5 text-[#1C1E22]" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateColorConfig((prev) => ({
                            ...prev,
                            solidFullScreen: !prev.solidFullScreen,
                          }))
                        }
                        className={`h-6 px-2 rounded-none border text-[10px] font-mono font-bold cursor-pointer ${
                          colorConfig.solidFullScreen
                            ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                            : 'bg-[#282C35] text-[#AEB5C2] border-[#3A3E47]'
                        }`}
                      >
                        {colorConfig.solidFullScreen ? '100% Full' : '55% Win'}
                      </button>
                    </div>

                    <div className="grid grid-cols-6 gap-1">
                      {CALIBRATION_SWATCH_PRESETS.map((sw) => {
                        const isSel =
                          (colorConfig.solidPatchColor || '').toUpperCase() ===
                          sw.hex.toUpperCase();
                        return (
                          <button
                            key={sw.hex}
                            type="button"
                            onClick={() =>
                              onUpdateColorConfig((prev) => ({
                                ...prev,
                                solidPatchColor: sw.hex,
                              }))
                            }
                            style={{ backgroundColor: sw.hex }}
                            title={`${lang === 'en' ? sw.nameEn : sw.nameAr} (${sw.ire} IRE)`}
                            className={`h-5 rounded-none border cursor-pointer flex items-center justify-center ${
                              isSel
                                ? 'border-[#DCE0E8] ring-1 ring-[#DCE0E8]'
                                : 'border-[#494F5C]'
                            }`}
                          >
                            <span
                              className={`text-[8px] font-mono font-bold ${
                                sw.ire > 50 ? 'text-[#090D16]' : 'text-[#FFFFFF]'
                              }`}
                            >
                              {sw.ire}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SUB-BOX 3: Compact AE-Style Single-Row Color Grading Scrubbers */}
          <div className="rounded-none bg-[#242830] border border-[#434853]">
            <div className="flex items-center justify-between px-2 py-1 bg-[#2E323B] border-b border-[#434853]">
              <button
                type="button"
                onClick={() => setIsGradingBoxOpen((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-[#DCE0E8] cursor-pointer"
              >
                <SlidersHorizontal weight="bold" className="w-3.5 h-3.5 text-[#8CC63F]" />
                <span>{t('معايرة الإضاءة والألوان', 'Color Grading')}</span>
              </button>

              <div className="flex items-center gap-1">
                {/* Split A/B Toggle Icon in Header */}
                <button
                  type="button"
                  onClick={() =>
                    onUpdateColorConfig((prev) => ({
                      ...prev,
                      splitCompareEnabled: !prev.splitCompareEnabled,
                    }))
                  }
                  title={t('مقارنة نصفين قبل/بعد (Split A/B)', 'Toggle Split-Screen A/B Compare')}
                  className={`h-6 px-1.5 rounded-none border text-[9px] font-mono font-bold flex items-center gap-0.5 cursor-pointer transition-colors ${
                    colorConfig.splitCompareEnabled
                      ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                      : 'bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border-[#3A3E47]'
                  }`}
                >
                  <ArrowsLeftRight weight="bold" className="w-3 h-3" />
                  <span>A/B</span>
                </button>

                {isModified && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateColorConfig((prev) => ({
                        ...prev,
                        brightness: DEFAULT_COLOR_CALIBRATION.brightness,
                        contrast: DEFAULT_COLOR_CALIBRATION.contrast,
                        saturation: DEFAULT_COLOR_CALIBRATION.saturation,
                        hueRotate: DEFAULT_COLOR_CALIBRATION.hueRotate,
                        temperature: DEFAULT_COLOR_CALIBRATION.temperature,
                        gamma: DEFAULT_COLOR_CALIBRATION.gamma,
                        rgbChannel: 'all',
                      }))
                    }
                    title={t('تصفير جميع تعديلات الألوان', 'Reset all color adjustments')}
                    className="w-6 h-6 flex items-center justify-center rounded-none bg-[#B4BAC6] hover:bg-[#C8CDD8] border border-[#3A3E47] text-[#1C1E22] cursor-pointer"
                  >
                    <ArrowCounterClockwise weight="bold" className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsGradingBoxOpen((v) => !v)}
                  className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border border-[#3A3E47] rounded-none cursor-pointer"
                >
                  {isGradingBoxOpen ? (
                    <CaretUp weight="bold" className="w-3 h-3" />
                  ) : (
                    <CaretDown weight="bold" className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>

            {isGradingBoxOpen && (
              <div className="p-2 space-y-1.5">
                {/* Split A/B Position Slider when active */}
                {colorConfig.splitCompareEnabled && (
                  <div className="flex items-center gap-1.5 px-1.5 py-1 bg-[#202328] border border-[#3F444E]" dir="ltr">
                    <span className="text-[9px] font-mono font-bold text-[#8CC63F] shrink-0">A/B</span>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      step={5}
                      value={colorConfig.splitComparePositionPct ?? 50}
                      onChange={(e) =>
                        onUpdateColorConfig((prev) => ({
                          ...prev,
                          splitComparePositionPct: Number(e.target.value),
                        }))
                      }
                      className="flex-1 cursor-pointer accent-[#8CC63F]"
                    />
                    <span className="text-[10px] font-mono text-[#DCE0E8] w-8 text-right">
                      {colorConfig.splitComparePositionPct ?? 50}%
                    </span>
                  </div>
                )}

                {/* Compact RGB Channel Isolation Strip */}
                <div className="grid grid-cols-5 gap-1" dir="ltr">
                  {(
                    [
                      { id: 'all', label: 'RGB', activeBg: 'bg-[#DCE0E8] text-[#111317]' },
                      { id: 'r', label: 'R', activeBg: 'bg-[#EF4444] text-[#FFFFFF]' },
                      { id: 'g', label: 'G', activeBg: 'bg-[#22C55E] text-[#09131C]' },
                      { id: 'b', label: 'B', activeBg: 'bg-[#3B82F6] text-[#FFFFFF]' },
                      { id: 'luma', label: 'LUMA', activeBg: 'bg-[#FACC15] text-[#111317]' },
                    ] as { id: RGBChannelFilter; label: string; activeBg: string }[]
                  ).map((ch) => {
                    const active = (colorConfig.rgbChannel || 'all') === ch.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() =>
                          onUpdateColorConfig((prev) => ({
                            ...prev,
                            rgbChannel: ch.id,
                          }))
                        }
                        title={t(`عزل القناة اللونية (${ch.label})`, `Isolate Channel (${ch.label})`)}
                        className={`py-1 px-1 rounded-none border border-[#3A3E47] text-[9px] font-mono font-bold cursor-pointer transition-colors ${
                          active
                            ? ch.activeBg
                            : 'bg-[#202328] hover:bg-[#323742] text-[#AEB5C2]'
                        }`}
                      >
                        {ch.label}
                      </button>
                    );
                  })}
                </div>

                {/* Single-Row Icon Scrubbers: Brightness, Contrast, Saturation, Temp, Hue, Gamma */}
                <div className="space-y-1 pt-0.5" dir="ltr">
                  {(
                    [
                      {
                        key: 'brightness' as const,
                        code: 'BRT',
                        Icon: Sun,
                        title: t('السطوع (Brightness %)', 'Brightness (%)'),
                        min: 20,
                        max: 200,
                        step: 2,
                        unit: '%',
                        defaultVal: 100,
                      },
                      {
                        key: 'contrast' as const,
                        code: 'CNT',
                        Icon: CircleHalf,
                        title: t('التباين (Contrast %)', 'Contrast (%)'),
                        min: 20,
                        max: 200,
                        step: 2,
                        unit: '%',
                        defaultVal: 100,
                      },
                      {
                        key: 'saturation' as const,
                        code: 'SAT',
                        Icon: Drop,
                        title: t('التشبع اللوني (Saturation %)', 'Saturation (%)'),
                        min: 0,
                        max: 200,
                        step: 5,
                        unit: '%',
                        defaultVal: 100,
                      },
                      {
                        key: 'temperature' as const,
                        code: 'TMP',
                        Icon: Thermometer,
                        title: t('حرارة اللون (Cool / Warm)', 'Color Temperature'),
                        min: -100,
                        max: 100,
                        step: 5,
                        unit: '',
                        defaultVal: 0,
                      },
                      {
                        key: 'hueRotate' as const,
                        code: 'HUE',
                        Icon: Palette,
                        title: t('إزاحة الطيف اللوني (Hue °)', 'Hue Shift (°)'),
                        min: -180,
                        max: 180,
                        step: 5,
                        unit: '°',
                        defaultVal: 0,
                      },
                    ] as const
                  ).map((ctrl) => {
                    const val = colorConfig[ctrl.key] ?? ctrl.defaultVal;
                    const isChanged = val !== ctrl.defaultVal;
                    const IconComp = ctrl.Icon;
                    return (
                      <div
                        key={ctrl.key}
                        title={ctrl.title}
                        className="flex items-center gap-1.5 bg-[#202328] border border-[#383D48] px-1.5 py-1"
                      >
                        <IconComp
                          weight="bold"
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isChanged ? 'text-[#38BDF8]' : 'text-[#8E95A2]'
                          }`}
                        />
                        <span className="w-7 text-[9px] font-mono font-bold text-[#B8BEC9] shrink-0">
                          {ctrl.code}
                        </span>
                        <input
                          type="range"
                          min={ctrl.min}
                          max={ctrl.max}
                          step={ctrl.step}
                          value={val}
                          onChange={(e) =>
                            onUpdateColorConfig((prev) => ({
                              ...prev,
                              [ctrl.key]: Number(e.target.value),
                            }))
                          }
                          className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                        />
                        <span className="w-10 text-right text-[10px] font-mono font-bold text-[#DCE0E8] shrink-0">
                          {val > 0 && ctrl.key === 'temperature' ? `+${val}` : val}
                          {ctrl.unit}
                        </span>
                        {isChanged && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateColorConfig((prev) => ({
                                ...prev,
                                [ctrl.key]: ctrl.defaultVal,
                              }))
                            }
                            title={t('إعادة ضبط', 'Reset')}
                            className="text-[10px] font-mono text-[#38BDF8] hover:text-[#FFFFFF] cursor-pointer shrink-0"
                          >
                            ↺
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Gamma Single-Row Scrubber */}
                  <div
                    title={t('منحنى الجاما (Gamma)', 'Gamma Curve')}
                    className="flex items-center gap-1.5 bg-[#202328] border border-[#383D48] px-1.5 py-1"
                  >
                    <span className="w-3.5 text-center text-[11px] font-mono font-black text-[#8E95A2] shrink-0">
                      γ
                    </span>
                    <span className="w-7 text-[9px] font-mono font-bold text-[#B8BEC9] shrink-0">
                      GAM
                    </span>
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.05}
                      value={colorConfig.gamma ?? 1.0}
                      onChange={(e) =>
                        onUpdateColorConfig((prev) => ({
                          ...prev,
                          gamma: Number(e.target.value),
                        }))
                      }
                      className="flex-1 min-w-0 cursor-pointer accent-[#38BDF8]"
                    />
                    <span className="w-10 text-right text-[10px] font-mono font-bold text-[#DCE0E8] shrink-0">
                      {(colorConfig.gamma ?? 1.0).toFixed(2)}
                    </span>
                    {Math.abs((colorConfig.gamma ?? 1.0) - 1.0) > 0.01 && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateColorConfig((prev) => ({
                            ...prev,
                            gamma: 1.0,
                          }))
                        }
                        title={t('إعادة ضبط', 'Reset')}
                        className="text-[10px] font-mono text-[#38BDF8] hover:text-[#FFFFFF] cursor-pointer shrink-0"
                      >
                        ↺
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SUB-BOX 4: Compact Live Color Telemetry */}
          <div className="rounded-none bg-[#242830] border border-[#434853]">
            <div className="flex items-center justify-between px-2 py-1 bg-[#2E323B] border-b border-[#434853]">
              <button
                type="button"
                onClick={() => setIsTelemetryBoxOpen((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-[#DCE0E8] cursor-pointer"
              >
                <ChartBar weight="bold" className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>{t('القياس اللوني الحي', 'Live Telemetry')}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsTelemetryBoxOpen((v) => !v)}
                className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] border border-[#3A3E47] rounded-none cursor-pointer"
              >
                {isTelemetryBoxOpen ? (
                  <CaretUp weight="bold" className="w-3 h-3" />
                ) : (
                  <CaretDown weight="bold" className="w-3 h-3" />
                )}
              </button>
            </div>

            {isTelemetryBoxOpen && (
              <div className="p-2 space-y-1.5" dir="ltr">
                {/* 3 Compact Telemetry Chips */}
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div className="py-1 px-1 bg-[#202328] border border-[#3F444E]">
                    <span className="block text-[8px] font-mono text-[#9FA6B3]">LUMA</span>
                    <span className="text-[11px] font-mono font-bold text-[#DCE0E8]">
                      {colorMetrics.avgLuminanceIRE} IRE
                    </span>
                  </div>
                  <div className="py-1 px-1 bg-[#202328] border border-[#3F444E]">
                    <span className="block text-[8px] font-mono text-[#9FA6B3]">KELVIN</span>
                    <span className="text-[11px] font-mono font-bold text-[#FEF08A]">
                      {colorMetrics.estimatedKelvin}K
                    </span>
                  </div>
                  <div className="py-1 px-1 bg-[#202328] border border-[#3F444E]">
                    <span className="block text-[8px] font-mono text-[#9FA6B3]">CONTRAST</span>
                    <span className="text-[11px] font-mono font-bold text-[#38BDF8]">
                      {colorMetrics.contrastRatio}
                    </span>
                  </div>
                </div>

                {/* Compact RGB Balance Bars */}
                <div className="space-y-1 p-1.5 bg-[#202328] border border-[#3F444E]">
                  {[
                    { label: 'R', val: colorMetrics.avgR, color: '#EF4444' },
                    { label: 'G', val: colorMetrics.avgG, color: '#22C55E' },
                    { label: 'B', val: colorMetrics.avgB, color: '#3B82F6' },
                  ].map((ch) => (
                    <div key={ch.label} className="flex items-center gap-1.5">
                      <span className="w-3 text-[9px] font-mono font-bold text-[#DCE0E8]">
                        {ch.label}
                      </span>
                      <div className="flex-1 h-2 bg-[#2A2D34] border border-[#3F444E] overflow-hidden">
                        <div
                          style={{
                            width: `${Math.round((ch.val / 255) * 100)}%`,
                            backgroundColor: ch.color,
                          }}
                          className="h-full"
                        />
                      </div>
                      <span className="w-14 text-right text-[9px] font-mono text-[#B8BEC9]">
                        {ch.val} ({Math.round((ch.val / 255) * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>

                {/* Live Hovered Pixel Inspector */}
                {hoveredPixel && (
                  <div className="flex items-center justify-between gap-1.5 px-2 py-1 bg-[#202328] border border-[#494F5C] text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <Eyedropper weight="bold" className="w-3 h-3 text-[#38BDF8] shrink-0" />
                      <span
                        className="w-3.5 h-3.5 border border-[#DCE0E8] shrink-0"
                        style={{ backgroundColor: hoveredPixel.hex }}
                      />
                    </div>
                    <span className="font-mono text-[#DCE0E8] truncate">
                      {hoveredPixel.hex} · ({hoveredPixel.r},{hoveredPixel.g},{hoveredPixel.b}) ·{' '}
                      {hoveredPixel.ire}IRE
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Professional Studio Color Picker Modal for Solid Calibration Patch */}
      <ColorPickerModal
        isOpen={isSolidColorPickerOpen}
        initialColor={colorConfig.solidPatchColor || '#FFFFFF'}
        title={t('منتقي لون رقعة الفحص والمعايرة (Solid Patch)', 'Calibration Solid Patch Color Picker')}
        lang={lang}
        canvasRef={canvasRef}
        onApply={(newHex) =>
          onUpdateColorConfig((prev) => ({
            ...prev,
            solidPatchColor: newHex,
          }))
        }
        onClose={() => setIsSolidColorPickerOpen(false)}
      />
    </section>
  );
});
