import React from 'react';
import {
  ChartBar,
  CheckCircle,
  FileCode,
  FileText,
  Image as ImageIcon,
  X,
} from '@phosphor-icons/react';
import {
  ColorCalibrationConfig,
  DEFAULT_COLOR_CALIBRATION,
  StudioProject,
  UILanguage,
} from '../types/studio';
import {
  CanvasColorAnalysisResult,
  ComputedGridResult,
  computePhysicalWallMetrics,
} from '../utils/gridEngine';
import { saveStudioBinaryFile } from '../utils/tauriBridge';

interface ColorReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: StudioProject;
  computed: ComputedGridResult;
  colorMetrics: CanvasColorAnalysisResult;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  lang: UILanguage;
  onUpdateColorConfig: (
    patchOrUpdater:
      | Partial<ColorCalibrationConfig>
      | ((prev: ColorCalibrationConfig) => ColorCalibrationConfig)
  ) => void;
}

export const ColorReportModal: React.FC<ColorReportModalProps> = ({
  isOpen,
  onClose,
  project,
  computed,
  colorMetrics,
  canvasRef,
  lang,
  onUpdateColorConfig,
}) => {
  if (!isOpen) return null;

  const t = (ar: string, en: string) => (lang === 'en' ? en : ar);
  const colorCfg: ColorCalibrationConfig = {
    ...DEFAULT_COLOR_CALIBRATION,
    ...(project.colorCalibration || {}),
  };
  const physMetrics = computePhysicalWallMetrics(project);
  const procZones = project.processorZones || [];

  const timestampStr = new Date().toLocaleString(lang === 'en' ? 'en-US' : 'ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  // 1. Export JSON Technical Report
  const handleDownloadJsonReport = () => {
    const reportPayload = {
      reportType: 'STUDIO_COLOR_AND_SCREEN_CALIBRATION_REPORT',
      generatedAt: new Date().toISOString(),
      screen: {
        id: project.id,
        name: project.name,
        resolution: `${project.compWidth}x${project.compHeight}`,
        widthPx: project.compWidth,
        heightPx: project.compHeight,
        gridCols: computed.cols,
        gridRows: computed.rows,
        cellSizePx: `${Math.round(computed.baseCellWidth)}x${Math.round(computed.baseCellHeight)}`,
        physicalWallTelemetry: {
          enabled: physMetrics.enabled,
          pixelPitchMm: physMetrics.pixelPitchMm,
          widthMeters: physMetrics.widthMeters,
          heightMeters: physMetrics.heightMeters,
          diagonalMeters: physMetrics.diagonalMeters,
          diagonalInches: physMetrics.diagonalInches,
          areaSqMeters: physMetrics.areaSqMeters,
          cabinetSizePx: `${physMetrics.cabinetWidthPx}x${physMetrics.cabinetHeightPx}`,
          cabinetsMatrix: `${physMetrics.cabinetsCols}x${physMetrics.cabinetsRows}`,
          totalCabinets: physMetrics.totalCabinets,
          totalModules: physMetrics.totalModules,
        },
        processorZones: procZones.map((z) => ({
          port: z.portLabel,
          name: z.name,
          x: z.x,
          y: z.y,
          width: z.width,
          height: z.height,
        })),
      },
      colorCalibrationSettings: {
        brightnessPct: colorCfg.brightness,
        contrastPct: colorCfg.contrast,
        saturationPct: colorCfg.saturation,
        temperatureShift: colorCfg.temperature,
        hueRotateDeg: colorCfg.hueRotate,
        gamma: colorCfg.gamma,
        rgbChannelIsolation: colorCfg.rgbChannel,
        activeSwatchMode: colorCfg.swatchMode,
        activeTestImage: colorCfg.testImagePreset,
      },
      measuredColorMetrics: {
        averageRGB: {
          r: colorMetrics.avgR,
          g: colorMetrics.avgG,
          b: colorMetrics.avgB,
          hex: colorMetrics.avgHex,
        },
        averageLuminanceIRE: colorMetrics.avgLuminanceIRE,
        minLuminanceIRE: colorMetrics.minLuminanceIRE,
        maxLuminanceIRE: colorMetrics.maxLuminanceIRE,
        contrastRatio: colorMetrics.contrastRatio,
        estimatedColorTemperatureKelvin: colorMetrics.estimatedKelvin,
        blackCrushRiskPct: colorMetrics.blackCrushPct,
        whiteClippingRiskPct: colorMetrics.whiteClipPct,
        rec709GamutOverloadPct: colorMetrics.gamutOverloadPct,
        luminanceHistogram8StepPct: colorMetrics.lumaHistogram,
        overallSignalStatus: colorMetrics.status,
      },
      rulersCount: (project.rulers || []).length,
      notesCount: (project.notes || []).length,
      calibrationStatus: colorCfg.calibrationStatus,
      engineerNotes: colorCfg.engineerNotes,
    };

    const blob = new Blob([JSON.stringify(reportPayload, null, 2)], {
      type: 'application/json',
    });
    const fileName = `Color_Report_${project.name.replace(/\s+/g, '_')}.json`;
    void saveStudioBinaryFile(blob, fileName, {
      filterName: 'JSON Calibration Report (.json)',
      extensions: ['json'],
    });
  };

  // 2. Export Formatted Text Report (.txt)
  const handleDownloadTextReport = () => {
    const lines = [
      '====================================================================',
      t(
        'تقرير هندسة ومعايرة الألوان وشاشات الاستوديو (STUDIO COLOR & DISPLAY REPORT)',
        'STUDIO COLOR & DISPLAY CALIBRATION TECHNICAL REPORT'
      ),
      '====================================================================',
      `${t('التاريخ والوقت', 'Date & Time')}: ${timestampStr}`,
      `${t('اسم الشاشة', 'Screen Name')}: ${project.name}`,
      `${t('الأبعاد الفعلية', 'Resolution')}: ${project.compWidth} × ${project.compHeight} px`,
      `${t('تقسيم الشبكة', 'Grid Structure')}: ${computed.cols} Columns × ${computed.rows} Rows (${Math.round(
        computed.baseCellWidth
      )}×${Math.round(computed.baseCellHeight)} px)`,
      `${t('الأبعاد الفيزيائية بالمتر (Physical LED Size)', 'Physical LED Size')}: ${physMetrics.widthMeters}m × ${physMetrics.heightMeters}m (${physMetrics.widthCm}×${physMetrics.heightCm} cm | P${physMetrics.pixelPitchMm}mm | ${physMetrics.areaSqMeters} m²)`,
      `${t('الكابينات والموديولات (Cabinets & Modules)', 'Cabinets & Modules')}: ${physMetrics.cabinetsCols}×${physMetrics.cabinetsRows} = ${physMetrics.totalCabinets} Cabinets (${physMetrics.cabinetWidthPx}×${physMetrics.cabinetHeightPx}px) | ${physMetrics.totalModules} Modules`,
      `${t('حالة الاعتماد', 'Calibration Status')}: ${
        colorCfg.calibrationStatus === 'approved'
          ? t('معتمد للبث المباشر (Approved)', 'Approved for Broadcast')
          : colorCfg.calibrationStatus === 'needs_adjustment'
          ? t('يحتاج ضبط إضافي (Needs Adjustment)', 'Needs Adjustment')
          : t('قيد الفحص والاختبار (Testing)', 'Under Testing')
      }`,
      '--------------------------------------------------------------------',
      t('1. قياسات وتحليل الإشارة اللونية (MEASURED SIGNAL & COLOR TELEMETRY):', '1. MEASURED SIGNAL & COLOR TELEMETRY:'),
      `   • ${t('متوسط النصوع (Average Luminance)', 'Average Luminance')}: ${colorMetrics.avgLuminanceIRE} IRE (Min: ${colorMetrics.minLuminanceIRE} IRE / Max: ${colorMetrics.maxLuminanceIRE} IRE)`,
      `   • ${t('نسبة التباين (Contrast Ratio)', 'Contrast Ratio')}: ${colorMetrics.contrastRatio}`,
      `   • ${t('حرارة اللون المقدرة (Color Temperature)', 'Estimated Color Temp')}: ${colorMetrics.estimatedKelvin} K`,
      `   • ${t('متوسط القنوات (RGB Balance)', 'Average RGB')}: R=${colorMetrics.avgR} (${Math.round(
        (colorMetrics.avgR / 255) * 100
      )}%) | G=${colorMetrics.avgG} (${Math.round(
        (colorMetrics.avgG / 255) * 100
      )}%) | B=${colorMetrics.avgB} (${Math.round((colorMetrics.avgB / 255) * 100)}%) [${colorMetrics.avgHex}]`,
      `   • ${t('نسبة انغلاق الظلال (Black Crush <3 IRE)', 'Black Crush <3 IRE')}: ${colorMetrics.blackCrushPct}%`,
      `   • ${t('نسبة قص الإضاءة العالية (Highlight Clip >97 IRE)', 'White Clip >97 IRE')}: ${colorMetrics.whiteClipPct}%`,
      `   • ${t('تجاوز النطاق اللوني (Gamut Overload)', 'Gamut Overload')}: ${colorMetrics.gamutOverloadPct}%`,
      '--------------------------------------------------------------------',
      t('2. إعدادات ضبط الألوان والسطوع (ACTIVE CALIBRATION PARAMETERS):', '2. ACTIVE CALIBRATION PARAMETERS:'),
      `   • Brightness: ${colorCfg.brightness}%`,
      `   • Contrast: ${colorCfg.contrast}%`,
      `   • Saturation: ${colorCfg.saturation}%`,
      `   • Color Temperature Shift: ${colorCfg.temperature > 0 ? `+${colorCfg.temperature}` : colorCfg.temperature}`,
      `   • Gamma Curve: ${colorCfg.gamma.toFixed(2)}`,
      `   • Hue Shift: ${colorCfg.hueRotate}°`,
      `   • RGB Channel Mode: ${colorCfg.rgbChannel.toUpperCase()}`,
      `   • Active Test Image: ${colorCfg.testImagePreset}`,
      `   • Active Color Swatch: ${colorCfg.swatchMode}`,
      '--------------------------------------------------------------------',
      t('3. المساطر والملاحظات ومناطق المعالجات (RULERS, NOTES & PROCESSOR ZONES):', '3. RULERS, NOTES & PROCESSOR ZONES:'),
      `   • ${t('مناطق المعالجات والمخارج', 'Processor Zones')}: ${procZones.length}`,
      ...procZones.map(
        (z) => `     - [${z.portLabel}] ${z.name}: ${z.width}×${z.height}px @ (${z.x}, ${z.y})`
      ),
      `   • ${t('عدد المساطر النشطة', 'Active Rulers')}: ${(project.rulers || []).length}`,
      ...(project.rulers || []).map(
        (r) =>
          `     - ${r.name} (${r.orientation === 'horizontal' ? 'Y' : 'X'} = ${r.positionPx}px)`
      ),
      `   • ${t('عدد الملاحظات', 'Registered Notes')}: ${(project.notes || []).length}`,
      ...(project.notes || []).map((n) => `     - ${n.text} [${n.targetColor || ''}]`),
      '--------------------------------------------------------------------',
      `${t('ملاحظات مهندس الألوان / المخرج', 'Engineer / Director Remarks')}:`,
      colorCfg.engineerNotes?.trim() || t('لا توجد ملاحظات إضافية.', 'No additional remarks.'),
      '====================================================================',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const fileName = `Calibration_Report_${project.name.replace(/\s+/g, '_')}.txt`;
    void saveStudioBinaryFile(blob, fileName, {
      filterName: 'Text Calibration Report (.txt)',
      extensions: ['txt'],
    });
  };

  // 3. Export Visual PNG Technical Report Card (Canvas Snapshot + Full Telemetry Footer)
  const handleDownloadVisualReportPng = () => {
    const srcCanvas = canvasRef.current;
    const reportW = 1600;
    const previewH = 720;
    const footerH = 420;
    const reportH = previewH + footerH;

    const out = document.createElement('canvas');
    out.width = reportW;
    out.height = reportH;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#181A1F';
    ctx.fillRect(0, 0, reportW, reportH);

    // Draw Live Calibrated Screen Snapshot in top section
    if (srcCanvas && srcCanvas.width > 0 && srcCanvas.height > 0) {
      const pad = 28;
      const availW = reportW - pad * 2;
      const availH = previewH - pad * 2;
      const scale = Math.min(availW / srcCanvas.width, availH / srcCanvas.height);
      const dw = srcCanvas.width * scale;
      const dh = srcCanvas.height * scale;
      const dx = (reportW - dw) / 2;
      const dy = pad + (availH - dh) / 2;

      ctx.fillStyle = '#090D16';
      ctx.fillRect(dx - 4, dy - 4, dw + 8, dh + 8);
      ctx.drawImage(srcCanvas, dx, dy, dw, dh);
      ctx.strokeStyle = '#494F5C';
      ctx.lineWidth = 2;
      ctx.strokeRect(dx, dy, dw, dh);
    }

    // Divider line
    ctx.fillStyle = '#2A2D34';
    ctx.fillRect(0, previewH, reportW, footerH);
    ctx.strokeStyle = '#494F5C';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, previewH);
    ctx.lineTo(reportW, previewH);
    ctx.stroke();

    // Header inside Footer
    ctx.fillStyle = '#DCE0E8';
    ctx.font = '700 26px "Cairo", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `STUDIO COLOR & CALIBRATION REPORT — ${project.name} (${project.compWidth}×${project.compHeight} px)`,
      36,
      previewH + 48
    );

    ctx.fillStyle = '#B8BEC9';
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillText(`Generated: ${timestampStr}   |   Status: ${colorCfg.calibrationStatus.toUpperCase()}`, 36, previewH + 80);

    // 3 Telemetry Columns
    const colW = (reportW - 72 - 40) / 3;
    const boxY = previewH + 105;
    const boxH = 275;

    const drawBox = (idx: number, title: string, rows: [string, string][]) => {
      const bx = 36 + idx * (colW + 20);
      ctx.fillStyle = '#202328';
      ctx.fillRect(bx, boxY, colW, boxH);
      ctx.strokeStyle = '#494F5C';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, boxY, colW, boxH);

      ctx.fillStyle = '#32363F';
      ctx.fillRect(bx, boxY, colW, 38);
      ctx.fillStyle = '#DCE0E8';
      ctx.font = '700 16px "JetBrains Mono", "Cairo", sans-serif';
      ctx.fillText(title, bx + 14, boxY + 25);

      rows.forEach(([k, v], rIdx) => {
        const ry = boxY + 68 + rIdx * 32;
        ctx.fillStyle = '#9FA6B3';
        ctx.font = '600 14px "JetBrains Mono", "Cairo", sans-serif';
        ctx.fillText(k, bx + 14, ry);
        ctx.fillStyle = '#DCE0E8';
        ctx.font = '700 15px "JetBrains Mono", monospace';
        ctx.fillText(v, bx + colW - 14 - ctx.measureText(v).width, ry);
      });
    };

    drawBox(0, '1. MEASURED COLOR & LUMA', [
      ['Average Luminance:', `${colorMetrics.avgLuminanceIRE} IRE`],
      ['Min / Max Luminance:', `${colorMetrics.minLuminanceIRE} / ${colorMetrics.maxLuminanceIRE} IRE`],
      ['Contrast Ratio:', colorMetrics.contrastRatio],
      ['Est. Color Temp:', `${colorMetrics.estimatedKelvin} K`],
      ['Average RGB:', `R:${colorMetrics.avgR} G:${colorMetrics.avgG} B:${colorMetrics.avgB}`],
      ['Average HEX:', colorMetrics.avgHex],
    ]);

    drawBox(1, '2. CALIBRATION SETTINGS', [
      ['Brightness:', `${colorCfg.brightness}%`],
      ['Contrast:', `${colorCfg.contrast}%`],
      ['Saturation:', `${colorCfg.saturation}%`],
      ['Temperature Shift:', `${colorCfg.temperature}`],
      ['Gamma Curve:', `${colorCfg.gamma.toFixed(2)}`],
      ['RGB Channel Mode:', colorCfg.rgbChannel.toUpperCase()],
    ]);

    drawBox(2, '3. SIGNAL QA & GEOMETRY', [
      ['Black Crush (<3 IRE):', `${colorMetrics.blackCrushPct}%`],
      ['Highlight Clip (>97 IRE):', `${colorMetrics.whiteClipPct}%`],
      ['Gamut Overload:', `${colorMetrics.gamutOverloadPct}%`],
      ['Grid Matrix:', `${computed.cols} × ${computed.rows} (${computed.cells.length} cells)`],
      ['Active Rulers / Notes:', `${(project.rulers || []).length} Rulers / ${(project.notes || []).length} Notes`],
      ['Engineer Notes:', (colorCfg.engineerNotes || 'None').slice(0, 22)],
    ]);

    out.toBlob((blob) => {
      if (!blob) return;
      const fileName = `Calibration_Report_Card_${project.name.replace(/\s+/g, '_')}.png`;
      void saveStudioBinaryFile(blob, fileName, {
        filterName: 'PNG Calibration Report Card (.png)',
        extensions: ['png'],
      });
    }, 'image/png');
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-none bg-[#242830] border border-[#494F5C] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#32363F] border-b border-[#494F5C]">
          <div className="flex items-center gap-2">
            <ChartBar weight="bold" className="w-4 h-4 text-[#DCE0E8]" />
            <h2 className="text-sm font-bold text-[#DCE0E8]">
              {t(
                `تقرير اختبار ومعايرة الألوان والشاشة — ${project.name}`,
                `Color & Display Calibration Report — ${project.name}`
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-none bg-[#B4BAC6] hover:bg-[#C8CDD8] text-[#1C1E22] border border-[#3A3E47] cursor-pointer"
          >
            <X weight="bold" className="w-4 h-4 text-[#1C1E22]" />
          </button>
        </div>

        {/* Report Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Top Summary Cards */}
          <div className="grid grid-cols-4 gap-2">
            <div className="p-2.5 bg-[#202328] border border-[#434853]">
              <div className="text-[10px] text-[#B8BEC9]">
                {t('متوسط النصوع (Luminance)', 'Avg Luminance')}
              </div>
              <div dir="ltr" className="text-base font-mono font-bold text-[#DCE0E8] mt-0.5">
                {colorMetrics.avgLuminanceIRE} IRE
              </div>
              <div dir="ltr" className="text-[10px] font-mono text-[#9FA6B3]">
                Min {colorMetrics.minLuminanceIRE}% / Max {colorMetrics.maxLuminanceIRE}%
              </div>
            </div>

            <div className="p-2.5 bg-[#202328] border border-[#434853]">
              <div className="text-[10px] text-[#B8BEC9]">
                {t('حرارة اللون المقدرة', 'Est. Color Temp')}
              </div>
              <div dir="ltr" className="text-base font-mono font-bold text-[#DCE0E8] mt-0.5">
                {colorMetrics.estimatedKelvin} K
              </div>
              <div className="text-[10px] text-[#9FA6B3]">
                {colorMetrics.estimatedKelvin > 7000
                  ? t('ميل للبرودة (Cool)', 'Cool Shift')
                  : colorMetrics.estimatedKelvin < 5800
                  ? t('ميل للدفء (Warm)', 'Warm Shift')
                  : t('متوازن قياسي (D65)', 'Balanced D65')}
              </div>
            </div>

            <div className="p-2.5 bg-[#202328] border border-[#434853]">
              <div className="text-[10px] text-[#B8BEC9]">
                {t('نسبة التباين (Contrast)', 'Contrast Ratio')}
              </div>
              <div dir="ltr" className="text-base font-mono font-bold text-[#DCE0E8] mt-0.5">
                {colorMetrics.contrastRatio}
              </div>
              <div className="text-[10px] text-[#9FA6B3]">
                Gamma {colorCfg.gamma.toFixed(2)}
              </div>
            </div>

            <div className="p-2.5 bg-[#202328] border border-[#434853]">
              <div className="text-[10px] text-[#B8BEC9]">
                {t('سلامة إشارة البث (Signal QA)', 'Broadcast Signal QA')}
              </div>
              <div className="text-sm font-bold text-[#DCE0E8] mt-0.5 flex items-center gap-1">
                <CheckCircle weight="fill" className="w-3.5 h-3.5 text-[#D0D5DE]" />
                <span>
                  {colorMetrics.status === 'optimal'
                    ? t('مطابق Rec.709', 'Rec.709 Legal')
                    : colorMetrics.status === 'warning'
                    ? t('تنبيه نطاق الإضاءة', 'Luma Warning')
                    : t('قص في الإضاءة/الظلال', 'Signal Clipping')}
                </span>
              </div>
              <div dir="ltr" className="text-[10px] font-mono text-[#9FA6B3]">
                Crush {colorMetrics.blackCrushPct}% | Clip {colorMetrics.whiteClipPct}%
              </div>
            </div>
          </div>

          {/* RGB Channels & Luminance Histogram */}
          <div className="grid grid-cols-2 gap-3">
            {/* RGB Distribution */}
            <div className="p-3 bg-[#2A2D34] border border-[#494F5C] space-y-2">
              <div className="flex items-center justify-between border-b border-[#3F444E] pb-1.5">
                <span className="font-bold text-[#DCE0E8]">
                  {t('تحليل توازن القنوات اللونية (RGB Channels)', 'RGB Channel Balance')}
                </span>
                <span dir="ltr" className="font-mono text-[11px] text-[#B8BEC9]">
                  {colorMetrics.avgHex}
                </span>
              </div>

              {[
                { name: t('القناة الحمراء (Red)', 'Red Channel (R)'), val: colorMetrics.avgR, hex: '#EF4444' },
                { name: t('القناة الخضراء (Green)', 'Green Channel (G)'), val: colorMetrics.avgG, hex: '#22C55E' },
                { name: t('القناة الزرقاء (Blue)', 'Blue Channel (B)'), val: colorMetrics.avgB, hex: '#3B82F6' },
              ].map((c) => {
                const pct = Math.round((c.val / 255) * 100);
                return (
                  <div key={c.name} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#DCE0E8]">{c.name}</span>
                      <span dir="ltr" className="font-mono text-[#B8BEC9]">
                        {c.val} / 255 ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-[#202328] border border-[#3F444E]">
                      <div
                        style={{ width: `${pct}%`, backgroundColor: c.hex }}
                        className="h-full"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 8-Step Luminance Histogram (0 to 100 IRE) */}
            <div className="p-3 bg-[#2A2D34] border border-[#494F5C] flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-[#3F444E] pb-1.5">
                <span className="font-bold text-[#DCE0E8]">
                  {t('توزيع النصوع والإضاءة (Luminance Histogram)', 'Luminance Distribution (IRE)')}
                </span>
                <span dir="ltr" className="font-mono text-[11px] text-[#B8BEC9]">
                  0–100 IRE
                </span>
              </div>

              <div dir="ltr" className="h-24 flex items-end gap-1.5 pt-3 px-1">
                {colorMetrics.lumaHistogram.map((pct, i) => {
                  const barH = Math.max(6, Math.min(100, pct * 1.8));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <span className="text-[9px] font-mono text-[#B8BEC9]">{pct}%</span>
                      <div className="w-full bg-[#202328] border border-[#3F444E] h-16 flex items-end">
                        <div
                          style={{ height: `${barH}%` }}
                          className="w-full bg-[#C4C9D4]"
                        />
                      </div>
                      <span className="text-[9px] font-mono text-[#9FA6B3]">
                        {i * 12}-{Math.min(100, (i + 1) * 13)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Calibration Parameters Summary Table + Physical LED Wall Telemetry */}
          <div className="p-3 bg-[#2A2D34] border border-[#494F5C] space-y-2">
            <div className="font-bold text-[#DCE0E8] border-b border-[#3F444E] pb-1.5">
              {t('معاملات الضبط والأبعاد الفيزيائية للجدار والكابينات', 'Active Screen, Color & LED Wall Telemetry')}
            </div>
            <div className="grid grid-cols-4 gap-2 text-[11px]">
              <div className="p-1.5 bg-[#202328] border border-[#3F444E] flex justify-between">
                <span className="text-[#9FA6B3]">{t('الأبعاد:', 'Resolution:')}</span>
                <span dir="ltr" className="font-mono font-bold text-[#DCE0E8]">
                  {project.compWidth}×{project.compHeight}
                </span>
              </div>
              <div className="p-1.5 bg-[#202328] border border-[#3F444E] flex justify-between">
                <span className="text-[#9FA6B3]">{t('السطوع:', 'Brightness:')}</span>
                <span dir="ltr" className="font-mono font-bold text-[#DCE0E8]">
                  {colorCfg.brightness}%
                </span>
              </div>
              <div className="p-1.5 bg-[#202328] border border-[#3F444E] flex justify-between">
                <span className="text-[#9FA6B3]">{t('التباين:', 'Contrast:')}</span>
                <span dir="ltr" className="font-mono font-bold text-[#DCE0E8]">
                  {colorCfg.contrast}%
                </span>
              </div>
              <div className="p-1.5 bg-[#202328] border border-[#3F444E] flex justify-between">
                <span className="text-[#9FA6B3]">{t('التشبع:', 'Saturation:')}</span>
                <span dir="ltr" className="font-mono font-bold text-[#DCE0E8]">
                  {colorCfg.saturation}%
                </span>
              </div>
              <div className="p-1.5 bg-[#202328] border border-[#3F444E] flex justify-between">
                <span className="text-[#9FA6B3]">{t('الأبعاد بالمتر:', 'Physical (m):')}</span>
                <span dir="ltr" className="font-mono font-bold text-[#FEF08A]">
                  {physMetrics.widthMeters}×{physMetrics.heightMeters}m
                </span>
              </div>
              <div className="p-1.5 bg-[#202328] border border-[#3F444E] flex justify-between">
                <span className="text-[#9FA6B3]">{t('Pixel Pitch:', 'Pixel Pitch:')}</span>
                <span dir="ltr" className="font-mono font-bold text-[#DCE0E8]">
                  P{physMetrics.pixelPitchMm} mm
                </span>
              </div>
              <div className="p-1.5 bg-[#202328] border border-[#3F444E] flex justify-between">
                <span className="text-[#9FA6B3]">{t('الكابينات:', 'Cabinets:')}</span>
                <span dir="ltr" className="font-mono font-bold text-[#38BDF8]">
                  {physMetrics.cabinetsCols}×{physMetrics.cabinetsRows} ({physMetrics.totalCabinets})
                </span>
              </div>
              <div className="p-1.5 bg-[#202328] border border-[#3F444E] flex justify-between">
                <span className="text-[#9FA6B3]">{t('الموديولات:', 'Modules:')}</span>
                <span dir="ltr" className="font-mono font-bold text-[#DCE0E8]">
                  {physMetrics.totalModules} Mod
                </span>
              </div>
            </div>

            {procZones.length > 0 && (
              <div className="pt-1 space-y-1">
                <div className="text-[10px] font-bold text-[#B8BEC9]">
                  {t('مناطق المعالجات والمخارج النشطة:', 'Active Processor Output Zones:')} ({procZones.length})
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {procZones.map((z) => (
                    <div
                      key={z.id}
                      className="p-1.5 bg-[#202328] border border-[#3F444E] flex items-center justify-between text-[10px]"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 border border-[#DCE0E8] shrink-0"
                          style={{ backgroundColor: z.color }}
                        />
                        <span className="font-mono font-bold text-[#FEF08A] shrink-0">
                          [{z.portLabel}]
                        </span>
                        <span className="font-bold text-[#DCE0E8] truncate">{z.name}</span>
                      </div>
                      <span dir="ltr" className="font-mono text-[#B8BEC9] shrink-0">
                        {z.width}×{z.height} @ ({z.x},{z.y})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Registered Engineering Notes & Rulers Inventory */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Registered Notes List */}
            <div className="p-3 bg-[#2A2D34] border border-[#494F5C] space-y-2">
              <div className="flex items-center justify-between border-b border-[#3F444E] pb-1.5">
                <span className="font-bold text-[#DCE0E8]">
                  {t('جدول الملاحظات والمواقع المسجلة', 'Registered Studio Notes')} (
                  {(project.notes || []).length})
                </span>
              </div>
              {(project.notes || []).length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                  {(project.notes || []).map((note) => {
                    const noteColor =
                      note.targetColor ||
                      (note.targetCellKey
                        ? computed.cellMap[note.targetCellKey]?.effectiveColor
                        : '#FEF08A');
                    const matchingCells = computed.cells.filter((c) => {
                      if (note.scope === 'single' && note.targetCellKey) {
                        return c.key === note.targetCellKey;
                      }
                      if (note.scope === 'color-group' && note.targetColor) {
                        return (
                          c.hasCustomColor &&
                          c.effectiveColor.toUpperCase() === note.targetColor.toUpperCase()
                        );
                      }
                      return false;
                    });
                    const coordsLabel =
                      matchingCells.length > 0
                        ? matchingCells.slice(0, 6).map((c) => c.displayId).join(', ') +
                          (matchingCells.length > 6 ? ` +${matchingCells.length - 6}` : '')
                        : '-';

                    return (
                      <div
                        key={note.id}
                        className="p-1.5 bg-[#202328] border border-[#3F444E] flex items-center justify-between gap-2 text-[10px]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-3 h-3 border border-[#DCE0E8] shrink-0"
                            style={{ backgroundColor: noteColor }}
                          />
                          <span className="font-bold text-[#DCE0E8] truncate">{note.text}</span>
                        </div>
                        <span dir="ltr" className="font-mono text-[#B8BEC9] shrink-0">
                          [{coordsLabel}]
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-[#9FA6B3] py-2 text-center">
                  {t('لا توجد ملاحظات مسجلة على هذه الشاشة.', 'No notes registered on this screen.')}
                </div>
              )}
            </div>

            {/* Active Rulers List */}
            <div className="p-3 bg-[#2A2D34] border border-[#494F5C] space-y-2">
              <div className="flex items-center justify-between border-b border-[#3F444E] pb-1.5">
                <span className="font-bold text-[#DCE0E8]">
                  {t('جدول المساطر الهندسية النشطة', 'Active Engineering Rulers')} (
                  {(project.rulers || []).length})
                </span>
              </div>
              {(project.rulers || []).length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                  {(project.rulers || []).map((r) => {
                    const maxDim =
                      r.orientation === 'horizontal' ? project.compHeight : project.compWidth;
                    const pct = ((r.positionPx / Math.max(1, maxDim)) * 100).toFixed(1);
                    return (
                      <div
                        key={r.id}
                        className="p-1.5 bg-[#202328] border border-[#3F444E] flex items-center justify-between gap-2 text-[10px]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 border border-[#DCE0E8] shrink-0"
                            style={{ backgroundColor: r.color }}
                          />
                          <span className="font-bold text-[#DCE0E8] truncate">{r.name}</span>
                        </div>
                        <span dir="ltr" className="font-mono text-[#B8BEC9] shrink-0">
                          {r.orientation === 'horizontal' ? 'Y' : 'X'} = {r.positionPx}px ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-[#9FA6B3] py-2 text-center">
                  {t('لا توجد مساطر مضافة على هذه الشاشة.', 'No rulers added on this screen.')}
                </div>
              )}
            </div>
          </div>

          {/* Approval Status & Engineer Notes */}
          <div className="p-3 bg-[#2A2D34] border border-[#494F5C] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#DCE0E8]">
                {t('حالة اعتماد الشاشة وملاحظات مهندس الإضاءة/الألوان:', 'Calibration Sign-Off & Notes:')}
              </span>
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'approved', ar: '✓ معتمد للبث', en: '✓ Approved' },
                    { id: 'testing', ar: 'قيد الفحص', en: 'Testing' },
                    { id: 'needs_adjustment', ar: 'يحتاج ضبط', en: 'Needs Adjust' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() =>
                      onUpdateColorConfig((prev) => ({
                        ...prev,
                        calibrationStatus: st.id,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-none border border-[#3A3E47] text-[10px] font-bold cursor-pointer ${
                      colorCfg.calibrationStatus === st.id
                        ? 'bg-[#C8CDD8] text-[#1C1E22] ring-1 ring-[#DCE0E8]'
                        : 'bg-[#9FA6B3] hover:bg-[#B4BAC6] text-[#1C1E22]'
                    }`}
                  >
                    {t(st.ar, st.en)}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={2}
              value={colorCfg.engineerNotes || ''}
              onChange={(e) =>
                onUpdateColorConfig((prev) => ({
                  ...prev,
                  engineerNotes: e.target.value,
                }))
              }
              placeholder={t(
                'سجل ملاحظات فحص الألوان والسطوع أو توصيات الضبط الفني هنا لتضمينها في التقرير...',
                'Enter color calibration findings or technical remarks for the report...'
              )}
              className="w-full bg-[#202328] border border-[#434853] focus:border-[#B8BEC9] rounded-none p-2 text-xs text-[#DCE0E8] placeholder-[#8A919E] outline-none resize-none"
            />
          </div>
        </div>

        {/* Modal Footer: Export Options */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-[#32363F] border-t border-[#494F5C]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleDownloadVisualReportPng}
              className="px-3 py-1.5 rounded-none bg-[#C8CDD8] hover:bg-[#D4D9E2] border border-[#3A3E47] text-[#1C1E22] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ImageIcon weight="bold" className="w-3.5 h-3.5 text-[#1C1E22]" />
              <span>{t('تحميل بطاقة التقرير المصورة (PNG)', 'Download Visual Report Card (PNG)')}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTextReport}
              className="px-3 py-1.5 rounded-none bg-[#B4BAC6] hover:bg-[#C8CDD8] border border-[#3A3E47] text-[#1C1E22] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <FileText weight="bold" className="w-3.5 h-3.5 text-[#1C1E22]" />
              <span>{t('تحميل التقرير النصي (.TXT)', 'Download Text Report (.TXT)')}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadJsonReport}
              className="px-3 py-1.5 rounded-none bg-[#B4BAC6] hover:bg-[#C8CDD8] border border-[#3A3E47] text-[#1C1E22] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <FileCode weight="bold" className="w-3.5 h-3.5 text-[#1C1E22]" />
              <span>{t('بيانات التقرير (.JSON)', 'Export Report (.JSON)')}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-none bg-[#9FA6B3] hover:bg-[#B4BAC6] border border-[#3A3E47] text-[#1C1E22] text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>{t('إغلاق', 'Close')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
