import React, { useState } from 'react';
import {
  Check,
  ClockCounterClockwise,
  FileArrowDown,
  FileArrowUp,
  FileCode,
  FloppyDisk,
  FolderOpen,
  Folders,
  GitMerge,
  Package,
  Stack,
  Trash,
  X,
} from '@phosphor-icons/react';
import {
  PRESET_PROJECT_TEMPLATES,
  SavedWorkspaceProject,
  StudioProject,
  UILanguage,
} from '../types/studio';
import { ParsedSgdImportResult } from '../utils/sgdArchive';

interface SavedProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
  onWorkspaceNameChange: (name: string) => void;
  currentScreens: StudioProject[];
  savedWorkspaces: SavedWorkspaceProject[];
  lang: UILanguage;
  onSaveWorkspace: (customName?: string) => void;
  onOverwriteWorkspace: (workspaceId: string) => void;
  onLoadWorkspace: (ws: SavedWorkspaceProject) => void;
  onDeleteWorkspace: (id: string) => void;
  onExportWorkspaceJson: (ws?: SavedWorkspaceProject) => void;
  onExportCurrentScreenJson: () => void;
  onImportJsonClick: () => void;
  onImportJsonText: (rawJson: string) => boolean;
  onLoadSingleTemplate: (proj: StudioProject) => void;
}

