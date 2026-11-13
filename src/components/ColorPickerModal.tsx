import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsLeftRight,
  Check,
  CopySimple,
  Eyedropper,
  LockKey,
  Palette,
  ShieldCheck,
  Sparkle,
  Swatches,
  X,
} from '@phosphor-icons/react';
import {
  CALIBRATION_SWATCH_PRESETS,
  RULER_COLOR_PALETTE,
  SELECTION_COLOR_SWATCHES,
  UILanguage,
} from '../types/studio';

const RECENT_COLORS_STORAGE_KEY = 'studio_director_recent_custom_colors_v1';

export interface ColorPickerModalProps {
  isOpen: boolean;
  initialColor: string;
  title?: string;
  lang: UILanguage;
  /** Optional map of UPPERCASE HEX -> Owner Note Name for showing locked colors */
  lockedColorsMap?: Map<string, string>;
  /** Optional reference to the active Studio Canvas for cross-browser pixel sampling */
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onApply: (newHexColor: string) => void;
  onClose: () => void;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSV {
  h: number; // 0 - 360
  s: number; // 0 - 100
  v: number; // 0 - 100
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function hexToRgb(hex: string): RGB {
  const cleaned = hex.replace(/[^0-9A-Fa-f]/g, '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return { r: r || 0, g: g || 0, b: b || 0 };
  }
  if (cleaned.length >= 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return {
      r: Number.isNaN(r) ? 255 : r,
      g: Number.isNaN(g) ? 255 : g,
      b: Number.isNaN(b) ? 255 : b,
    };
  }
  return { r: 255, g: 255, b: 255 };
}

function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

function hsvToRgb({ h, s, v }: HSV): RGB {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;

  const i = Math.floor(hn * 6);
  const f = hn * 6 - i;
  const p = vn * (1 - sn);
  const q = vn * (1 - f * sn);
  const t = vn * (1 - (1 - f) * sn);

  let r = 0;
  let g = 0;
  let b = 0;

  switch (i % 6) {
    case 0:
      r = vn;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = vn;
      b = p;
      break;
    case 2:
      r = p;
      g = vn;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = vn;
      break;
    case 4:
      r = t;
      g = p;
      b = vn;
      break;
    case 5:
      r = vn;
      g = p;
      b = q;
      break;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

function loadRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_COLORS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((c) => typeof c === 'string' && /^#[0-9A-F]{6}$/i.test(c));
      }
    }
  } catch {
    // ignore
  }
  return ['#FEF08A', '#A7F3D0', '#BFDBFE', '#FBCFE8', '#38BDF8', '#F97316', '#10B981', '#A855F7'];
}

function saveRecentColor(hex: string): string[] {
  const upper = hex.toUpperCase();
  const current = loadRecentColors();
  const next = [upper, ...current.filter((c) => c.toUpperCase() !== upper)].slice(0, 14);
  try {
    localStorage.setItem(RECENT_COLORS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

function kelvinToRgb(kelvin: number): RGB {
  const temp = clamp(kelvin, 1500, 15000) / 100;
  let r: number;
  let g: number;
  let b: number;

  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b = 255;
  }

  return {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255),
  };
}

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  isOpen,
  initialColor,
  title,
  lang,
  lockedColorsMap,
  canvasRef,
  onApply,
  onClose,
}) => {
  const t = (ar: string, en: string) => (lang === 'en' ? en : ar);

  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(initialColor || '#FEF08A')));
  const [hexDraft, setHexDraft] = useState<string>(() => (initialColor || '#FEF08A').toUpperCase());
  const [recentColors, setRecentColors] = useState<string[]>(() => loadRecentColors());
  const [copiedHex, setCopiedHex] = useState<boolean>(false);
  const [activeSwatchTab, setActiveSwatchTab] = useState<'studio' | 'broadcast' | 'shades'>('studio');
  const [kelvinSlider, setKelvinSlider] = useState<number>(6500);
  const [isCanvasSamplerOpen, setIsCanvasSamplerOpen] = useState<boolean>(false);

  const svCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const samplerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingSvRef = useRef<boolean>(false);

  // Sync state when modal opens with a new initialColor
  useEffect(() => {
    if (isOpen) {
      const cleanHex = /^#[0-9A-Fa-f]{6}$/.test(initialColor)
        ? initialColor.toUpperCase()
        : rgbToHex(hexToRgb(initialColor || '#FEF08A'));
      const nextRgb = hexToRgb(cleanHex);
      setHsv(rgbToHsv(nextRgb));
      setHexDraft(cleanHex);
      setRecentColors(loadRecentColors());
    }
  }, [isOpen, initialColor]);

  const currentRgb = useMemo(() => hsvToRgb(hsv), [hsv]);
  const currentHex = useMemo(() => rgbToHex(currentRgb), [currentRgb]);

  useEffect(() => {
    setHexDraft(currentHex);
  }, [currentHex]);

  // Broadcast Rec.709 Luminance IRE & Legal Signal Check
  const telemetry = useMemo(() => {
    const luma0to255 = 0.2126 * currentRgb.r + 0.7152 * currentRgb.g + 0.0722 * currentRgb.b;
    const ire = Math.round((luma0to255 / 255) * 100);
    // Relative luminance for WCAG contrast
    const sRGB = [currentRgb.r / 255, currentRgb.g / 255, currentRgb.b / 255].map((v) =>
      v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    );
    const relL = 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
    const contrastBlack = ((relL + 0.05) / 0.05).toFixed(1);
    const contrastWhite = (1.05 / (relL + 0.05)).toFixed(1);

    // Broadcast Rec.709 safe range is 16..235 in 8-bit RGB, or saturation <= 92% at high value
    const isOutOfBroadcastSafe =
      currentRgb.r > 242 ||
      currentRgb.g > 242 ||
      currentRgb.b > 242 ||
      (currentRgb.r < 12 && currentRgb.g < 12 && currentRgb.b < 12) ||
      (hsv.s > 92 && hsv.v > 92);

    return {
      ire,
      contrastBlack,
      contrastWhite,
      isOutOfBroadcastSafe,
    };
  }, [currentRgb, hsv]);

  // Generate Tints, Shades & Harmonies for Current Hue
  const generatedShades = useMemo(() => {
    const steps: { hex: string; label: string }[] = [];
    const presets: { s: number; v: number; label: string }[] = [
      { s: 25, v: 98, label: 'Pastel 1' },
      { s: 45, v: 96, label: 'Pastel 2' },
      { s: 65, v: 95, label: 'Soft' },
      { s: 82, v: 92, label: 'Vivid' },
      { s: 90, v: 80, label: 'Rich' },
      { s: 90, v: 62, label: 'Deep' },
      { s: 85, v: 42, label: 'Dark' },
      { s: clamp(hsv.s, 40, 90), v: clamp(hsv.v, 50, 95), label: 'Comp' },
    ];
    presets.forEach((p, idx) => {
      const hVal = idx === 7 ? (hsv.h + 180) % 360 : hsv.h;
      steps.push({
        hex: rgbToHex(hsvToRgb({ h: hVal, s: p.s, v: p.v })),
        label: p.label,
      });
    });
    return steps;
  }, [hsv.h, hsv.s, hsv.v]);

  // Render the 2D Saturation-Value Canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // 1. Base Hue fill
    const pureHueRgb = hsvToRgb({ h: hsv.h, s: 100, v: 100 });
    ctx.fillStyle = rgbToHex(pureHueRgb);
    ctx.fillRect(0, 0, w, h);

    // 2. Horizontal White-to-Transparent gradient (Saturation)
    const gradWhite = ctx.createLinearGradient(0, 0, w, 0);
    gradWhite.addColorStop(0, 'rgba(255,255,255,1)');
    gradWhite.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradWhite;
    ctx.fillRect(0, 0, w, h);

    // 3. Vertical Transparent-to-Black gradient (Value/Brightness)
    const gradBlack = ctx.createLinearGradient(0, 0, 0, h);
    gradBlack.addColorStop(0, 'rgba(0,0,0,0)');
    gradBlack.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradBlack;
    ctx.fillRect(0, 0, w, h);

    // 4. Draw Crosshair Reticle at current (S, V)
    const cx = (hsv.s / 100) * w;
    const cy = ((100 - hsv.v) / 100) * h;

    ctx.save();
    ctx.strokeStyle = hsv.v > 60 && hsv.s < 50 ? '#181A1F' : '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 6, cy - 6, 12, 12);
    ctx.strokeStyle = '#181A1F';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 7, cy - 7, 14, 14);
    ctx.restore();
  }, [isOpen, hsv]);

  const updateSvFromPointer = useCallback((clientX: number, clientY: number) => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = clamp(Math.round(((clientX - rect.left) / rect.width) * 100), 0, 100);
    const v = clamp(Math.round(100 - ((clientY - rect.top) / rect.height) * 100), 0, 100);
    setHsv((prev) => ({ ...prev, s, v }));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onWindowMouseMove = (e: MouseEvent) => {
      if (!isDraggingSvRef.current) return;
      updateSvFromPointer(e.clientX, e.clientY);
    };
    const onWindowMouseUp = () => {
      isDraggingSvRef.current = false;
    };
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [isOpen, updateSvFromPointer]);

  // Render Canvas Sampler Snapshot when isCanvasSamplerOpen is active
  useEffect(() => {
    if (!isOpen || !isCanvasSamplerOpen) return;
    const src = canvasRef?.current;
    const dst = samplerCanvasRef.current;
    if (!src || !dst) return;
    const ctx = dst.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, dst.width, dst.height);
    ctx.drawImage(src, 0, 0, dst.width, dst.height);
  }, [isOpen, isCanvasSamplerOpen, canvasRef]);

  const sampleFromCanvasSnapshot = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const dst = samplerCanvasRef.current;
    if (!dst) return;
    const ctx = dst.getContext('2d');
    if (!ctx) return;
    const rect = dst.getBoundingClientRect();
    const x = clamp(Math.floor(((e.clientX - rect.left) / rect.width) * dst.width), 0, dst.width - 1);
    const y = clamp(Math.floor(((e.clientY - rect.top) / rect.height) * dst.height), 0, dst.height - 1);
    try {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      setHsv(rgbToHsv({ r: pixel[0], g: pixel[1], b: pixel[2] }));
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  const selectHexColor = (hex: string) => {
    const rgb = hexToRgb(hex);
    setHsv(rgbToHsv(rgb));
  };

  const handleRgbInput = (channel: keyof RGB, val: number) => {
    const clamped = clamp(Math.round(val), 0, 255);
    const nextRgb: RGB = { ...currentRgb, [channel]: clamped };
    setHsv(rgbToHsv(nextRgb));
  };

  const handleLegalizeRec709 = () => {
    // Clamp RGB channels to Broadcast Safe 16..235 and cap excessive saturation
    const safeR = clamp(currentRgb.r, 16, 235);
    const safeG = clamp(currentRgb.g, 16, 235);
    const safeB = clamp(currentRgb.b, 16, 235);
    const nextHsv = rgbToHsv({ r: safeR, g: safeG, b: safeB });
    setHsv({
      h: nextHsv.h,
      s: Math.min(nextHsv.s, 88),
      v: clamp(nextHsv.v, 10, 92),
    });
  };

  const handleNativeEyeDropper = async () => {
    if ('EyeDropper' in window) {
      try {
        // @ts-expect-error EyeDropper API in Chromium browsers
        const dropper = new window.EyeDropper();
        const result = await dropper.open();
        if (result?.sRGBHex) {
          selectHexColor(result.sRGBHex);
        }
      } catch {
        // user canceled
      }
    }
  };

  const lockedOwner = lockedColorsMap?.get(currentHex.toUpperCase());

  const handleConfirm = () => {
    if (lockedOwner) return;
    const updatedRecents = saveRecentColor(currentHex);
    setRecentColors(updatedRecents);
    onApply(currentHex);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 select-none"
    >
      <div
        dir={lang === 'en' ? 'ltr' : 'rtl'}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#242830] border border-[#494F5C] rounded-none shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#32363F] border-b border-[#494F5C]">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-[#B4BAC6] text-[#1C1E22] border border-[#3A3E47] rounded-none">
              <Palette weight="bold" className="w-4 h-4 text-[#1C1E22]" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-[#DCE0E8]">
                {title || t('منتقي ومعاير الألوان الاحترافي (Studio Color Picker)', 'Studio Pro Color Picker')}
              </h2>
              <p className="text-[10px] text-[#AEB5C2]">
                {t(
                  'اختيار دقيق عبر الطيف اللوني، قنوات RGB/HSV، ومعايير البث Rec.709 IRE',
                  'Precision 2D spectrum, RGB/HSV channels, and Rec.709 IRE telemetry'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 studio-btn border rounded-none cursor-pointer"
          >
            <X weight="bold" className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 space-y-3 max-h-[82vh] overflow-y-auto">
          {/* Top Grid: Left = 2D SV Box + Hue Slider | Right = Live Before/After Preview + Telemetry + HEX/RGB/HSV */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* 2D Saturation-Brightness Canvas & Hue Spectrum Bar (7 cols) */}
            <div className="md:col-span-7 space-y-2">
              <div className="relative border border-[#494F5C] bg-[#181A1F] rounded-none overflow-hidden">
                <canvas
                  ref={svCanvasRef}
                  width={320}
                  height={190}
                  onMouseDown={(e) => {
                    isDraggingSvRef.current = true;
                    updateSvFromPointer(e.clientX, e.clientY);
                  }}
                  className="w-full h-[185px] block cursor-crosshair"
                />
              </div>

              {/* 360° Hue Spectrum Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-[#B8BEC9]">
                  <span>{t('درجة الطيف اللوني (Hue 0°–360°)', 'Hue Spectrum (0°–360°)')}</span>
                  <span dir="ltr" className="font-mono text-[#DCE0E8]">
                    {hsv.h}°
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={hsv.h}
                  onChange={(e) => setHsv((prev) => ({ ...prev, h: Number(e.target.value) }))}
                  style={{
                    background:
                      'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
                  }}
                  className="w-full h-3 appearance-none border border-[#494F5C] rounded-none cursor-pointer"
                />
              </div>

              {/* Direct H / S / V Numeric & Slider Controls + Kelvin Temperature */}
              <div className="p-2 bg-[#202328] border border-[#434853] rounded-none space-y-1.5">
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-[9px] text-[#B8BEC9]">
                      <span>Hue (0-360°)</span>
                      <input
                        type="number"
                        min={0}
                        max={360}
                        dir="ltr"
                        value={hsv.h}
                        onChange={(e) =>
                          setHsv((prev) => ({
                            ...prev,
                            h: clamp(Math.round(Number(e.target.value) || 0), 0, 360),
                          }))
                        }
                        className="w-11 bg-[#181A1F] border border-[#434853] px-1 py-0.5 text-[10px] font-mono text-[#DCE0E8] text-center outline-none rounded-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-[9px] text-[#B8BEC9]">
                      <span>{t('تشبع S%', 'Sat S%')}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        dir="ltr"
                        value={hsv.s}
                        onChange={(e) =>
                          setHsv((prev) => ({
                            ...prev,
                            s: clamp(Math.round(Number(e.target.value) || 0), 0, 100),
                          }))
                        }
                        className="w-11 bg-[#181A1F] border border-[#434853] px-1 py-0.5 text-[10px] font-mono text-[#DCE0E8] text-center outline-none rounded-none"
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={hsv.s}
                      onChange={(e) => setHsv((prev) => ({ ...prev, s: Number(e.target.value) }))}
                      className="w-full cursor-pointer"
                    />
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-[9px] text-[#B8BEC9]">
                      <span>{t('سطوع V%', 'Val V%')}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        dir="ltr"
                        value={hsv.v}
                        onChange={(e) =>
                          setHsv((prev) => ({
                            ...prev,
                            v: clamp(Math.round(Number(e.target.value) || 0), 0, 100),
                          }))
                        }
                        className="w-11 bg-[#181A1F] border border-[#434853] px-1 py-0.5 text-[10px] font-mono text-[#DCE0E8] text-center outline-none rounded-none"
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={hsv.v}
                      onChange={(e) => setHsv((prev) => ({ ...prev, v: Number(e.target.value) }))}
                      className="w-full cursor-pointer"
                    />
                  </div>
                </div>

                {/* Kelvin Color Temperature Bar (2000K Warm Tungsten -> 6500K D65 -> 10000K Cool Daylight) */}
                <div className="pt-1 border-t border-[#363B44] space-y-0.5">
                  <div className="flex items-center justify-between text-[9px] text-[#B8BEC9]">
                    <span>{t('طيف حرارة الإضاءة (Kelvin 2000K–10000K):', 'Lighting Color Temp (2000K–10000K):')}</span>
                    <span dir="ltr" className="font-mono text-[#DCE0E8]">
                      {kelvinSlider}K
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2000}
                    max={10000}
                    step={100}
                    value={kelvinSlider}
                    onChange={(e) => {
                      const k = Number(e.target.value);
                      setKelvinSlider(k);
                      setHsv(rgbToHsv(kelvinToRgb(k)));
                    }}
                    style={{
                      background:
                        'linear-gradient(to right, #ff8a12 0%, #ffd1a3 35%, #ffffff 56%, #d6e4ff 78%, #9bbcff 100%)',
                    }}
                    className="w-full h-2.5 appearance-none border border-[#494F5C] rounded-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Interactive Studio Canvas Eyedropper Sampler Box */}
              {isCanvasSamplerOpen && canvasRef?.current && (
                <div className="p-2 bg-[#181A1F] border border-[#C8CDD8] rounded-none space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-[#DCE0E8]">
                      {t('انقر أو اسحب على الكانفا لالتقاط أي بكسل:', 'Click or drag on canvas snapshot to sample pixel:')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCanvasSamplerOpen(false)}
                      className="px-1.5 py-0.5 studio-btn border text-[9px] font-bold rounded-none cursor-pointer"
                    >
                      {t('إغلاق المعاينة', 'Close Sampler')}
                    </button>
                  </div>
                  <canvas
                    ref={samplerCanvasRef}
                    width={360}
                    height={202}
                    onMouseDown={sampleFromCanvasSnapshot}
                    onMouseMove={(e) => {
                      if (e.buttons === 1) sampleFromCanvasSnapshot(e);
                    }}
                    className="w-full h-32 block border border-[#494F5C] cursor-crosshair"
                  />
                </div>
              )}
            </div>

            {/* Right Column: Before/After Swatch + HEX Input + RGB Channels + Broadcast IRE (5 cols) */}
            <div className="md:col-span-5 flex flex-col justify-between space-y-2">
              {/* Before / New Color Split Comparison */}
              <div className="p-2 bg-[#202328] border border-[#434853] rounded-none space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-[#B8BEC9] gap-1">
                  <span className="truncate">{t('مقارنة اللون', 'Prev vs. New')}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {canvasRef?.current && (
                      <button
                        type="button"
                        onClick={() => setIsCanvasSamplerOpen((v) => !v)}
                        title={t('التقاط لون مباشرة من الكانفا والصورة المرجعية', 'Sample pixel directly from Studio Canvas')}
                        className={`px-1.5 py-0.5 border rounded-none text-[9px] font-bold flex items-center gap-1 cursor-pointer ${
                          isCanvasSamplerOpen
                            ? 'studio-btn-active ring-1 ring-[#FFFFFF]'
                            : 'studio-btn'
                        }`}
                      >
                        <Eyedropper weight="bold" className="w-3 h-3" />
                        <span>{t('من الكانفا', 'Canvas')}</span>
                      </button>
                    )}
                    {'EyeDropper' in window && (
                      <button
                        type="button"
                        onClick={handleNativeEyeDropper}
                        title={t('التقاط لون من أي مكان على الشاشة', 'Pick color from screen')}
                        className="px-1.5 py-0.5 studio-btn border rounded-none text-[9px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Eyedropper weight="bold" className="w-3 h-3" />
                        <span>{t('قطارة', 'Screen')}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 h-10 border border-[#494F5C] rounded-none overflow-hidden">
                  <button
                    type="button"
                    onClick={() => selectHexColor(initialColor)}
                    style={{ backgroundColor: initialColor || '#FFFFFF' }}
                    title={t('انقر لاستعادة اللون السابق', 'Click to revert to previous color')}
                    className="h-full flex items-center justify-center cursor-pointer border-r border-[#494F5C]"
                  >
                    <span className="px-1.5 py-0.5 bg-black/55 text-[9px] font-mono text-white">
                      {t('السابق', 'Prev')}
                    </span>
                  </button>
                  <div
                    style={{ backgroundColor: currentHex }}
                    className="h-full flex items-center justify-center"
                  >
                    <span className="px-1.5 py-0.5 bg-black/55 text-[9px] font-mono font-bold text-white">
                      {currentHex}
                    </span>
                  </div>
                </div>

                {/* HEX Input & Copy */}
                <div className="flex items-center gap-1 pt-1">
                  <span className="text-[10px] font-mono font-bold text-[#B8BEC9]">HEX</span>
                  <input
                    type="text"
                    dir="ltr"
                    value={hexDraft}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setHexDraft(val);
                      if (/^#[0-9A-F]{6}$/.test(val)) {
                        selectHexColor(val);
                      }
                    }}
                    className="flex-1 min-w-0 bg-[#181A1F] border border-[#434853] focus:border-[#C8CDD8] px-2 py-1 text-xs font-mono font-bold text-[#DCE0E8] text-center outline-none rounded-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(currentHex);
                      setCopiedHex(true);
                      setTimeout(() => setCopiedHex(false), 1200);
                    }}
                    title={t('نسخ كود HEX', 'Copy HEX')}
                    className="p-1.5 studio-btn border rounded-none cursor-pointer"
                  >
                    {copiedHex ? (
                      <Check weight="bold" className="w-3.5 h-3.5" />
                    ) : (
                      <CopySimple weight="bold" className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* RGB Precision Inputs */}
              <div className="p-2 bg-[#202328] border border-[#434853] rounded-none space-y-1.5">
                {(
                  [
                    { key: 'r' as const, label: 'R', color: '#EF4444' },
                    { key: 'g' as const, label: 'G', color: '#22C55E' },
                    { key: 'b' as const, label: 'B', color: '#3B82F6' },
                  ] as const
                ).map((ch) => (
                  <div key={ch.key} className="flex items-center gap-1.5">
                    <span
                      style={{ color: ch.color }}
                      className="w-3 text-[11px] font-mono font-bold"
                    >
                      {ch.label}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={255}
                      value={currentRgb[ch.key]}
                      onChange={(e) => handleRgbInput(ch.key, Number(e.target.value))}
                      className="flex-1 cursor-pointer"
                    />
                    <input
                      type="number"
                      min={0}
                      max={255}
                      dir="ltr"
                      value={currentRgb[ch.key]}
                      onChange={(e) => handleRgbInput(ch.key, Number(e.target.value))}
                      className="w-12 bg-[#181A1F] border border-[#434853] px-1 py-0.5 text-[11px] font-mono text-[#DCE0E8] text-center outline-none rounded-none"
                    />
                  </div>
                ))}
              </div>

              {/* Broadcast Telemetry (IRE + Contrast + Legalizer) */}
              <div className="p-2 bg-[#202328] border border-[#434853] rounded-none space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[#B8BEC9]">{t('نصوع البث (Luma):', 'Broadcast Luma:')}</span>
                  <span dir="ltr" className="font-mono font-bold text-[#DCE0E8]">
                    {telemetry.ire} IRE
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[#B8BEC9]">{t('التباين (أبيض/أسود):', 'Contrast W/B:')}</span>
                  <span dir="ltr" className="font-mono text-[#DCE0E8]">
                    {telemetry.contrastWhite}:1 / {telemetry.contrastBlack}:1
                  </span>
                </div>

                {telemetry.isOutOfBroadcastSafe ? (
                  <button
                    type="button"
                    onClick={handleLegalizeRec709}
                    className="w-full mt-1 py-1 px-2 studio-btn border rounded-none text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                    title={t(
                      'تعديل اللون تلقائياً ليتوافق مع النطاق الآمن للبث التلفزيوني Rec.709 (16-235)',
                      'Adjust color to Rec.709 Broadcast Safe legal range (16-235)'
                    )}
                  >
                    <Sparkle weight="fill" className="w-3 h-3" />
                    <span>{t('ضبط للنطاق الآمن Rec.709', 'Legalize Rec.709')}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1 text-[10px] text-[#AEB5C2] pt-0.5">
                    <ShieldCheck weight="fill" className="w-3.5 h-3.5 text-[#D0D5DE]" />
                    <span>{t('مطابق للنطاق الآمن للبث Rec.709', 'Rec.709 Broadcast Safe')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Warning if Color is Reserved by Another Note */}
          {lockedOwner && (
            <div className="p-2 bg-[#3A2226] border border-[#8C4A52] rounded-none flex items-center justify-between gap-2 text-xs text-[#DCE0E8]">
              <div className="flex items-center gap-1.5">
                <LockKey weight="fill" className="w-4 h-4 text-[#DCE0E8] shrink-0" />
                <span>
                  {t(
                    `هذا اللون محجوز حالياً للملاحظة: "${lockedOwner}" — يرجى اختيار درجة لونية أخرى.`,
                    `This color is reserved by note: "${lockedOwner}" — please pick another shade.`
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Swatch Libraries Tabs (Studio Pastels & Rulers | Broadcast IRE | Shades & Harmonies) */}
          <div className="bg-[#202328] border border-[#434853] rounded-none">
            <div className="grid grid-cols-3 border-b border-[#434853] bg-[#2A2D34]">
              {[
                {
                  id: 'studio' as const,
                  label: t('ألوان الاستوديو والمساطر', 'Studio & Ruler Swatches'),
                  Icon: Swatches,
                },
                {
                  id: 'broadcast' as const,
                  label: t('رقاع معايرة البث (IRE)', 'Broadcast IRE Patches'),
                  Icon: Palette,
                },
                {
                  id: 'shades' as const,
                  label: t('تدرجات وتناغم اللون', 'Shades & Harmony'),
                  Icon: ArrowsLeftRight,
                },
              ].map(({ id, label, Icon }) => {
                const active = activeSwatchTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSwatchTab(id)}
                    className={`py-1.5 px-2 text-[10px] font-bold flex items-center justify-center gap-1 border-b-2 rounded-none cursor-pointer transition-colors ${
                      active
                        ? 'studio-btn-elevated border-[#FACC15]'
                        : 'bg-[#2A2D34] hover:bg-[#32363F] text-[#DCE0E8] border-transparent'
                    }`}
                  >
                    <Icon weight="bold" className="w-3 h-3" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-2.5 space-y-2">
              {activeSwatchTab === 'studio' && (
                <div className="space-y-2">
                  <div>
                    <span className="block text-[10px] text-[#AEB5C2] mb-1">
                      {t('ألوان التحديد والملاحظات والمساطر القياسية:', 'Selection, Notes & Ruler Swatches:')}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        ...SELECTION_COLOR_SWATCHES.map((s) => s.hex),
                        ...RULER_COLOR_PALETTE,
                      ]
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .map((hex) => {
                          const isSel = currentHex === hex.toUpperCase();
                          const owner = lockedColorsMap?.get(hex.toUpperCase());
                          return (
                            <button
                              key={hex}
                              type="button"
                              onClick={() => selectHexColor(hex)}
                              style={{ backgroundColor: hex }}
                              title={owner ? `${hex} (${owner})` : hex}
                              className={`relative w-6 h-6 rounded-none border flex items-center justify-center cursor-pointer ${
                                isSel
                                  ? 'border-[#DCE0E8] ring-2 ring-[#DCE0E8] scale-110'
                                  : 'border-[#494F5C]'
                              }`}
                            >
                              {owner && (
                                <LockKey weight="bold" className="w-3 h-3 text-[#1C1E22]" />
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* Recent Custom Colors */}
                  {recentColors.length > 0 && (
                    <div className="pt-1.5 border-t border-[#363B44]">
                      <span className="block text-[10px] text-[#AEB5C2] mb-1">
                        {t('الألوان المستخدمة مؤخراً:', 'Recently Used Colors:')}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {recentColors.map((hex) => {
                          const isSel = currentHex === hex.toUpperCase();
                          return (
                            <button
                              key={hex}
                              type="button"
                              onClick={() => selectHexColor(hex)}
                              style={{ backgroundColor: hex }}
                              title={hex}
                              className={`w-5 h-5 rounded-none border cursor-pointer ${
                                isSel
                                  ? 'border-[#DCE0E8] ring-2 ring-[#DCE0E8] scale-110'
                                  : 'border-[#494F5C]'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeSwatchTab === 'broadcast' && (
                <div className="grid grid-cols-6 gap-1.5">
                  {CALIBRATION_SWATCH_PRESETS.map((sw) => {
                    const isSel = currentHex === sw.hex.toUpperCase();
                    return (
                      <button
                        key={sw.hex}
                        type="button"
                        onClick={() => selectHexColor(sw.hex)}
                        style={{ backgroundColor: sw.hex }}
                        className={`h-7 rounded-none border flex items-center justify-between px-1.5 cursor-pointer ${
                          isSel
                            ? 'border-[#DCE0E8] ring-2 ring-[#DCE0E8]'
                            : 'border-[#494F5C]'
                        }`}
                      >
                        <span
                          className={`text-[9px] font-bold truncate ${
                            sw.ire > 50 ? 'text-[#1C1E22]' : 'text-[#FFFFFF]'
                          }`}
                        >
                          {lang === 'en' ? sw.nameEn.split(' ')[0] : sw.nameAr.split(' ')[0]}
                        </span>
                        <span
                          dir="ltr"
                          className={`text-[9px] font-mono font-bold ${
                            sw.ire > 50 ? 'text-[#1C1E22]' : 'text-[#DCE0E8]'
                          }`}
                        >
                          {sw.ire}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {activeSwatchTab === 'shades' && (
                <div className="grid grid-cols-8 gap-1.5">
                  {generatedShades.map((sh, idx) => {
                    const isSel = currentHex === sh.hex;
                    return (
                      <button
                        key={`${sh.hex}-${idx}`}
                        type="button"
                        onClick={() => selectHexColor(sh.hex)}
                        style={{ backgroundColor: sh.hex }}
                        title={`${sh.label}: ${sh.hex}`}
                        className={`h-8 rounded-none border flex flex-col items-center justify-end pb-0.5 cursor-pointer ${
                          isSel
                            ? 'border-[#DCE0E8] ring-2 ring-[#DCE0E8]'
                            : 'border-[#494F5C]'
                        }`}
                      >
                        <span className="px-1 bg-black/60 text-[8px] font-mono text-white">
                          {sh.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#32363F] border-t border-[#494F5C]">
          <div className="flex items-center gap-2">
            <span
              className="w-5 h-5 border border-[#DCE0E8] rounded-none shrink-0"
              style={{ backgroundColor: currentHex }}
            />
            <span dir="ltr" className="text-xs font-mono font-bold text-[#DCE0E8]">
              {currentHex} | RGB({currentRgb.r}, {currentRgb.g}, {currentRgb.b}) | {telemetry.ire} IRE
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 studio-btn border rounded-none text-xs font-bold cursor-pointer"
            >
              {t('إلغاء', 'Cancel')}
            </button>
            <button
              type="button"
              disabled={Boolean(lockedOwner)}
              onClick={handleConfirm}
              className="px-4 py-1.5 studio-btn-elevated disabled:opacity-40 disabled:pointer-events-none border rounded-none text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Check weight="bold" className="w-3.5 h-3.5" />
              <span>{t('اعتماد اللون', 'Apply Color')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
