import React from 'react';
import {
  AlertTriangle,
  Camera,
  CheckSquare,
  Eraser,
  Mic,
  Palette,
  RotateCcw,
  Sparkles,
  Square,
  Table,
  Tag,
  User,
  Zap,
  FileText,
  Columns,
  Rows,
} from 'lucide-react';
import {
  CellOverride,
  ComputedCell,
  RoleIconType,
  STUDIO_ROLE_SWATCHES,
  StudioRoleSwatch,
  UILanguage,
} from '../types/studio';
import { ComputedGridResult } from '../utils/gridEngine';

interface SquareInspectorSidebarProps {
  selectedKeys: Set<string>;
  computed: ComputedGridResult;
  lang: UILanguage;
  isBlinkingSelected: boolean;
  onSelectKeys: (keys: Set<string>) => void;
  onUpdateOverrides: (
    keys: string[],
    updater: (existing: CellOverride | undefined, key: string) => CellOverride | undefined
  ) => void;
  onTriggerBlink: (keys: string[]) => void;
}

export const SquareInspectorSidebar: React.FC<SquareInspectorSidebarProps> = ({
  selectedKeys,
  computed,
  lang,
  isBlinkingSelected,
  onSelectKeys,
  onUpdateOverrides,
  onTriggerBlink,
}) => {
  const t = (ar: string, en: string) => {
    if (lang === 'ar') return ar;
    if (lang === 'en') return en;
    return `${ar} | ${en}`;
  };

  const selectedCells: ComputedCell[] = [];
  selectedKeys.forEach((k) => {
    const c = computed.cellMap[k];
    if (c) selectedCells.push(c);
  });

  const primaryCell = selectedCells[0] || null;
  const targetKeys = selectedCells.map((c) => c.key);

  const handleColorChange = (color: string, rolePresetId?: string) => {
    if (targetKeys.length === 0) return;
    onUpdateOverrides(targetKeys, (existing, key) => ({
      cellKey: key,
      ...existing,
      color,
      rolePresetId: rolePresetId ?? existing?.rolePresetId,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleApplyFullRoleSwatch = (swatch: StudioRoleSwatch) => {
    if (targetKeys.length === 0) return;
    onUpdateOverrides(targetKeys, (existing, key) => ({
      cellKey: key,
      ...existing,
      color: swatch.color,
      label: existing?.label || `${swatch.defaultLabelAr} / ${swatch.defaultLabelEn}`,
      icon: swatch.icon,
      rolePresetId: swatch.id,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleResetDefaultColor = () => {
    if (targetKeys.length === 0) return;
    onUpdateOverrides(targetKeys, (existing) => {
      if (!existing) return undefined;
      const next: CellOverride = { ...existing };
      delete next.color;
      delete next.rolePresetId;
      if (!next.label && (!next.icon || next.icon === 'none') && !next.directorNote) {
        return undefined;
      }
      return next;
    });
  };

  const handleLabelChange = (label: string) => {
    if (targetKeys.length === 0) return;
    onUpdateOverrides(targetKeys, (existing, key) => ({
      cellKey: key,
      ...existing,
      label,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleIconChange = (icon: RoleIconType) => {
    if (targetKeys.length === 0) return;
    onUpdateOverrides(targetKeys, (existing, key) => ({
      cellKey: key,
      ...existing,
      icon,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleDirectorNoteChange = (directorNote: string) => {
    if (targetKeys.length === 0) return;
    onUpdateOverrides(targetKeys, (existing, key) => ({
      cellKey: key,
      ...existing,
      directorNote,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleClearAllOverrides = () => {
    if (targetKeys.length === 0) return;
    onUpdateOverrides(targetKeys, () => undefined);
  };

  const selectEntireRow = () => {
    if (!primaryCell) return;
    const targetRows = new Set(selectedCells.map((c) => c.row));
    const next = new Set<string>(selectedKeys);
    computed.cells.forEach((cell) => {
      if (targetRows.has(cell.row)) next.add(cell.key);
    });
    onSelectKeys(next);
  };

  const selectEntireColumn = () => {
    if (!primaryCell) return;
    const targetCols = new Set(selectedCells.map((c) => c.col));
    const next = new Set<string>(selectedKeys);
    computed.cells.forEach((cell) => {
      if (targetCols.has(cell.col)) next.add(cell.key);
    });
    onSelectKeys(next);
  };

  const currentColor = primaryCell?.override?.color || primaryCell?.effectiveColor || '#DC2626';
  const currentLabel = primaryCell?.override?.label || '';
  const currentIcon: RoleIconType = primaryCell?.override?.icon || 'none';
  const currentNote = primaryCell?.override?.directorNote || '';

  return (
    <aside className="w-80 xl:w-92 shrink-0 bg-[#0F1522] border-r border-slate-800/90 flex flex-col h-full overflow-y-auto select-none">
      {/* Header: Selected Square Status */}
      <div className="p-4 border-b border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-wide text-slate-200 flex items-center gap-2">
            <CheckSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{t('لوحة خصائص المربعات المحددة', 'Square Inspector')}</span>
          </h2>
          {selectedCells.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectKeys(new Set())}
              className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              {t('إلغاء التحديد', 'Deselect')}
            </button>
          )}
        </div>

        {selectedCells.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#090D16] border border-slate-800/90 text-center space-y-2">
            <Square className="w-6 h-6 text-slate-500 mx-auto" />
            <p className="text-xs font-medium text-slate-300">
              {t(
                'انقر على أي مربع في الشاشة لتحديده وتخصيص لونه أو كتابة ملاحظات الإخراج عليه',
                'Click any square on the canvas to inspect, colorize, or add studio blocking notes'
              )}
            </p>
            <p className="text-[11px] text-slate-500">
              {t(
                'نصيحة: اضغط مع الاستمرار على Shift أو فعّل وضع التحديد المتعدد لتحديد عدة مربعات معاً (مثل طاولة الحوار C4, C5, C6).',
                'Tip: Hold Shift or enable Multi-Select Mode to drag across multiple squares at once.'
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Selected IDs Summary Box */}
            <div className="p-3 rounded-xl bg-[#090D16] border border-amber-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded border border-white/40 shrink-0"
                    style={{ backgroundColor: primaryCell.effectiveColor }}
                  />
                  <span className="text-sm font-bold font-mono tabular-nums text-amber-300">
                    {selectedCells.length === 1
                      ? `${primaryCell.displayId} (${primaryCell.coordId})`
                      : `${selectedCells.length} ${t('مربعات محددة', 'Squares Selected')}`}
                  </span>
                </div>
                {primaryCell && (
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {primaryCell.width}×{primaryCell.height}px
                  </span>
                )}
              </div>

              {selectedCells.length > 1 ? (
                <div className="text-[11px] font-mono text-slate-300 truncate">
                  {selectedCells
                    .slice(0, 10)
                    .map((c) => c.displayId)
                    .join(', ')}
                  {selectedCells.length > 10 ? ` +${selectedCells.length - 10}` : ''}
                </div>
              ) : (
                <div className="text-[11px] font-mono tabular-nums text-slate-400 flex items-center justify-between">
                  <span>
                    X: {primaryCell.x}px, Y: {primaryCell.y}px
                  </span>
                  <span>
                    Row {primaryCell.row + 1} · Col {primaryCell.col + 1}
                  </span>
                </div>
              )}

              {/* Row / Col expansion buttons */}
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={selectEntireRow}
                  className="flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-[11px] text-slate-200 transition-colors cursor-pointer"
                >
                  <Rows className="w-3 h-3 text-amber-400" />
                  <span>{t('تحديد الصف كاملاً', 'Select Full Row')}</span>
                </button>
                <button
                  type="button"
                  onClick={selectEntireColumn}
                  className="flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-[11px] text-slate-200 transition-colors cursor-pointer"
                >
                  <Columns className="w-3 h-3 text-amber-400" />
                  <span>{t('تحديد العمود كاملاً', 'Select Full Col')}</span>
                </button>
              </div>
            </div>

            {/* Highlight / Blink Square on Live Wall Button */}
            <button
              type="button"
              onClick={() => onTriggerBlink(targetKeys)}
              className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                isBlinkingSelected
                  ? 'bg-red-600 hover:bg-red-500 text-white border-yellow-300 shadow-lg shadow-red-600/30'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400'
              }`}
            >
              <Zap className="w-4 h-4 shrink-0" />
              <span>
                {isBlinkingSelected
                  ? t('إيقاف الوميض التنبيهي الحي', 'Stop Live Strobe Alert')
                  : t('وميض تنبيهي على الشاشة الحية | Flash on Wall', 'Flash Square on Live Wall')}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Inspector Controls (enabled when at least 1 square is selected) */}
      <div
        className={`flex-1 flex flex-col divide-y divide-slate-800/80 ${
          selectedCells.length === 0 ? 'opacity-45 pointer-events-none' : ''
        }`}
      >
        {/* 1. Studio Role Quick Swatches & Custom Color Override */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{t('تخصيص لون المربع ودور الاستوديو', 'Custom Square Color & Role')}</span>
            </h3>
            <button
              type="button"
              onClick={handleResetDefaultColor}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
              title={t('استعادة اللون الافتراضي', 'Reset to Default Grid Color')}
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('اللون الافتراضي', 'Reset Color')}</span>
            </button>
          </div>

          {/* Studio Role Swatches Grid */}
          <div className="space-y-1.5">
            <span className="block text-[11px] text-slate-400">
              {t(
                'أدوار الاستوديو السريعة (تلوين + أيقونة + تسمية):',
                'Quick Studio Blocking Roles:'
              )}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {STUDIO_ROLE_SWATCHES.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  onClick={() => handleApplyFullRoleSwatch(swatch)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#090D16] hover:bg-slate-900 border border-slate-800 hover:border-slate-600 text-right transition-colors cursor-pointer group"
                >
                  <span
                    className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/30"
                    style={{ backgroundColor: swatch.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-slate-200 truncate group-hover:text-white">
                      {swatch.nameAr}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{swatch.nameEn}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Color Picker + Color-Only Swatches */}
          <div className="pt-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">
                {t('درجة لون مخصصة (فقط):', 'Custom Color Override:')}
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="w-7 h-7 rounded bg-transparent border border-slate-700 cursor-pointer"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={currentColor}
                  onChange={(e) => {
                    const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) {
                      handleColorChange(v);
                    }
                  }}
                  className="w-20 bg-[#090D16] border border-slate-700 rounded px-2 py-1 text-xs font-mono uppercase text-center text-slate-200 outline-none"
                />
              </div>
            </div>

            {/* Color-Only Quick Bar */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                '#DC2626',
                '#2563EB',
                '#059669',
                '#D97706',
                '#7C3AED',
                '#0891B2',
                '#DB2777',
                '#65A30D',
                '#E11D48',
                '#F8FAFC',
              ].map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => handleColorChange(hex)}
                  style={{ backgroundColor: hex }}
                  className={`w-5 h-5 rounded border transition-transform hover:scale-110 cursor-pointer ${
                    currentColor.toUpperCase() === hex
                      ? 'border-white ring-2 ring-amber-400'
                      : 'border-white/25'
                  }`}
                  title={hex}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 2. On-Screen Label / Note */}
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{t('ملاحظة تظهر داخل المربع على الشاشة', 'On-Screen Square Label')}</span>
            </h3>
            {currentLabel && (
              <button
                type="button"
                onClick={() => handleLabelChange('')}
                className="text-[11px] text-slate-400 hover:text-red-400 cursor-pointer"
              >
                {t('مسح النص', 'Clear')}
              </button>
            )}
          </div>

          <input
            type="text"
            placeholder={t(
              'مثال: موقع الصحفي / الطاولة / كاميرا 1...',
              'e.g. Anchor Stand / Studio Desk / Camera 1...'
            )}
            value={currentLabel}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="w-full bg-[#090D16] border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 outline-none"
          />

          {/* Quick Label Chips */}
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {[
              'الصحفي / Anchor',
              'الضيف / Guest',
              'الطاولة / Desk',
              'كاميرا 1 / CAM 1',
              'كاميرا 2 / CAM 2',
              'كرين / Jib Arm',
              'حدود الكادر / Safe Edge',
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleLabelChange(chip)}
                className="px-2 py-1 rounded bg-[#090D16] hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 transition-colors cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Role Icon Badge Selector */}
        <div className="p-4 space-y-2.5">
          <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{t('رمز الإشارة داخل المربع (Role Icon)', 'On-Square Role Icon Badge')}</span>
          </h3>

          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'none' as const, ar: 'بدون رمز', en: 'None', Icon: Square },
              { id: 'presenter' as const, ar: 'مذيع / ضيف', en: 'Person', Icon: User },
              { id: 'desk' as const, ar: 'طاولة', en: 'Desk', Icon: Table },
              { id: 'camera' as const, ar: 'كاميرا', en: 'Camera', Icon: Camera },
              { id: 'mic' as const, ar: 'ميكروفون', en: 'Mic', Icon: Mic },
              { id: 'warning' as const, ar: 'حدود / تنبيه', en: 'Boundary', Icon: AlertTriangle },
            ].map(({ id, ar, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleIconChange(id)}
                className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                  currentIcon === id
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                    : 'bg-[#090D16] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{ar}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. Director Private Production Note */}
        <div className="p-4 space-y-2">
          <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{t('ملاحظات المخرج التفصيلية (في الجدول)', 'Director Production Note')}</span>
          </h3>
          <textarea
            rows={3}
            placeholder={t(
              'تفاصيل إضافية لطاقم الإضاءة أو الكاميرات (مثل البعد البؤري للعدسة، زاوية الإضاءة، حركة الضيف)...',
              'Detailed blocking instructions for camera, lighting, or floor manager...'
            )}
            value={currentNote}
            onChange={(e) => handleDirectorNoteChange(e.target.value)}
            className="w-full bg-[#090D16] border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none resize-none"
          />

          <button
            type="button"
            onClick={handleClearAllOverrides}
            className="w-full mt-2 py-2 px-3 rounded-lg bg-slate-900 hover:bg-red-950/50 border border-slate-800 hover:border-red-800/70 text-xs text-slate-300 hover:text-red-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>
              {t(
                'مسح جميع التخصيصات للمربع المحدد',
                'Clear All Overrides on Selected Square(s)'
              )}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
};
