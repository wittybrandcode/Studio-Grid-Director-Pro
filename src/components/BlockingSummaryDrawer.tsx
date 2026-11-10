import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Search,
  Trash2,
  Zap,
  Crosshair,
  ListChecks,
} from 'lucide-react';
import { ComputedCell, UILanguage } from '../types/studio';
import { ComputedGridResult } from '../utils/gridEngine';

interface BlockingSummaryDrawerProps {
  computed: ComputedGridResult;
  selectedKeys: Set<string>;
  blinkingKeys: Set<string>;
  lang: UILanguage;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectCell: (cellKey: string) => void;
  onBlinkCell: (cellKey: string) => void;
  onRemoveOverride: (cellKey: string) => void;
  onClearAllOverrides: () => void;
}

export const BlockingSummaryDrawer: React.FC<BlockingSummaryDrawerProps> = ({
  computed,
  selectedKeys,
  blinkingKeys,
  lang,
  isOpen,
  onToggleOpen,
  onSelectCell,
  onBlinkCell,
  onRemoveOverride,
  onClearAllOverrides,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const t = (ar: string, en: string) => {
    if (lang === 'ar') return ar;
    if (lang === 'en') return en;
    return `${ar} | ${en}`;
  };

  const overriddenCells = useMemo(() => {
    return computed.cells.filter((c) => {
      const ov = c.override;
      if (!ov) return false;
      return Boolean(
        ov.color ||
          (ov.label && ov.label.trim()) ||
          (ov.icon && ov.icon !== 'none') ||
          (ov.directorNote && ov.directorNote.trim())
      );
    });
  }, [computed.cells]);

  const filteredCells = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return overriddenCells;
    return overriddenCells.filter((c) => {
      const label = c.override?.label?.toLowerCase() || '';
      const note = c.override?.directorNote?.toLowerCase() || '';
      return (
        c.displayId.toLowerCase().includes(q) ||
        c.coordId.toLowerCase().includes(q) ||
        label.includes(q) ||
        note.includes(q)
      );
    });
  }, [overriddenCells, searchQuery]);

  return (
    <div className="bg-[#0F1522] border-t border-slate-800/90 shrink-0 select-none">
      {/* Drawer Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0B0F19]">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex items-center gap-2.5 text-xs font-bold text-slate-200 hover:text-amber-300 transition-colors cursor-pointer"
        >
          <ListChecks className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            {t(
              'جدول ملخص المواقع والملاحظات المخصصة',
              'Studio Blocking & Custom Squares Schedule'
            )}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-amber-400">
            {overriddenCells.length} {t('مربع مخصص', 'Annotated Squares')}
          </span>
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {isOpen && (
          <div className="flex items-center gap-3">
            {/* Search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={t('بحث برقم المربع أو الملاحظة...', 'Filter by ID or note...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#090D16] border border-slate-800 focus:border-amber-500 rounded-lg pr-8 pl-3 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none w-56"
              />
            </div>

            {overriddenCells.length > 0 && (
              <button
                type="button"
                onClick={onClearAllOverrides}
                className="text-[11px] text-slate-400 hover:text-red-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                {t('مسح كل التخصيصات', 'Reset All Overrides')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Collapsible Table Body */}
      {isOpen && (
        <div className="max-h-48 overflow-y-auto border-t border-slate-800/70">
          {filteredCells.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              {overriddenCells.length === 0
                ? t(
                    'لا توجد مربعات مخصصة حالياً. انقر على أي مربع في الشبكة لتعيين لون أو ملاحظة إخراج.',
                    'No custom studio blocking notes yet. Click any square on the grid to add labels or colors.'
                  )
                : t('لا توجد نتائج مطابقة للبحث.', 'No matching squares found.')}
            </div>
          ) : (
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-[#090D16] text-slate-400 sticky top-0 z-10 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-4 font-semibold">{t('المربع / ID', 'Square ID')}</th>
                  <th className="py-2 px-3 font-semibold">{t('اللون', 'Color')}</th>
                  <th className="py-2 px-3 font-semibold">
                    {t('التسمية على الشاشة', 'On-Screen Label')}
                  </th>
                  <th className="py-2 px-3 font-semibold">
                    {t('إحداثيات البكسل (X, Y, W×H)', 'Pixel Geometry')}
                  </th>
                  <th className="py-2 px-3 font-semibold">
                    {t('ملاحظة المخرج', 'Director Note')}
                  </th>
                  <th className="py-2 px-4 font-semibold text-left">
                    {t('إجراءات سريعة', 'Quick Actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredCells.map((cell: ComputedCell) => {
                  const isSelected = selectedKeys.has(cell.key);
                  const isBlinking = blinkingKeys.has(cell.key);
                  return (
                    <tr
                      key={cell.key}
                      onClick={() => onSelectCell(cell.key)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/15 text-white'
                          : 'hover:bg-slate-800/50 text-slate-200'
                      }`}
                    >
                      <td className="py-2 px-4 font-mono tabular-nums font-bold text-amber-300 whitespace-nowrap">
                        {cell.displayId}
                        {cell.displayId !== cell.coordId && (
                          <span className="text-slate-400 font-normal mr-1.5">
                            ({cell.coordId})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-sm border border-white/30 shrink-0"
                            style={{ backgroundColor: cell.effectiveColor }}
                          />
                          <span className="font-mono text-[11px] text-slate-300">
                            {cell.effectiveColor}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 font-semibold text-white whitespace-nowrap">
                        {cell.override?.label || <span className="text-slate-500">—</span>}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums text-[11px] text-slate-400 whitespace-nowrap">
                        X:{cell.x} Y:{cell.y} · {cell.width}×{cell.height}px
                      </td>
                      <td className="py-2 px-3 text-slate-300 max-w-xs truncate">
                        {cell.override?.directorNote || <span className="text-slate-500">—</span>}
                      </td>
                      <td
                        className="py-2 px-4 text-left whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectCell(cell.key)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 flex items-center gap-1 cursor-pointer"
                            title={t('تحديد المربع', 'Focus Square')}
                          >
                            <Crosshair className="w-3 h-3 text-sky-400" />
                            <span>{t('تحديد', 'Select')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onBlinkCell(cell.key)}
                            className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer ${
                              isBlinking
                                ? 'bg-red-600 text-white font-semibold'
                                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300'
                            }`}
                            title={t('وميض على الشاشة الحية', 'Blink on Live Wall')}
                          >
                            <Zap className="w-3 h-3" />
                            <span>{t('وميض', 'Flash')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveOverride(cell.key)}
                            className="p-1 rounded bg-slate-800 hover:bg-red-950/80 text-slate-400 hover:text-red-300 cursor-pointer"
                            title={t('حذف التخصيص', 'Remove Override')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
