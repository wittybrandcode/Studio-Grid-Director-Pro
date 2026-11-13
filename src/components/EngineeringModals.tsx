import React, { useState } from 'react';
import {
  ArrowSquareOut,
  Check,
  CheckCircle,
  Copy,
  Cpu,
  Crosshair,
  DownloadSimple,
  Eye,
  FileXls,
  Keyboard,
  Lightning,
  Monitor,
  Note,
  Package,
  Plugs,
  Printer,
  Sparkle,
  SquaresFour,
  Warning,
  X,
} from '@phosphor-icons/react';
import { StudioProject, StudioNoteItem, UILanguage } from '../types/studio';
import {
  computeGrid,
  computePhysicalWallMetrics,
  exportScreenNativePixelMapPng,
  exportAllScreensPixelMapPack,
} from '../utils/gridEngine';

interface TechnicalPatchSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  screens: StudioProject[];
  activeScreen: StudioProject;
  lang?: UILanguage;
}

export const TechnicalPatchSheetModal: React.FC<TechnicalPatchSheetModalProps> = ({
  isOpen,
  onClose,
  screens,
  activeScreen,
  lang = 'ar',
}) => {
  if (!isOpen) return null;

  const isEn = lang === 'en';
  const t = (ar: string, en: string) => (isEn ? en : ar);
  const cellBorder = isEn
    ? 'border-r border-[#343946] print:border-black'
    : 'border-l border-[#343946] print:border-black';
  const rowCellBorder = isEn
    ? 'border-r border-[#2C303A] print:border-black'
    : 'border-l border-[#2C303A] print:border-black';

  const totalWorkspacePixels = screens.reduce(
    (sum, s) => sum + s.compWidth * s.compHeight,
    0
  );

  const screenRows = screens.map((s, idx) => {
    const grid = computeGrid(s);
    const phys = computePhysicalWallMetrics(s);
    const activeNotes: StudioNoteItem[] = (s.notes || []).filter(
      (n) => n.text && n.text.trim() !== ''
    );
    return {
      index: idx + 1,
      screen: s,
      grid,
      phys,
      activeNotes,
    };
  });

  const totalCabinetsAll = screenRows.reduce((sum, r) => sum + r.phys.totalCabinets, 0);
  const totalMaxKwAll = screenRows.reduce((sum, r) => sum + r.phys.maxKw, 0);
  const totalAvgKwAll = screenRows.reduce((sum, r) => sum + r.phys.avgKw, 0);
  const totalMaxAmpsAll = screenRows.reduce((sum, r) => sum + r.phys.maxAmps, 0);
  const totalPortsAll = screenRows.reduce((sum, r) => sum + r.phys.ethernetPortsRequired, 0);

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div className="bg-[#181A20] border border-[#3E4452] w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl print:max-h-none print:border-black print:bg-white print:text-black">
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#20232B] border-b border-[#343946] print:bg-gray-100 print:border-black">
          <div className="flex items-center gap-2.5">
            <FileXls weight="bold" className="w-5 h-5 text-[#FACC15] print:text-black" />
            <div>
              <h2 className="text-sm font-bold text-[#F3F5F8] print:text-black">
                {t(
                  'بطاقة التسليم والتوثيق الهندسي للشاشات (LED Engineering & Patch Sheet)',
                  'LED Engineering & Technical Patch Sheet'
                )}
              </h2>
              <p className="text-[11px] text-[#9AA1AE] print:text-gray-700">
                {t(
                  'جدول أبعاد الشاشات بالمتر، أحمال الكهرباء (kW / Amps)، منافذ الشبكة (650K px)، ومخارج المعالجات',
                  'Screen physical dimensions (m), electrical power load (kW / Amps), data ports (650K px), and processor outputs'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => exportScreenNativePixelMapPng(activeScreen)}
              className="px-3 py-1.5 text-[11px] font-bold studio-btn-elevated border flex items-center gap-1.5 cursor-pointer"
              title={t(
                'تصدير خريطة الشاشة النشطة بدقة البكسل الحقيقية 1:1',
                'Export active screen 1:1 native pixel map PNG'
              )}
            >
              <DownloadSimple weight="bold" className="w-3.5 h-3.5" />
              <span>
                {t(`خريطة 1:1 (${activeScreen.name})`, `1:1 Map (${activeScreen.name})`)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => exportAllScreensPixelMapPack(screens)}
              className="px-3 py-1.5 text-[11px] font-bold studio-btn border flex items-center gap-1.5 cursor-pointer"
              title={t(
                'تصدير جميع الشاشات بدقة 1:1 مع الخريطة المجمعة',
                'Export all screens 1:1 PNGs plus composite wall map'
              )}
            >
              <Package weight="bold" className="w-3.5 h-3.5" />
              <span>
                {t(
                  `تصدير حزمة كل الشاشات (${screens.length})`,
                  `Export All Screens Pack (${screens.length})`
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 text-[11px] font-bold studio-btn-elevated border flex items-center gap-1.5 cursor-pointer"
              title={t(
                'طباعة أو حفظ البطاقة الهندسية كملف PDF',
                'Print or save engineering patch sheet as PDF'
              )}
            >
              <Printer weight="bold" className="w-3.5 h-3.5" />
              <span>{t('طباعة / PDF', 'Print / PDF')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 bg-[#2A2E39] hover:bg-[#DC2626] text-[#E6E9F0] hover:text-white transition-colors cursor-pointer"
              title={t('إغلاق', 'Close')}
            >
              <X weight="bold" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-5 text-xs print:overflow-visible">
          {/* Summary KPI Bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            <div className="bg-[#20232B] border border-[#343946] p-3 print:bg-gray-50 print:border-gray-400">
              <div className="text-[10px] text-[#9AA1AE] print:text-gray-600 flex items-center gap-1">
                <Monitor weight="bold" className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>{t('إجمالي الشاشات والبكسلات', 'Total Screens & Pixels')}</span>
              </div>
              <div className="text-sm font-mono font-bold text-[#F3F5F8] print:text-black mt-1">
                {screens.length} {t('شاشات', 'Screens')} | {(totalWorkspacePixels / 1_000_000).toFixed(2)} MP
              </div>
              <div className="text-[10px] font-mono text-[#8A919E] print:text-gray-600">
                {totalWorkspacePixels.toLocaleString()} px
              </div>
            </div>

            <div className="bg-[#20232B] border border-[#343946] p-3 print:bg-gray-50 print:border-gray-400">
              <div className="text-[10px] text-[#9AA1AE] print:text-gray-600 flex items-center gap-1">
                <SquaresFour weight="bold" className="w-3.5 h-3.5 text-[#FACC15]" />
                <span>{t('إجمالي الكابينات (Cabinets)', 'Total LED Cabinets')}</span>
              </div>
              <div className="text-sm font-mono font-bold text-[#FACC15] print:text-black mt-1">
                {totalCabinetsAll} {t('كابينة', 'Cabinets')}
              </div>
              <div className="text-[10px] font-mono text-[#8A919E] print:text-gray-600">
                {t('شاملة جميع الشاشات', 'Across all workspace screens')}
              </div>
            </div>

            <div className="bg-[#20232B] border border-[#343946] p-3 print:bg-gray-50 print:border-gray-400">
              <div className="text-[10px] text-[#9AA1AE] print:text-gray-600 flex items-center gap-1">
                <Lightning weight="bold" className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>{t('القدرة الكهربائية القصوى / المتوسطة', 'Peak / Avg Power Load')}</span>
              </div>
              <div className="text-sm font-mono font-bold text-[#F3F5F8] print:text-black mt-1">
                {totalMaxKwAll.toFixed(2)} kW Max
              </div>
              <div className="text-[10px] font-mono text-[#8A919E] print:text-gray-600">
                {t(`متوسط التشغيل: ${totalAvgKwAll.toFixed(2)} kW`, `Typical Avg: ${totalAvgKwAll.toFixed(2)} kW`)}
              </div>
            </div>

            <div className="bg-[#20232B] border border-[#343946] p-3 print:bg-gray-50 print:border-gray-400">
              <div className="text-[10px] text-[#9AA1AE] print:text-gray-600 flex items-center gap-1">
                <Lightning weight="bold" className="w-3.5 h-3.5 text-[#EF4444]" />
                <span>{t('إجمالي سحب التيار (Amps)', 'Total Current Draw (Amps)')}</span>
              </div>
              <div className="text-sm font-mono font-bold text-[#F87171] print:text-black mt-1">
                {totalMaxAmpsAll.toFixed(1)} A
              </div>
              <div className="text-[10px] font-mono text-[#8A919E] print:text-gray-600">
                {t('عند ذروة الإضاءة البيضاء 100%', 'At 100% full white load')}
              </div>
            </div>

            <div className="bg-[#20232B] border border-[#343946] p-3 print:bg-gray-50 print:border-gray-400">
              <div className="text-[10px] text-[#9AA1AE] print:text-gray-600 flex items-center gap-1">
                <Plugs weight="bold" className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>{t('منافذ الداتا المطلوبة (650K/Port)', 'Required Data Ports (650K/Port)')}</span>
              </div>
              <div className="text-sm font-mono font-bold text-[#4ADE80] print:text-black mt-1">
                {totalPortsAll} Ports (RJ45)
              </div>
              <div className="text-[10px] font-mono text-[#8A919E] print:text-gray-600">
                {t('بمعيار 650,000 بكسل لكل منفذ', 'At 650,000 pixels per Ethernet port')}
              </div>
            </div>
          </div>

          {/* 1. Master Screens Engineering Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#E6E9F0] print:text-black flex items-center gap-1.5">
              <Monitor weight="bold" className="w-4 h-4 text-[#38BDF8] print:text-black" />
              <span>
                {t(
                  '1. جدول المواصفات الهندسية للشاشات (Screens Master Schedule)',
                  '1. Screens Master Engineering Schedule'
                )}
              </span>
            </h3>
            <div className="overflow-x-auto border border-[#343946] print:border-black">
              <table className={`w-full ${isEn ? 'text-left' : 'text-right'} border-collapse text-[11px]`}>
                <thead>
                  <tr className="bg-[#222630] text-[#D0D5DF] border-b border-[#343946] print:bg-gray-200 print:text-black print:border-black">
                    <th className={`p-2 ${cellBorder}`}>#</th>
                    <th className={`p-2 ${cellBorder}`}>{t('اسم الشاشة', 'Screen Name')}</th>
                    <th className={`p-2 ${cellBorder}`}>{t('الدقة (px)', 'Resolution (px)')}</th>
                    <th className={`p-2 ${cellBorder}`}>{t('الشبكة (عمود×صف)', 'Grid (Col×Row)')}</th>
                    <th className={`p-2 ${cellBorder}`}>Pitch</th>
                    <th className={`p-2 ${cellBorder}`}>{t('الأبعاد بالمتر (م)', 'Physical Size (m)')}</th>
                    <th className={`p-2 ${cellBorder}`}>{t('الكابينات', 'Cabinets')}</th>
                    <th className={`p-2 ${cellBorder}`}>{t('الحمل الكهربائي', 'Power Load')}</th>
                    <th className="p-2">{t('منافذ الشبكة ومسار الداتا', 'Data Ports & Cabling')}</th>
                  </tr>
                </thead>
                <tbody>
                  {screenRows.map(({ index, screen, grid, phys }) => (
                    <tr
                      key={screen.id}
                      className="border-b border-[#2C303A] bg-[#1B1E26] hover:bg-[#232732] print:bg-white print:border-black"
                    >
                      <td className={`p-2 font-mono font-bold ${rowCellBorder}`}>
                        #{index}
                      </td>
                      <td className={`p-2 font-bold text-[#F3F5F8] print:text-black ${rowCellBorder}`}>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 inline-block shrink-0"
                            style={{ backgroundColor: screen.selectionColor || '#38BDF8' }}
                          />
                          <span>{screen.name}</span>
                        </div>
                      </td>
                      <td className={`p-2 font-mono ${rowCellBorder}`}>
                        {screen.compWidth}×{screen.compHeight}
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600">
                          {(phys.totalPixels / 1_000_000).toFixed(2)} MP
                        </span>
                      </td>
                      <td className={`p-2 font-mono ${rowCellBorder}`}>
                        {grid.cols}×{grid.rows}
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600">
                          ({grid.baseCellWidth}×{grid.baseCellHeight}px)
                        </span>
                      </td>
                      <td className={`p-2 font-mono ${rowCellBorder}`}>
                        P{phys.pixelPitchMm}
                      </td>
                      <td className={`p-2 font-mono font-bold text-[#38BDF8] print:text-black ${rowCellBorder}`}>
                        {phys.widthMeters}m × {phys.heightMeters}m
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600 font-normal">
                          {t(
                            `المساحة: ${phys.areaSqMeters} m² | القطر: ${phys.diagonalMeters}m`,
                            `Area: ${phys.areaSqMeters} m² | Diag: ${phys.diagonalMeters}m`
                          )}
                        </span>
                      </td>
                      <td className={`p-2 font-mono ${rowCellBorder}`}>
                        {phys.cabinetsCols}×{phys.cabinetsRows} = <b>{phys.totalCabinets}</b>
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600">
                          ({phys.cabinetWidthCm}×{phys.cabinetHeightCm}cm)
                        </span>
                      </td>
                      <td className={`p-2 font-mono ${rowCellBorder}`}>
                        <span className="font-bold text-[#FACC15] print:text-black">
                          {phys.maxKw} kW
                        </span>{' '}
                        ({phys.maxAmps}A @ {phys.supplyVoltage}V)
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600">
                          {t(
                            `متوسط: ${phys.avgKw} kW (${phys.avgAmps}A)`,
                            `Avg: ${phys.avgKw} kW (${phys.avgAmps}A)`
                          )}
                        </span>
                      </td>
                      <td className="p-2 font-mono">
                        <span className="font-bold text-[#4ADE80] print:text-black">
                          {phys.ethernetPortsRequired} Ports
                        </span>{' '}
                        {t(`(حتى ${phys.maxCabinetsPerPort} كابينة/منفذ)`, `(max ${phys.maxCabinetsPerPort} cab/port)`)}
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600">
                          {t('المسار:', 'Path:')} {screen.cabinetConfig?.cablingPattern || 'snake_h_tl'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Processor Output Zones Patch Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#E6E9F0] print:text-black flex items-center gap-1.5">
              <Cpu weight="bold" className="w-4 h-4 text-[#FACC15] print:text-black" />
              <span>
                {t(
                  '2. جدول مخارج المعالجات وتوزيع المنافذ (Processor Output Zones & Port Load)',
                  '2. Processor Output Zones & Port Load Schedule'
                )}
              </span>
            </h3>
            <div className="overflow-x-auto border border-[#343946] print:border-black">
              <table className={`w-full ${isEn ? 'text-left' : 'text-right'} border-collapse text-[11px]`}>
                <thead>
                  <tr className="bg-[#222630] text-[#D0D5DF] border-b border-[#343946] print:bg-gray-200 print:text-black print:border-black">
                    <th className={`p-2 ${cellBorder}`}>{t('الشاشة', 'Screen')}</th>
                    <th className={`p-2 ${cellBorder}`}>{t('المنفذ / المنطقة (Zone)', 'Port / Zone')}</th>
                    <th className={`p-2 ${cellBorder}`}>{t('إحداثيات البداية (X, Y)', 'Origin (X, Y)')}</th>
                    <th className={`p-2 ${cellBorder}`}>{t('الأبعاد (W × H)', 'Dimensions (W × H)')}</th>
                    <th className={`p-2 ${cellBorder}`}>{t('إجمالي البكسلات', 'Total Pixels')}</th>
                    <th className={`p-2 ${cellBorder}`}>{t('نسبة تحميل منفذ 650K', '650K Port Load')}</th>
                    <th className="p-2">{t('الحالة الهندسية', 'Engineering Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {screenRows.flatMap(({ screen }) =>
                    (screen.processorZones || []).map((z) => {
                      const px = z.width * z.height;
                      const pct = Math.round((px / 650000) * 100);
                      const overloaded = px > 650000;
                      return (
                        <tr
                          key={`${screen.id}-${z.id}`}
                          className="border-b border-[#2C303A] bg-[#1B1E26] print:bg-white print:border-black"
                        >
                          <td className={`p-2 font-bold ${rowCellBorder}`}>
                            {screen.name}
                          </td>
                          <td className={`p-2 font-mono font-bold ${rowCellBorder}`}>
                            <span
                              className={`inline-block w-2.5 h-2.5 ${isEn ? 'mr-1.5' : 'ml-1.5'}`}
                              style={{ backgroundColor: z.color }}
                            />
                            {z.portLabel} — {z.name}
                          </td>
                          <td className={`p-2 font-mono ${rowCellBorder}`}>
                            X:{z.x}, Y:{z.y}
                          </td>
                          <td className={`p-2 font-mono ${rowCellBorder}`}>
                            {z.width} × {z.height} px
                          </td>
                          <td className={`p-2 font-mono ${rowCellBorder}`}>
                            {px.toLocaleString()} px ({Math.round(px / 1000)}K)
                          </td>
                          <td className={`p-2 font-mono ${rowCellBorder}`}>
                            <span className={overloaded ? 'text-[#F87171] font-bold' : 'text-[#4ADE80]'}>
                              {pct}%
                            </span>
                          </td>
                          <td className="p-2">
                            {overloaded ? (
                              <span className="inline-flex items-center gap-1 text-[#F87171] font-bold">
                                <Warning weight="bold" className="w-3.5 h-3.5" />
                                {t(
                                  `يتجاوز سعة منفذ 650K (يتطلب ${Math.ceil(px / 650000)} منافذ)`,
                                  `Exceeds 650K limit (requires ${Math.ceil(px / 650000)} ports)`
                                )}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[#4ADE80]">
                                <CheckCircle weight="bold" className="w-3.5 h-3.5" />
                                {t('ضمن سعة منفذ كابل واحد (≤650K)', 'Within single port capacity (≤650K)')}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {screenRows.every((r) => (r.screen.processorZones || []).length === 0) && (
                    <tr>
                      <td colSpan={7} className="p-3 text-center text-[#8A919E] print:text-gray-600">
                        {t(
                          'لم يتم تقسيم مناطق معالجات مخصصة بعد — يمكنك إضافتها من قسم "مناطق المعالجات والمخارج" في القائمة الجانبية.',
                          'No custom processor zones defined yet — add them from the Processor Output Zones sidebar section.'
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Studio Square Notes Schedule */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#E6E9F0] print:text-black flex items-center gap-1.5">
              <Note weight="bold" className="w-4 h-4 text-[#38BDF8] print:text-black" />
              <span>
                {t(
                  '3. سجل ملاحظات المربعات الميدانية (Square Notes & Calibration Log)',
                  '3. Square Notes & Floor Blocking Log'
                )}
              </span>
            </h3>
            <div className="overflow-x-auto border border-[#343946] print:border-black">
              <table className={`w-full ${isEn ? 'text-left' : 'text-right'} border-collapse text-[11px]`}>
                <thead>
                  <tr className="bg-[#222630] text-[#D0D5DF] border-b border-[#343946] print:bg-gray-200 print:text-black print:border-black">
                    <th className={`p-2 ${cellBorder}`}>{t('الشاشة', 'Screen')}</th>
                    <th className={`p-2 ${cellBorder}`}>{t('المربع / النطاق', 'Cell / Scope')}</th>
                    <th className={`p-2 ${cellBorder}`}>{t('اللون المميز', 'Highlight Color')}</th>
                    <th className="p-2">{t('الملاحظة الهندسية / الميدانية', 'Engineering / Production Note')}</th>
                  </tr>
                </thead>
                <tbody>
                  {screenRows.flatMap(({ screen, activeNotes }) =>
                    activeNotes.map((note) => (
                      <tr
                        key={`${screen.id}-${note.id}`}
                        className="border-b border-[#2C303A] bg-[#1B1E26] print:bg-white print:border-black"
                      >
                        <td className={`p-2 font-bold ${rowCellBorder}`}>
                          {screen.name}
                        </td>
                        <td className={`p-2 font-mono font-bold text-[#FACC15] print:text-black ${rowCellBorder}`}>
                          {note.scope === 'single'
                            ? `[${note.targetCellKey || '—'}]`
                            : t('مجموعة لونية', 'Color Group')}
                        </td>
                        <td className={`p-2 font-mono ${rowCellBorder}`}>
                          {note.targetColor ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="w-3 h-3 inline-block border border-white/20"
                                style={{ backgroundColor: note.targetColor }}
                              />
                              <span>{note.targetColor}</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-2 text-[#E6E9F0] print:text-black">
                          {note.text}
                        </td>
                      </tr>
                    ))
                  )}
                  {screenRows.every((r) => r.activeNotes.length === 0) && (
                    <tr>
                      <td colSpan={4} className="p-3 text-center text-[#8A919E] print:text-gray-600">
                        {t('لا توجد ملاحظات مسجلة على مربعات الشبكة حالياً.', 'No grid square notes registered yet.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ShortcutsHudModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerFlash: () => void;
  onTogglePureMode: () => void;
  onToggleMultiStage: () => void;
  onToggleMinimap: () => void;
  onToggleLaser: () => void;
  onOpenPatchSheet: () => void;
  onExport1to1Png: () => void;
  lang?: UILanguage;
}

export const ShortcutsHudModal: React.FC<ShortcutsHudModalProps> = ({
  isOpen,
  onClose,
  onTriggerFlash,
  onTogglePureMode,
  onToggleMultiStage,
  onToggleMinimap,
  onToggleLaser,
  onOpenPatchSheet,
  onExport1to1Png,
  lang = 'ar',
}) => {
  if (!isOpen) return null;

  const isEn = lang === 'en';
  const t = (ar: string, en: string) => (isEn ? en : ar);

  const shortcutItems = [
    {
      key: 'F',
      label: t(
        'إطلاق الومضة السريعة (Quick Flash + طبقة الفلاش الصفراء)',
        'Trigger Quick Flash Identify Strobe'
      ),
      action: onTriggerFlash,
    },
    {
      key: 'P',
      label: t(
        'تبديل الوضع النقي الخالي من المشتتات (Pure Wall Mode)',
        'Toggle Distraction-Free Pure Wall Mode'
      ),
      action: onTogglePureMode,
    },
    {
      key: 'G',
      label: t(
        'فتح / إغلاق مسرح جمع الشاشات معاً (Multi-Screen Stage)',
        'Open / Close Multi-Screen Composite Stage'
      ),
      action: onToggleMultiStage,
    },
    {
      key: 'L',
      label: t(
        'تشغيل / إيقاف مؤشر الليزر الحي العابر للشاشات',
        'Toggle Live Cross-Screen Laser Pointer'
      ),
      action: onToggleLaser,
    },
    {
      key: 'M',
      label: t(
        'إظهار / إخفاء رادار الشاشة المصغر (Minimap Radar)',
        'Show / Hide Minimap Radar'
      ),
      action: onToggleMinimap,
    },
    {
      key: isEn ? 'Space + Drag' : 'Space + سحب',
      label: t(
        'تحريك لوحة العمل بحرية (Pan Canvas)',
        'Pan Canvas Freely'
      ),
      action: undefined,
    },
    {
      key: isEn ? 'Ctrl + Mouse Wheel' : 'Ctrl + عجلة الفأرة',
      label: t(
        'تكبير / تصغير دقيق نحو مؤشر الفأرة (Zoom to Cursor)',
        'Precision Zoom Toward Cursor'
      ),
      action: undefined,
    },
    {
      key: '0 / 1',
      label: t(
        'احتواء الشاشة بالكامل (Fit) / دقة حقيقية 1:1 (100%)',
        'Fit Screen in View (0) / True 1:1 Native Zoom (1)'
      ),
      action: undefined,
    },
    {
      key: '?',
      label: t(
        'فتح / إغلاق لوحة الاختصارات السريعة للمخرج (Shortcuts HUD)',
        'Open / Close Live Director Shortcuts HUD'
      ),
      action: onClose,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/75 flex items-center justify-center p-4"
      dir={isEn ? 'ltr' : 'rtl'}
      onClick={onClose}
    >
      <div
        className="bg-[#181A20] border border-[#3E4452] w-full max-w-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-[#20232B] border-b border-[#343946]">
          <div className="flex items-center gap-2">
            <Keyboard weight="bold" className="w-5 h-5 text-[#FACC15]" />
            <div>
              <h2 className="text-sm font-bold text-[#F3F5F8]">
                {t(
                  'لوحة اختصارات المخرج والتحكم الفوري (Live Director Shortcuts HUD)',
                  'Live Director Keyboard Shortcuts HUD'
                )}
              </h2>
              <p className="text-[11px] text-[#9AA1AE]">
                {t(
                  'تحكم فوري أثناء البث والمعايرة عبر لوحة المفاتيح أو الضغط المباشر',
                  'Instant keyboard or click triggers during broadcast and calibration'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-[#2A2E39] hover:bg-[#DC2626] text-[#E6E9F0] hover:text-white transition-colors cursor-pointer"
          >
            <X weight="bold" className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Quick Direct Action Triggers */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                onTriggerFlash();
                onClose();
              }}
              className="p-2.5 studio-btn-elevated border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkle weight="bold" className="w-4 h-4" />
              <span>{t('ومضة فلاش (F)', 'Quick Flash (F)')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onTogglePureMode();
                onClose();
              }}
              className="p-2.5 studio-btn-elevated border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Eye weight="bold" className="w-4 h-4" />
              <span>{t('الوضع النقي (P)', 'Pure Mode (P)')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleMultiStage();
                onClose();
              }}
              className="p-2.5 studio-btn border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <SquaresFour weight="bold" className="w-4 h-4" />
              <span>{t('جمع الشاشات (G)', 'Multi-Stage (G)')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleLaser();
                onClose();
              }}
              className="p-2.5 studio-btn border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Crosshair weight="bold" className="w-4 h-4" />
              <span>{t('الليزر الحي (L)', 'Live Laser (L)')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onExport1to1Png();
                onClose();
              }}
              className="p-2.5 studio-btn border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <DownloadSimple weight="bold" className="w-4 h-4" />
              <span>{t('تصدير 1:1 PNG', 'Export 1:1 PNG')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenPatchSheet();
                onClose();
              }}
              className="p-2.5 studio-btn-elevated border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileXls weight="bold" className="w-4 h-4" />
              <span>{t('بطاقة التسليم', 'Patch Sheet')}</span>
            </button>
          </div>

          {/* Keyboard Table */}
          <div className="border border-[#343946] divide-y divide-[#2C303A]">
            {shortcutItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between px-3 py-2 bg-[#1B1E26] hover:bg-[#222631]"
              >
                <span className="text-xs text-[#E6E9F0]">{item.label}</span>
                <div className="flex items-center gap-2">
                  {item.action && (
                    <button
                      type="button"
                      onClick={item.action}
                      className="px-2 py-0.5 text-[10px] font-bold studio-btn border cursor-pointer"
                    >
                      {t('تنفيذ', 'Run')}
                    </button>
                  )}
                  <kbd className="px-2 py-1 text-[11px] font-mono font-bold bg-[#111318] border border-[#3E4452] text-[#FACC15]">
                    {item.key}
                  </kbd>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface HelpAndAboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: UILanguage;
}

export const HelpAndAboutModal: React.FC<HelpAndAboutModalProps> = ({
  isOpen,
  onClose,
  lang = 'ar',
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen) return null;

  const isAr = lang === 'ar';
  const t = (ar: string, en: string) => (isAr ? ar : en);

  const handleCopy = (key: string, value: string) => {
    try {
      void navigator.clipboard.writeText(value);
      setCopiedField(key);
      window.setTimeout(() => {
        setCopiedField((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const GITHUB_URL = 'https://github.com/wittybrandcode/Studio-Grid-Director-Pro';
  const FACEBOOK_URL = 'https://www.facebook.com/most.toufik';
  const PHONE_NUMBER = '0561380844';

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/75 flex items-center justify-center p-4"
      dir={isAr ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <div
        className="bg-[#181A20] border border-[#3E4452] rounded-none w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#20232B] border-b border-[#343946]">
          <div className="flex items-center gap-2.5">
            <div
              dir="ltr"
              style={{
                color: '#8CC63F',
                WebkitTextStroke: '0.35px #8CC63F',
              }}
              className="px-2 py-1 bg-[#14171C] border border-[#8CC63F]/70 font-display text-xs font-black tracking-widest"
            >
              SGD
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F3F5F8]">
                Studio Grid Director Pro
              </h2>
              <p className="text-[11px] text-[#9AA1AE]">
                {t('حول التطبيق ومعلومات التواصل', 'About & Developer Contact')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-[#2A2E39] hover:bg-[#DC2626] text-[#E6E9F0] hover:text-white transition-colors cursor-pointer"
            title={t('إغلاق', 'Close')}
          >
            <X weight="bold" className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Simple Explanation */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#8CC63F]">
              {t('نبذة عن التطبيق', 'About the Application')}
            </h3>
            <p className="text-xs text-[#D0D5DF] leading-relaxed">
              {t(
                'أداة هندسية احترافية لمعايرة شاشات الـ LED العملاقة وإدارة شبكات البث التلفزيوني والمسرحي. تتيح إنشاء خرائط البكسل بدقة 1:1، حساب أحمال الطاقة والكابينات، تحديد المربعات والملاحظات، وبث الإشارة المباشرة عبر نوافذ العرض أو قنوات NDI.',
                'Professional engineering tool for calibrating LED video walls and broadcast grids. Supports 1:1 pixel mapping, cabinet & power calculation, cell annotations, and live output via native windows or NDI channels.'
              )}
            </p>
          </div>

          <div className="h-px bg-[#2C313D]" />

          {/* Developer Contact Info */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-[#F3F5F8]">
              {t('التواصل مع المطور', 'Developer Contact')}
            </h3>

            <div className="space-y-2">
              {/* GitHub */}
              <div className="flex items-center justify-between gap-2 bg-[#20242D] border border-[#323846] px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[10px] text-[#9AA1AE] mb-0.5">GitHub</div>
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="text-xs font-mono text-[#38BDF8] hover:underline truncate block"
                  >
                    github.com/wittybrandcode/Studio-Grid-Director-Pro
                  </a>
                </div>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 text-[11px] font-bold bg-[#2A303C] hover:bg-[#38BDF8] text-[#E6E9F0] hover:text-[#111317] transition-colors shrink-0 flex items-center gap-1"
                >
                  <ArrowSquareOut weight="bold" className="w-3.5 h-3.5" />
                  <span>{t('فتح', 'Open')}</span>
                </a>
              </div>

              {/* Facebook */}
              <div className="flex items-center justify-between gap-2 bg-[#20242D] border border-[#323846] px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[10px] text-[#9AA1AE] mb-0.5">Facebook</div>
                  <a
                    href={FACEBOOK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="text-xs font-mono text-[#60A5FA] hover:underline truncate block"
                  >
                    facebook.com/most.toufik
                  </a>
                </div>
                <a
                  href={FACEBOOK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 text-[11px] font-bold bg-[#2A303C] hover:bg-[#60A5FA] text-[#E6E9F0] hover:text-[#111317] transition-colors shrink-0 flex items-center gap-1"
                >
                  <ArrowSquareOut weight="bold" className="w-3.5 h-3.5" />
                  <span>{t('فتح', 'Open')}</span>
                </a>
              </div>

              {/* Phone */}
              <div className="flex items-center justify-between gap-2 bg-[#20242D] border border-[#323846] px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[10px] text-[#9AA1AE] mb-0.5">
                    {t('رقم الهاتف', 'Phone Number')}
                  </div>
                  <a
                    href={`tel:${PHONE_NUMBER}`}
                    dir="ltr"
                    className="text-sm font-mono font-bold text-[#4ADE80] tracking-wider block"
                  >
                    {PHONE_NUMBER}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy('phone', PHONE_NUMBER)}
                  className="px-2.5 py-1 text-[11px] font-bold bg-[#2A303C] hover:bg-[#4ADE80] text-[#E6E9F0] hover:text-[#111317] transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  {copiedField === 'phone' ? (
                    <>
                      <Check weight="bold" className="w-3.5 h-3.5" />
                      <span>{t('تم النسخ', 'Copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy weight="bold" className="w-3.5 h-3.5" />
                      <span>{t('نسخ', 'Copy')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

