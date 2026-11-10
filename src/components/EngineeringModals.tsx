import React from 'react';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Package,
  Keyboard,
  X,
  Zap,
  Cable,
  Cpu,
  Monitor,
  StickyNote,
  AlertTriangle,
  CheckCircle2,
  Eye,
  LayoutGrid,
  Crosshair,
  Sparkles,
} from 'lucide-react';
import { StudioProject, StudioNoteItem } from '../types/studio';
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
}

export const TechnicalPatchSheetModal: React.FC<TechnicalPatchSheetModalProps> = ({
  isOpen,
  onClose,
  screens,
  activeScreen,
}) => {
  if (!isOpen) return null;

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
      dir="rtl"
    >
      <div className="bg-[#181A20] border border-[#3E4452] w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl print:max-h-none print:border-black print:bg-white print:text-black">
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#20232B] border-b border-[#343946] print:bg-gray-100 print:border-black">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[#FACC15] print:text-black" />
            <div>
              <h2 className="text-sm font-bold text-[#F3F5F8] print:text-black">
                بطاقة التسليم والتوثيق الهندسي للشاشات (LED Engineering & Patch Sheet)
              </h2>
              <p className="text-[11px] text-[#9AA1AE] print:text-gray-700">
                جدول أبعاد الشاشات بالمتر، أحمال الكهرباء (kW / Amps)، منافذ الشبكة (650K px)، ومخارج المعالجات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => exportScreenNativePixelMapPng(activeScreen)}
              className="px-3 py-1.5 text-[11px] font-bold bg-[#C8CDD8] text-[#111317] flex items-center gap-1.5"
              title="تصدير خريطة الشاشة النشطة بدقة البكسل الحقيقية 1:1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خريطة 1:1 ({activeScreen.name})</span>
            </button>
            <button
              onClick={() => exportAllScreensPixelMapPack(screens)}
              className="px-3 py-1.5 text-[11px] font-bold bg-[#B4BAC6] text-[#111317] flex items-center gap-1.5"
              title="تصدير جميع الشاشات بدقة 1:1 مع الخريطة المجمعة"
            >
              <Package className="w-3.5 h-3.5" />
              <span>تصدير حزمة كل الشاشات ({screens.length})</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-[11px] font-bold bg-[#FEF08A] text-[#111317] flex items-center gap-1.5"
              title="طباعة أو حفظ البطاقة الهندسية كملف PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 bg-[#2A2E39] hover:bg-[#DC2626] text-[#E6E9F0] hover:text-white transition-colors"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-5 text-xs print:overflow-visible">
          {/* Summary KPI Bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            <div className="bg-[#20232B] border border-[#343946] p-3 print:bg-gray-50 print:border-gray-400">
              <div className="text-[10px] text-[#9AA1AE] print:text-gray-600 flex items-center gap-1">
                <Monitor className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>إجمالي الشاشات والبكسلات</span>
              </div>
              <div className="text-sm font-mono font-bold text-[#F3F5F8] print:text-black mt-1">
                {screens.length} شاشات | {(totalWorkspacePixels / 1_000_000).toFixed(2)} MP
              </div>
              <div className="text-[10px] font-mono text-[#8A919E] print:text-gray-600">
                {totalWorkspacePixels.toLocaleString()} px
              </div>
            </div>

            <div className="bg-[#20232B] border border-[#343946] p-3 print:bg-gray-50 print:border-gray-400">
              <div className="text-[10px] text-[#9AA1AE] print:text-gray-600 flex items-center gap-1">
                <LayoutGrid className="w-3.5 h-3.5 text-[#FACC15]" />
                <span>إجمالي الكابينات (Cabinets)</span>
              </div>
              <div className="text-sm font-mono font-bold text-[#FACC15] print:text-black mt-1">
                {totalCabinetsAll} كابينة
              </div>
              <div className="text-[10px] font-mono text-[#8A919E] print:text-gray-600">
                شاملة جميع الشاشات
              </div>
            </div>

            <div className="bg-[#20232B] border border-[#343946] p-3 print:bg-gray-50 print:border-gray-400">
              <div className="text-[10px] text-[#9AA1AE] print:text-gray-600 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>القدرة الكهربائية القصوى / المتوسطة</span>
              </div>
              <div className="text-sm font-mono font-bold text-[#F3F5F8] print:text-black mt-1">
                {totalMaxKwAll.toFixed(2)} kW Max
              </div>
              <div className="text-[10px] font-mono text-[#8A919E] print:text-gray-600">
                متوسط التشغيل: {totalAvgKwAll.toFixed(2)} kW
              </div>
            </div>

            <div className="bg-[#20232B] border border-[#343946] p-3 print:bg-gray-50 print:border-gray-400">
              <div className="text-[10px] text-[#9AA1AE] print:text-gray-600 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-[#EF4444]" />
                <span>إجمالي سحب التيار (Amps)</span>
              </div>
              <div className="text-sm font-mono font-bold text-[#F87171] print:text-black mt-1">
                {totalMaxAmpsAll.toFixed(1)} A
              </div>
              <div className="text-[10px] font-mono text-[#8A919E] print:text-gray-600">
                عند ذروة الإضاءة البيضاء 100%
              </div>
            </div>

            <div className="bg-[#20232B] border border-[#343946] p-3 print:bg-gray-50 print:border-gray-400">
              <div className="text-[10px] text-[#9AA1AE] print:text-gray-600 flex items-center gap-1">
                <Cable className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>منافذ الداتا المطلوبة (650K/Port)</span>
              </div>
              <div className="text-sm font-mono font-bold text-[#4ADE80] print:text-black mt-1">
                {totalPortsAll} Ports (RJ45)
              </div>
              <div className="text-[10px] font-mono text-[#8A919E] print:text-gray-600">
                بمعيار 650,000 بكسل لكل منفذ
              </div>
            </div>
          </div>

          {/* 1. Master Screens Engineering Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#E6E9F0] print:text-black flex items-center gap-1.5">
              <Monitor className="w-4 h-4 text-[#38BDF8] print:text-black" />
              <span>1. جدول المواصفات الهندسية للشاشات (Screens Master Schedule)</span>
            </h3>
            <div className="overflow-x-auto border border-[#343946] print:border-black">
              <table className="w-full text-right border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#222630] text-[#D0D5DF] border-b border-[#343946] print:bg-gray-200 print:text-black print:border-black">
                    <th className="p-2 border-l border-[#343946] print:border-black">#</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">اسم الشاشة</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">الدقة (px)</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">الشبكة (عمود×صف)</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">Pitch</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">الأبعاد بالمتر (م)</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">الكابينات</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">الحمل الكهربائي</th>
                    <th className="p-2">منافذ الشبكة ومسار الداتا</th>
                  </tr>
                </thead>
                <tbody>
                  {screenRows.map(({ index, screen, grid, phys }) => (
                    <tr
                      key={screen.id}
                      className="border-b border-[#2C303A] bg-[#1B1E26] hover:bg-[#232732] print:bg-white print:border-black"
                    >
                      <td className="p-2 font-mono font-bold border-l border-[#2C303A] print:border-black">
                        #{index}
                      </td>
                      <td className="p-2 font-bold text-[#F3F5F8] print:text-black border-l border-[#2C303A] print:border-black">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 inline-block shrink-0"
                            style={{ backgroundColor: screen.selectionColor || '#38BDF8' }}
                          />
                          <span>{screen.name}</span>
                        </div>
                      </td>
                      <td className="p-2 font-mono border-l border-[#2C303A] print:border-black">
                        {screen.compWidth}×{screen.compHeight}
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600">
                          {(phys.totalPixels / 1_000_000).toFixed(2)} MP
                        </span>
                      </td>
                      <td className="p-2 font-mono border-l border-[#2C303A] print:border-black">
                        {grid.cols}×{grid.rows}
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600">
                          ({grid.baseCellWidth}×{grid.baseCellHeight}px)
                        </span>
                      </td>
                      <td className="p-2 font-mono border-l border-[#2C303A] print:border-black">
                        P{phys.pixelPitchMm}
                      </td>
                      <td className="p-2 font-mono font-bold text-[#38BDF8] print:text-black border-l border-[#2C303A] print:border-black">
                        {phys.widthMeters}m × {phys.heightMeters}m
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600 font-normal">
                          المساحة: {phys.areaSqMeters} m² | القطر: {phys.diagonalMeters}m
                        </span>
                      </td>
                      <td className="p-2 font-mono border-l border-[#2C303A] print:border-black">
                        {phys.cabinetsCols}×{phys.cabinetsRows} = <b>{phys.totalCabinets}</b>
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600">
                          ({phys.cabinetWidthCm}×{phys.cabinetHeightCm}cm)
                        </span>
                      </td>
                      <td className="p-2 font-mono border-l border-[#2C303A] print:border-black">
                        <span className="font-bold text-[#FACC15] print:text-black">
                          {phys.maxKw} kW
                        </span>{' '}
                        ({phys.maxAmps}A @ {phys.supplyVoltage}V)
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600">
                          متوسط: {phys.avgKw} kW ({phys.avgAmps}A)
                        </span>
                      </td>
                      <td className="p-2 font-mono">
                        <span className="font-bold text-[#4ADE80] print:text-black">
                          {phys.ethernetPortsRequired} Ports
                        </span>{' '}
                        (حتى {phys.maxCabinetsPerPort} كابينة/منفذ)
                        <span className="block text-[10px] text-[#8A919E] print:text-gray-600">
                          المسار: {screen.cabinetConfig?.cablingPattern || 'snake_h_tl'}
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
              <Cpu className="w-4 h-4 text-[#FACC15] print:text-black" />
              <span>2. جدول مخارج المعالجات وتوزيع المنافذ (Processor Output Zones & Port Load)</span>
            </h3>
            <div className="overflow-x-auto border border-[#343946] print:border-black">
              <table className="w-full text-right border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#222630] text-[#D0D5DF] border-b border-[#343946] print:bg-gray-200 print:text-black print:border-black">
                    <th className="p-2 border-l border-[#343946] print:border-black">الشاشة</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">المنفذ / المنطقة (Zone)</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">إحداثيات البداية (X, Y)</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">الأبعاد (W × H)</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">إجمالي البكسلات</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">نسبة تحميل منفذ 650K</th>
                    <th className="p-2">الحالة الهندسية</th>
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
                          <td className="p-2 font-bold border-l border-[#2C303A] print:border-black">
                            {screen.name}
                          </td>
                          <td className="p-2 font-mono font-bold border-l border-[#2C303A] print:border-black">
                            <span
                              className="inline-block w-2.5 h-2.5 ml-1.5"
                              style={{ backgroundColor: z.color }}
                            />
                            {z.portLabel} — {z.name}
                          </td>
                          <td className="p-2 font-mono border-l border-[#2C303A] print:border-black">
                            X:{z.x}, Y:{z.y}
                          </td>
                          <td className="p-2 font-mono border-l border-[#2C303A] print:border-black">
                            {z.width} × {z.height} px
                          </td>
                          <td className="p-2 font-mono border-l border-[#2C303A] print:border-black">
                            {px.toLocaleString()} px ({Math.round(px / 1000)}K)
                          </td>
                          <td className="p-2 font-mono border-l border-[#2C303A] print:border-black">
                            <span className={overloaded ? 'text-[#F87171] font-bold' : 'text-[#4ADE80]'}>
                              {pct}%
                            </span>
                          </td>
                          <td className="p-2">
                            {overloaded ? (
                              <span className="inline-flex items-center gap-1 text-[#F87171] font-bold">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                يتجاوز سعة منفذ 650K (يتطلب {Math.ceil(px / 650000)} منافذ)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[#4ADE80]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                ضمن سعة منفذ كابل واحد (≤650K)
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
                        لم يتم تقسيم مناطق معالجات مخصصة بعد — يمكنك إضافتها من قسم &quot;مناطق المعالجات والمخارج&quot; في القائمة الجانبية.
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
              <StickyNote className="w-4 h-4 text-[#38BDF8] print:text-black" />
              <span>3. سجل ملاحظات المربعات الميدانية (Square Notes & Calibration Log)</span>
            </h3>
            <div className="overflow-x-auto border border-[#343946] print:border-black">
              <table className="w-full text-right border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#222630] text-[#D0D5DF] border-b border-[#343946] print:bg-gray-200 print:text-black print:border-black">
                    <th className="p-2 border-l border-[#343946] print:border-black">الشاشة</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">المربع / النطاق</th>
                    <th className="p-2 border-l border-[#343946] print:border-black">اللون المميز</th>
                    <th className="p-2">الملاحظة الهندسية / الميدانية</th>
                  </tr>
                </thead>
                <tbody>
                  {screenRows.flatMap(({ screen, activeNotes }) =>
                    activeNotes.map((note) => (
                      <tr
                        key={`${screen.id}-${note.id}`}
                        className="border-b border-[#2C303A] bg-[#1B1E26] print:bg-white print:border-black"
                      >
                        <td className="p-2 font-bold border-l border-[#2C303A] print:border-black">
                          {screen.name}
                        </td>
                        <td className="p-2 font-mono font-bold text-[#FACC15] print:text-black border-l border-[#2C303A] print:border-black">
                          {note.scope === 'single' ? `[${note.targetCellKey || '—'}]` : 'مجموعة لونية'}
                        </td>
                        <td className="p-2 font-mono border-l border-[#2C303A] print:border-black">
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
                        لا توجد ملاحظات مسجلة على مربعات الشبكة حالياً.
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
}) => {
  if (!isOpen) return null;

  const shortcutItems = [
    {
      key: 'F',
      label: 'إطلاق الومضة السريعة (Quick Flash + طبقة الفلاش الصفراء)',
      action: onTriggerFlash,
    },
    {
      key: 'P',
      label: 'تبديل الوضع النقي الخالي من المشتتات (Pure Wall Mode)',
      action: onTogglePureMode,
    },
    {
      key: 'G',
      label: 'فتح / إغلاق مسرح جمع الشاشات معاً (Multi-Screen Stage)',
      action: onToggleMultiStage,
    },
    {
      key: 'L',
      label: 'تشغيل / إيقاف مؤشر الليزر الحي العابر للشاشات',
      action: onToggleLaser,
    },
    {
      key: 'M',
      label: 'إظهار / إخفاء رادار الشاشة المصغر (Minimap Radar)',
      action: onToggleMinimap,
    },
    {
      key: 'Space + سحب',
      label: 'تحريك لوحة العمل بحرية (Pan Canvas)',
      action: undefined,
    },
    {
      key: 'Ctrl + عجلة الفأرة',
      label: 'تكبير / تصغير دقيق نحو مؤشر الفأرة (Zoom to Cursor)',
      action: undefined,
    },
    {
      key: '0 / 1',
      label: 'احتواء الشاشة بالكامل (Fit) / دقة حقيقية 1:1 (100%)',
      action: undefined,
    },
    {
      key: '?',
      label: 'فتح / إغلاق لوحة الاختصارات السريعة للمخرج (Shortcuts HUD)',
      action: onClose,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/75 flex items-center justify-center p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-[#181A20] border border-[#3E4452] w-full max-w-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-[#20232B] border-b border-[#343946]">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-[#FACC15]" />
            <div>
              <h2 className="text-sm font-bold text-[#F3F5F8]">
                لوحة اختصارات المخرج والتحكم الفوري (Live Director Shortcuts HUD)
              </h2>
              <p className="text-[11px] text-[#9AA1AE]">
                تحكم فوري أثناء البث والمعايرة عبر لوحة المفاتيح أو الضغط المباشر
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-[#2A2E39] hover:bg-[#DC2626] text-[#E6E9F0] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Quick Direct Action Triggers */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              onClick={() => {
                onTriggerFlash();
                onClose();
              }}
              className="p-2.5 bg-[#FEF08A] text-[#111317] font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>ومضة فلاش (F)</span>
            </button>
            <button
              onClick={() => {
                onTogglePureMode();
                onClose();
              }}
              className="p-2.5 bg-[#C8CDD8] text-[#111317] font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <Eye className="w-4 h-4" />
              <span>الوضع النقي (P)</span>
            </button>
            <button
              onClick={() => {
                onToggleMultiStage();
                onClose();
              }}
              className="p-2.5 bg-[#B4BAC6] text-[#111317] font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>جمع الشاشات (G)</span>
            </button>
            <button
              onClick={() => {
                onToggleLaser();
                onClose();
              }}
              className="p-2.5 bg-[#9FA6B3] text-[#111317] font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <Crosshair className="w-4 h-4" />
              <span>الليزر الحي (L)</span>
            </button>
            <button
              onClick={() => {
                onExport1to1Png();
                onClose();
              }}
              className="p-2.5 bg-[#C4C9D4] text-[#111317] font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>تصدير 1:1 PNG</span>
            </button>
            <button
              onClick={() => {
                onOpenPatchSheet();
                onClose();
              }}
              className="p-2.5 bg-[#D4D9E2] text-[#111317] font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>بطاقة التسليم</span>
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
                      onClick={item.action}
                      className="px-2 py-0.5 text-[10px] font-bold bg-[#9FA6B3] text-[#111317]"
                    >
                      تنفيذ
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