export const SavedProjectsModal: React.FC<SavedProjectsModalProps> = ({
  isOpen,
  onClose,
  workspaceName,
  onWorkspaceNameChange,
  currentScreens,
  savedWorkspaces,
  lang,
  onSaveWorkspace,
  onOverwriteWorkspace,
  onLoadWorkspace,
  onDeleteWorkspace,
  onExportWorkspaceJson,
  onExportCurrentScreenJson,
  onImportJsonClick,
  onImportJsonText,
  onLoadSingleTemplate,
}) => {
  const [activeTab, setActiveTab] = useState<'saved' | 'import_export' | 'templates'>('saved');
  const [pastedJson, setPastedJson] = useState('');
  const [pasteStatus, setPasteStatus] = useState<'idle' | 'success' | 'error'>('idle');

  if (!isOpen) return null;

  const t = (ar: string, en: string) => (lang === 'en' ? en : ar);

  const handlePasteImport = () => {
    if (!pastedJson.trim()) return;
    const ok = onImportJsonText(pastedJson);
    if (ok) {
      setPasteStatus('success');
      setPastedJson('');
      setTimeout(() => {
        setPasteStatus('idle');
        onClose();
      }, 600);
    } else {
      setPasteStatus('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        dir={lang === 'en' ? 'ltr' : 'rtl'}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#2A2D34] border border-[#434853] rounded-none shadow-2xl flex flex-col max-h-[88vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#32363F] border-b border-[#434853]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#B4BAC6] text-[#1C1E22] border border-[#3A3E47] rounded-none">
              <Folders weight="bold" className="w-4 h-4 text-[#1C1E22]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#DCE0E8]">
                {t('إدارة المشاريع وحزم (.sgd)', 'Project & .sgd Bundle Manager')}
              </h2>
              <p className="text-[11px] text-[#AEB5C2]">
                {t(
                  'حفظ وتصدير المشروع كحزمة مضغوطة (.sgd) تضم كافة الشاشات والصور المرفوعة والمكونات',
                  'Save & export compressed .sgd containers with all screens, images, and guides'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 studio-btn border rounded-none cursor-pointer"
          >
            <X weight="bold" className="w-4 h-4" />
          </button>
        </div>

        {/* Active Project Save Bar */}
        <div className="p-3.5 bg-[#202328] border-b border-[#434853] space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#C8CED8]">
              {t('اسم المشروع الحالي:', 'Current Workspace Name:')}
            </span>
            <span className="text-[11px] text-[#AEB5C2]">
              {t(`عدد الشاشات: ${currentScreens.length}`, `Screens: ${currentScreens.length}`)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => onWorkspaceNameChange(e.target.value)}
              placeholder={t('اسم المشروع...', 'Project Name...')}
              className="flex-1 bg-[#2A2D34] border border-[#434853] focus:border-[#B8BEC9] rounded-none px-3 py-1.5 text-xs font-bold text-[#DCE0E8] outline-none"
            />
            <button
              type="button"
              onClick={() => onSaveWorkspace(workspaceName)}
              className="px-3.5 py-1.5 studio-btn-elevated border rounded-none text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <FloppyDisk weight="bold" className="w-3.5 h-3.5" />
              <span>{t('حفظ المشروع الآن', 'Save Project Now')}</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 border-b border-[#434853] bg-[#242830]">
          {[
            {
              id: 'saved' as const,
              label: `${t('المشاريع المحفوظة', 'Saved Projects')} (${savedWorkspaces.length})`,
              Icon: ClockCounterClockwise,
            },
            {
              id: 'import_export' as const,
              label: t('حزمة المشروع (.sgd)', 'Project Bundle (.sgd)'),
              Icon: FileCode,
            },
            {
              id: 'templates' as const,
              label: t('قوالب جاهزة', 'Preset Templates'),
              Icon: Stack,
            },
          ].map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`py-2.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 rounded-none cursor-pointer transition-colors ${
                  active
                    ? 'studio-btn-elevated border-[#FACC15]'
                    : 'bg-[#2A2D34] hover:bg-[#32363F] text-[#DCE0E8] border-transparent'
                }`}
              >
                <Icon weight="bold" className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {activeTab === 'saved' && (
            <>
              {savedWorkspaces.length > 0 ? (
                <div className="space-y-2">
                  {savedWorkspaces.map((ws) => (
                    <div
                      key={ws.id}
                      className="p-3 bg-[#202328] border border-[#434853] rounded-none flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#DCE0E8] truncate">
                            {ws.name}
                          </span>
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#9FA6B3] text-[#1C1E22] rounded-none shrink-0">
                            {ws.screens.length} {t('شاشات', 'screens')}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#98A0AE] truncate">
                          {new Date(ws.updatedAt).toLocaleString(
                            lang === 'en' ? 'en-US' : 'ar-EG'
                          )}{' '}
                          • ({ws.screens.map((s) => s.name).join(' ، ')})
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onLoadWorkspace(ws);
                            onClose();
                          }}
                          className="px-2.5 py-1.5 studio-btn-elevated border rounded-none text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <FolderOpen weight="bold" className="w-3.5 h-3.5" />
                          <span>{t('فتح', 'Open')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onOverwriteWorkspace(ws.id)}
                          title={t('تحديث هذا المشروع بالحالة الحالية', 'Overwrite with current')}
                          className="px-2 py-1.5 studio-btn border rounded-none text-xs font-bold cursor-pointer"
                        >
                          {t('تحديث', 'Update')}
                        </button>

                        <button
                          type="button"
                          onClick={() => onExportWorkspaceJson(ws)}
                          title={t('تصدير حزمة مضغوطة (.sgd)', 'Export compressed .sgd archive')}
                          className="px-2 py-1.5 bg-[#1B2C3B] hover:bg-[#274056] text-[#7DD3FC] border border-[#2C4C66] rounded-none text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <FileArrowDown weight="bold" className="w-3.5 h-3.5" />
                          <span>.sgd</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteWorkspace(ws.id)}
                          title={t('حذف المشروع', 'Delete')}
                          className="p-1.5 studio-btn border rounded-none cursor-pointer"
                        >
                          <Trash weight="bold" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center bg-[#202328] border border-dashed border-[#434853] rounded-none space-y-1.5">
                  <p className="text-xs font-bold text-[#C8CED8]">
                    {t('لا توجد مشاريع محفوظة بعد', 'No saved projects yet')}
                  </p>
                  <p className="text-[11px] text-[#98A0AE]">
                    {t(
                      'اضغط على "حفظ المشروع الآن" بالأعلى لحفظ مشروعك الحالي في المتصفح.',
                      'Click "Save Project Now" above to store your workspace.'
                    )}
                  </p>
                </div>
              )}
            </>
          )}

          {activeTab === 'import_export' && (
            <div className="space-y-3">
              {/* SGD Container Architecture Info Banner */}
              <div className="p-2.5 bg-[#14202B] border border-[#263E52] border-s-2 border-s-[#8CC63F] rounded-none flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-bold text-[#8CC63F] flex items-center gap-1.5">
                    <span dir="ltr" className="px-1.5 py-0.5 bg-[#181B20] border border-[#8CC63F]/60 font-mono text-[10px]">
                      .sgd
                    </span>
                    <span>
                      {t(
                        'صيغة حاوية النظام المضغوطة (Studio Grid Director Container)',
                        'Studio Grid Director Compressed Container (.sgd)'
                      )}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#98A0AE]">
                    {t(
                      'تضغط جميع الشاشات، المساطر، الملاحظات، والصور المرفوعة كملفات ثنائية أصلية داخل حزمة واحدة (مع دعم استيراد .sgd و .json أو السحب والإفلات المباشر).',
                      'Compresses all screens, rulers, notes, and uploaded images as binary assets inside a single .sgd archive (supports .sgd & .json).'
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onExportWorkspaceJson()}
                  className="py-2.5 px-3 studio-btn-elevated border rounded-none text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileArrowDown weight="bold" className="w-4 h-4" />
                  <span>{t('تصدير المشروع كاملاً (.sgd)', 'Export Full Bundle (.sgd)')}</span>
                </button>

                <button
                  type="button"
                  onClick={onExportCurrentScreenJson}
                  className="py-2.5 px-3 studio-btn border rounded-none text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileArrowDown weight="bold" className="w-4 h-4" />
                  <span>
                    {t(
                      `تصدير الشاشة الحالية (.sgd)`,
                      `Export Active Screen (.sgd)`
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onImportJsonClick}
                  className="py-2.5 px-3 studio-btn-elevated border rounded-none text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileArrowUp weight="bold" className="w-4 h-4" />
                  <span>{t('استيراد ملف (.sgd / .json)', 'Import (.sgd / .json)')}</span>
                </button>
              </div>

              <div className="p-3 bg-[#202328] border border-[#434853] rounded-none space-y-2">
                <label className="block text-xs font-bold text-[#C8CED8]">
                  {t('أو الصق كود JSON مباشرة للاستيراد:', 'Or paste JSON content directly:')}
                </label>
                <textarea
                  rows={5}
                  dir="ltr"
                  value={pastedJson}
                  onChange={(e) => {
                    setPastedJson(e.target.value);
                    setPasteStatus('idle');
                  }}
                  placeholder='{"workspaceName": "...", "screens": [...]}'
                  className="w-full bg-[#2A2D34] border border-[#434853] focus:border-[#B8BEC9] rounded-none p-2.5 text-xs font-mono text-[#DCE0E8] outline-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#AEB5C2]">
                    {pasteStatus === 'error'
                      ? t('صيغة JSON غير صالحة!', 'Invalid JSON format!')
                      : pasteStatus === 'success'
                      ? t('تم الاستيراد بنجاح!', 'Imported successfully!')
                      : ''}
                  </span>
                  <button
                    type="button"
                    onClick={handlePasteImport}
                    className="px-4 py-1.5 studio-btn-elevated border rounded-none text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check weight="bold" className="w-3.5 h-3.5" />
                    <span>{t('استيراد الكود', 'Import JSON')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="space-y-2">
              {PRESET_PROJECT_TEMPLATES.map((tpl) => {
                const displayName =
                  lang === 'en'
                    ? tpl.id === 'screen-1'
                      ? 'Screen 1 — Main Stage (16:9)'
                      : tpl.id === 'screen-2'
                      ? 'Screen 2 — Panorama Wall (32:9)'
                      : tpl.name
                    : tpl.name;
                return (
                  <div
                    key={tpl.id}
                    className="p-3 bg-[#202328] border border-[#434853] rounded-none flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-bold text-[#DCE0E8]">{displayName}</div>
                      <div dir="ltr" className="text-[11px] font-mono text-[#AEB5C2]">
                        {tpl.compWidth}×{tpl.compHeight}px
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onLoadSingleTemplate(tpl);
                        onClose();
                      }}
                      className="px-3 py-1.5 studio-btn-elevated border rounded-none text-xs font-bold cursor-pointer"
                    >
                      {t('تطبيق القالب', 'Apply Template')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export type SgdImportDecisionMode = 'save_and_open' | 'merge' | 'open_without_saving';

interface SgdImportDecisionModalProps {
  pendingImport: Extract<ParsedSgdImportResult, { ok: true }> | null;
  currentWorkspaceName: string;
  currentScreensCount: number;
  lang: UILanguage;
  onDecision: (mode: SgdImportDecisionMode) => void;
  onCancel: () => void;
}

export const SgdImportDecisionModal: React.FC<SgdImportDecisionModalProps> = ({
  pendingImport,
  lang,
  onDecision,
  onCancel,
}) => {
  if (!pendingImport) return null;

  const t = (ar: string, en: string) => (lang === 'en' ? en : ar);

  const incomingScreens: Partial<StudioProject>[] =
    pendingImport.archiveType === 'workspace'
      ? pendingImport.screens
      : [pendingImport.screen];

  const incomingTitle =
    pendingImport.archiveType === 'workspace'
      ? pendingImport.workspaceName
      : pendingImport.screen.name || t('شاشة مستوردة', 'Imported Screen');

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 select-none"
      onClick={onCancel}
    >
      <div
        dir={lang === 'en' ? 'ltr' : 'rtl'}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs bg-[#22252A] border border-[#434853] rounded-none shadow-2xl flex flex-col"
      >
        {/* Compact Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#1A1D24] border-b border-[#343944]">
          <div className="flex items-center gap-2 min-w-0">
            <Package weight="bold" className="w-4 h-4 text-[#8CC63F] shrink-0" />
            <span className="text-xs font-bold text-[#DCE0E8] truncate">
              {incomingTitle}
            </span>
            <span
              dir="ltr"
              className="px-1.5 py-0.5 bg-[#262A32] border border-[#3A3F4B] text-[10px] font-mono text-[#98A0AE] shrink-0"
            >
              {incomingScreens.length}S
              {pendingImport.fileSizeKb ? ` · ${pendingImport.fileSizeKb}KB` : ''}
            </span>
          </div>

          <button
            type="button"
            onClick={onCancel}
            title={t('إلغاء (Esc)', 'Cancel (Esc)')}
            className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3A3F4B] text-[#98A0AE] hover:text-[#DCE0E8] border border-[#3A3F4B] rounded-none cursor-pointer shrink-0"
          >
            <X weight="bold" className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 4 Minimalist Action Buttons */}
        <div className="p-2.5 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => onDecision('save_and_open')}
            className="w-full h-8 px-3 bg-[#2B303B] hover:bg-[#353B48] border border-[#8CC63F]/60 text-[#DCE0E8] rounded-none flex items-center justify-between text-xs font-bold cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
              <FloppyDisk weight="bold" className="w-3.5 h-3.5 text-[#8CC63F]" />
              <span>{t('حفظ الحالي وفتح الجديد', 'Save Current & Open')}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onDecision('merge')}
            className="w-full h-8 px-3 bg-[#2B303B] hover:bg-[#353B48] border border-[#434853] text-[#DCE0E8] rounded-none flex items-center justify-between text-xs font-bold cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
              <GitMerge weight="bold" className="w-3.5 h-3.5 text-[#98A0AE]" />
              <span>{t('دمج الشاشات', 'Merge Screens')}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onDecision('open_without_saving')}
            className="w-full h-8 px-3 bg-[#2B303B] hover:bg-[#353B48] border border-[#434853] text-[#DCE0E8] rounded-none flex items-center justify-between text-xs font-bold cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
              <FolderOpen weight="bold" className="w-3.5 h-3.5 text-[#98A0AE]" />
              <span>{t('فتح دون حفظ السابق', 'Open Without Saving')}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="w-full h-7 px-3 bg-[#1A1D24] hover:bg-[#262A32] border border-[#343944] text-[#98A0AE] hover:text-[#DCE0E8] rounded-none flex items-center justify-center gap-1.5 text-[11px] font-bold cursor-pointer transition-colors mt-0.5"
          >
            <X weight="bold" className="w-3 h-3" />
            <span>{t('إلغاء', 'Cancel')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

