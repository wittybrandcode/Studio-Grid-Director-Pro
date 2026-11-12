import React, { useEffect, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  ArrowsLeftRight,
  Broadcast,
  CaretDown,
  CaretUp,
  Check,
  CopySimple,
  Lightning,
  LinkSimple,
  MonitorPlay,
  Play,
  Plus,
  PushPin,
  Snowflake,
  TelevisionSimple,
  Trash,
} from '@phosphor-icons/react';
import {
  DEFAULT_NDI_CONFIG,
  NdiBgKeyMode,
  NdiChannelConfig,
  NdiFrameRate,
  RESOLUTION_PRESETS,
  StudioProject,
  TestPatternType,
  UILanguage,
} from '../../types/studio';
import {
  copyTextWithTauriFallback,
  isTauriRuntime,
  openTauriLiveOutputWindow,
  stopTauriNdiStream,
} from '../../utils/tauriBridge';

interface ScreensManagerSectionProps {
  screens: StudioProject[];
  activeProject: StudioProject;
  lang: UILanguage;
  expandSignal?: { open: boolean; seq: number };
  isPanoramicWallView?: boolean;
  onTogglePanoramicWallView?: () => void;
  onEnterPureWallMode?: () => void;
  isNewScreenModalOpen: boolean;
  setIsNewScreenModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newScreenName: string;
  setNewScreenName: (val: string) => void;
  newScreenPresetId: string;
  setNewScreenPresetId: (val: string) => void;
  isLiveFrozen: boolean;
  onToggleLiveFrozen: () => void;
  onSelectScreen: (screenId: string) => void;
  onCreateScreen: (openOutputImmediately: boolean) => void;
  onDuplicateScreen: () => void;
  onDeleteScreen: (screenId: string) => void;
  onRenameActiveScreen: (newName: string) => void;
  onToggleScreenSlate: () => void;
  onToggleClock: () => void;
  onToggleSafeMargins: () => void;
  onSetTestPattern: (pattern: TestPatternType) => void;
  onUpdateOverlays?: (patch: Partial<StudioProject['overlays']>) => void;
  onUpdateNdiConfig?: (patch: Partial<NdiChannelConfig>) => void;
  onIdentifyScreen: (screenId: string) => void;
  onTogglePinIdentifyScreen: (screenId: string) => void;
  onMoveScreen: (screenId: string, direction: 'up' | 'down') => void;
  onSyncBeforeOpenOutput: (screen: StudioProject) => void;
  isScreenLiveOpen: (screenId: string) => boolean;
}

export const ScreensManagerSection: React.FC<ScreensManagerSectionProps> = React.memo(({
  screens,
  activeProject,
  lang,
  expandSignal,
  isNewScreenModalOpen,
  setIsNewScreenModalOpen,
  newScreenName,
  setNewScreenName,
  newScreenPresetId,
  setNewScreenPresetId,
  isLiveFrozen,
  onToggleLiveFrozen,
  onSelectScreen,
  onCreateScreen,
  onDuplicateScreen,
  onDeleteScreen,
  onRenameActiveScreen,
  onSetTestPattern,
  onUpdateOverlays,
  onUpdateNdiConfig,
  onIdentifyScreen,
  onTogglePinIdentifyScreen,
  onMoveScreen,
  onSyncBeforeOpenOutput,
  isScreenLiveOpen,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [copiedFeedUrl, setCopiedFeedUrl] = useState<boolean>(false);
  const t = (ar: string, en: string) => (lang === 'en' ? en : ar);

  useEffect(() => {
    if (expandSignal && expandSignal.seq > 0) {
      setIsOpen(expandSignal.open);
    }
  }, [expandSignal]);

  const showSyncBar = Boolean(activeProject.overlays?.movingSyncBar);
  const activePattern: TestPatternType = activeProject.overlays?.testPattern || 'none';
  const ndiCfg: NdiChannelConfig = {
    ...DEFAULT_NDI_CONFIG,
    ...(activeProject.ndiConfig || {}),
  };

  return (
    <div className="bg-[#232730] border border-[#3A3F4B] rounded-none">
      {/* Compact Collapsible Header */}
      <div
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center justify-between px-2.5 py-1.5 bg-[#2B303B] border-b border-[#3A3F4B] cursor-pointer select-none"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <MonitorPlay weight="bold" className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
          <span className="text-xs font-bold text-[#E6E9F0] truncate">
            {t('الشاشات', 'Screens')}
          </span>
          <span className="px-1 py-0.2 bg-[#1B1E24] border border-[#3A3F4B] text-[10px] font-mono font-bold text-[#9FA6B3]">
            {screens.length}
          </span>
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              setNewScreenName(t(`الشاشة ${screens.length + 1}`, `Screen ${screens.length + 1}`));
              setIsNewScreenModalOpen((v) => !v);
            }}
            title={t('إضافة شاشة جديدة (+)', 'Add New Screen (+)')}
            className={`w-6 h-6 flex items-center justify-center border rounded-none cursor-pointer transition-colors ${
              isNewScreenModalOpen
                ? 'bg-[#38BDF8] text-[#111317] border-[#FFFFFF]'
                : 'bg-[#282C35] hover:bg-[#38BDF8] text-[#C4CAD4] hover:text-[#111317] border-[#3A3F4B]'
            }`}
          >
            <Plus weight="bold" className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#AEB5C2] hover:text-[#FFFFFF] border border-[#3A3F4B] rounded-none cursor-pointer transition-colors"
            title={isOpen ? t('طي القسم', 'Collapse') : t('فتح القسم', 'Expand')}
          >
            {isOpen ? (
              <CaretUp weight="bold" className="w-3 h-3" />
            ) : (
              <CaretDown weight="bold" className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Body */}
      {isOpen && (
        <div className="p-2 space-y-1.5">
          {/* Ultra-Compact Inline Quick Screen Creator */}
          {isNewScreenModalOpen && (
            <div className="p-1.5 bg-[#1B1E24] border border-[#4A4F5C] space-y-1 rounded-none">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newScreenName}
                  onChange={(e) => setNewScreenName(e.target.value)}
                  placeholder={t('اسم الشاشة', 'Screen Name')}
                  className="flex-1 min-w-0 h-7 bg-[#242830] border border-[#3F4552] focus:border-[#38BDF8] px-2 text-xs text-[#E6E9F0] outline-none rounded-none"
                />
                <button
                  type="button"
                  onClick={() => onCreateScreen(false)}
                  title={t('إنشاء الشاشة فقط', 'Create Screen')}
                  className="w-7 h-7 flex items-center justify-center bg-[#282C35] hover:bg-[#38BDF8] text-[#C4CAD4] hover:text-[#111317] border border-[#3F4552] rounded-none cursor-pointer transition-colors shrink-0"
                >
                  <Check weight="bold" className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onCreateScreen(true)}
                  title={t('إنشاء الشاشة وفتح نافذة العرض المباشر فوراً', 'Create & Open Live Output')}
                  className="w-7 h-7 flex items-center justify-center bg-[#1B2C3B] hover:bg-[#38BDF8] text-[#7DD3FC] hover:text-[#111317] border border-[#2C4C66] rounded-none cursor-pointer transition-colors shrink-0"
                >
                  <ArrowSquareOut weight="bold" className="w-3.5 h-3.5" />
                </button>
              </div>
              <select
                value={newScreenPresetId}
                onChange={(e) => setNewScreenPresetId(e.target.value)}
                className="w-full h-7 bg-[#242830] border border-[#3F4552] px-2 text-[11px] text-[#E6E9F0] outline-none cursor-pointer rounded-none"
              >
                {RESOLUTION_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {lang === 'en' ? p.nameEn : p.nameAr} ({p.width}×{p.height})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Compact Single-Row List of Screens */}
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {screens.map((scr, idx) => {
              const isSelected = scr.id === activeProject.id;
              const isLive = isScreenLiveOpen(scr.id);

              return (
                <div
                  key={scr.id}
                  onClick={() => onSelectScreen(scr.id)}
                  className={`px-2 py-1 border transition-colors cursor-pointer flex items-center justify-between gap-1.5 rounded-none ${
                    isSelected
                      ? 'bg-[#2E3440] border-[#6B7487] text-[#F3F5F8]'
                      : 'bg-[#1B1E24] border-[#343944] text-[#AEB5C2] hover:bg-[#252932]'
                  }`}
                >
                  <div className="min-w-0 flex-1 flex items-center gap-1.5">
                    <span
                      title={
                        isLive
                          ? t('نافذة العرض المباشر متصلة الآن', 'Live Output Connected')
                          : t('نافذة العرض المباشر غير مفتوحة', 'Live Output Closed')
                      }
                      className={`w-2 h-2 shrink-0 rounded-none ${
                        isLive
                          ? 'bg-[#8CC63F]'
                          : isSelected
                          ? 'bg-[#38BDF8]'
                          : 'bg-[#525866]'
                      }`}
                    />
                    <span className="text-[10px] font-mono text-[#8E95A5] shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="text-[11px] font-bold truncate">{scr.name}</span>
                    <span dir="ltr" className="text-[9px] font-mono text-[#8E95A5] shrink-0">
                      {scr.compWidth}×{scr.compHeight}
                    </span>
                  </div>

                  {/* Right: Compact Icon-Only Screen Action Strip */}
                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onIdentifyScreen(scr.id)}
                      title={t('ومضة تعريفية سريعة (Flash)', 'Quick Flash Identify')}
                      className="w-6 h-6 flex items-center justify-center bg-[#282C35] hover:bg-[#FACC15] text-[#C4CAD4] hover:text-[#111317] border border-[#3A3F4B] rounded-none cursor-pointer transition-colors"
                    >
                      <Lightning weight="fill" className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onTogglePinIdentifyScreen(scr.id)}
                      title={t(
                        scr.overlays?.pinnedIdentify
                          ? 'إلغاء تثبيت الومضة التعريفية (Hold ✓)'
                          : 'تثبيت الومضة التعريفية (Hold)',
                        'Toggle Pinned Identify'
                      )}
                      className={`w-6 h-6 flex items-center justify-center border rounded-none cursor-pointer transition-colors ${
                        scr.overlays?.pinnedIdentify
                          ? 'bg-[#FACC15] text-[#111317] border-[#FEF08A]'
                          : 'bg-[#282C35] hover:bg-[#3E4452] text-[#C4CAD4] hover:text-[#FFFFFF] border-[#3A3F4B]'
                      }`}
                    >
                      <PushPin
                        weight={scr.overlays?.pinnedIdentify ? 'fill' : 'bold'}
                        className="w-3 h-3"
                      />
                    </button>

                    <a
                      href={`#live-output?screen=${encodeURIComponent(scr.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        onSyncBeforeOpenOutput(scr);
                        if (isTauriRuntime()) {
                          e.preventDefault();
                          void openTauriLiveOutputWindow(scr, idx > 0 ? idx : undefined);
                        }
                      }}
                      title={t(
                        isLive ? 'شاشة العرض متصلة (فتح)' : 'فتح نافذة العرض المباشر',
                        'Open Live Output Window'
                      )}
                      className={`w-6 h-6 flex items-center justify-center border rounded-none transition-colors ${
                        isLive
                          ? 'bg-[#8CC63F]/20 text-[#8CC63F] border-[#8CC63F] hover:bg-[#8CC63F] hover:text-[#111317]'
                          : 'bg-[#282C35] hover:bg-[#38BDF8] text-[#C4CAD4] hover:text-[#111317] border-[#3A3F4B]'
                      }`}
                    >
                      <ArrowSquareOut weight="bold" className="w-3 h-3" />
                    </a>

                    {screens.length > 1 && (
                      <div className="flex flex-col">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveScreen(scr.id, 'up')}
                          title={t('تحريك لأعلى', 'Move Up')}
                          className="w-4 h-3 flex items-center justify-center bg-[#242830] hover:bg-[#3E4452] disabled:opacity-25 text-[#AEB5C2] border border-[#363B46] rounded-none cursor-pointer"
                        >
                          <CaretUp weight="bold" className="w-2 h-2" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === screens.length - 1}
                          onClick={() => onMoveScreen(scr.id, 'down')}
                          title={t('تحريك لأسفل', 'Move Down')}
                          className="w-4 h-3 flex items-center justify-center bg-[#242830] hover:bg-[#3E4452] disabled:opacity-25 text-[#AEB5C2] border-x border-b border-[#363B46] rounded-none cursor-pointer"
                        >
                          <CaretDown weight="bold" className="w-2 h-2" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Screen Name + Pure Icon Action Strip (No Redundant Show/Hide Icons) */}
          <div className="pt-1 border-t border-[#343944] flex items-center gap-1">
            <input
              type="text"
              value={activeProject.name}
              onChange={(e) => onRenameActiveScreen(e.target.value)}
              placeholder={t('اسم الشاشة...', 'Screen Name...')}
              className="flex-1 min-w-0 h-7 bg-[#1B1E24] border border-[#3F4552] focus:border-[#38BDF8] px-2 text-[11px] font-bold text-[#E6E9F0] outline-none rounded-none"
            />

            {/* Moving Genlock / Tearing Sync Bar Icon */}
            {onUpdateOverlays && (
              <button
                type="button"
                onClick={() =>
                  onUpdateOverlays({
                    movingSyncBar: !showSyncBar,
                  })
                }
                title={t(
                  'شريط المسح المتحرك لاختبار تزامن الشاشات (Genlock Sync Bar)',
                  'Toggle Moving Sync / Tearing Bar'
                )}
                className={`w-7 h-7 flex items-center justify-center border rounded-none cursor-pointer transition-colors ${
                  showSyncBar
                    ? 'bg-[#FACC15] text-[#111317] border-[#FEF08A]'
                    : 'bg-[#282C35] hover:bg-[#3E4452] text-[#C4CAD4] hover:text-[#FFFFFF] border-[#3A3F4B]'
                }`}
              >
                <ArrowsLeftRight weight="bold" className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Freeze Live Output Icon */}
            <button
              type="button"
              onClick={onToggleLiveFrozen}
              title={t(
                isLiveFrozen ? 'إلغاء تجميد البث المباشر' : 'تجميد البث المباشر مؤقتاً',
                'Toggle Freeze Live Output'
              )}
              className={`w-7 h-7 flex items-center justify-center border rounded-none cursor-pointer transition-colors ${
                isLiveFrozen
                  ? 'bg-[#F59E0B] text-[#111317] border-[#FEF08A]'
                  : 'bg-[#282C35] hover:bg-[#3E4452] text-[#C4CAD4] hover:text-[#FFFFFF] border-[#3A3F4B]'
              }`}
            >
              {isLiveFrozen ? (
                <Play weight="fill" className="w-3.5 h-3.5" />
              ) : (
                <Snowflake weight="bold" className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Duplicate Screen Icon */}
            <button
              type="button"
              onClick={onDuplicateScreen}
              title={t('نسخ الشاشة الحالية', 'Duplicate Screen')}
              className="w-7 h-7 flex items-center justify-center bg-[#282C35] hover:bg-[#3E4452] text-[#C4CAD4] hover:text-[#FFFFFF] border border-[#3A3F4B] rounded-none cursor-pointer transition-colors"
            >
              <CopySimple weight="bold" className="w-3.5 h-3.5" />
            </button>

            {/* Delete Screen Icon */}
            {screens.length > 1 && (
              <button
                type="button"
                onClick={() => onDeleteScreen(activeProject.id)}
                title={t('حذف الشاشة الحالية', 'Delete Screen')}
                className="w-7 h-7 flex items-center justify-center bg-[#282C35] hover:bg-[#EF4444] text-[#C4CAD4] hover:text-[#FFFFFF] border border-[#3A3F4B] rounded-none cursor-pointer transition-colors"
              >
                <Trash weight="bold" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Compact Icon-Prefix Test Pattern Selector */}
          <div className="flex items-center gap-1">
            <span
              title={t('نمط فحص الشاشة (Test Pattern)', 'Screen Test Pattern')}
              className="w-7 h-7 flex items-center justify-center bg-[#1B1E24] border border-[#3F4552] text-[#38BDF8] shrink-0"
            >
              <TelevisionSimple weight="bold" className="w-3.5 h-3.5" />
            </span>
            <select
              value={activePattern}
              onChange={(e) => onSetTestPattern(e.target.value as TestPatternType)}
              className="flex-1 h-7 bg-[#1B1E24] border border-[#3F4552] focus:border-[#38BDF8] px-2 text-[11px] font-bold text-[#E6E9F0] outline-none cursor-pointer rounded-none"
            >
              <option value="none">{t('الشبكة القياسية (Grid)', 'Standard Grid')}</option>
              <option value="bars">{t('شرائط ألوان البث (SMPTE)', 'SMPTE Bars')}</option>
              <option value="border">{t('إطار المحاذاة والأقطار (Border)', 'Alignment Border')}</option>
              <option value="pixel_checker">{t('شطرنج الكابينات (Checker)', 'Module Checker')}</option>
              <option value="grayscale_ramp">{t('تدرج رمادي 16 (Grayscale)', '16-Step Grayscale')}</option>
              <option value="white">{t('أبيض نقي (Full White)', 'Full White')}</option>
              <option value="black">{t('أسود نقي (Full Black)', 'Full Black')}</option>
              <option value="rgb_red">{t('أحمر نقي (Pure Red R)', 'Pure Red R')}</option>
              <option value="rgb_green">{t('أخضر نقي (Pure Green G)', 'Pure Green G')}</option>
              <option value="rgb_blue">{t('أزرق نقي (Pure Blue B)', 'Pure Blue B')}</option>
            </select>
            {activePattern !== 'none' && (
              <button
                type="button"
                onClick={() => onSetTestPattern('none')}
                className="w-7 h-7 flex items-center justify-center bg-[#38BDF8] text-[#111317] border border-[#FFFFFF] rounded-none cursor-pointer shrink-0"
                title={t('العودة للشبكة القياسية', 'Return to Grid')}
              >
                <ArrowCounterClockwise weight="bold" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sync Bar Direction & Speed sub-row (Icon + Codes Only) */}
          {showSyncBar && onUpdateOverlays && (
            <div className="flex items-center justify-between gap-1 px-1.5 py-1 bg-[#1B1E24] border border-[#3A3F4B]">
              <ArrowsLeftRight weight="bold" className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
              <div className="flex items-center gap-1" dir="ltr">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateOverlays({
                      syncBarOrientation:
                        activeProject.overlays?.syncBarOrientation === 'horizontal'
                          ? 'vertical'
                          : 'horizontal',
                    })
                  }
                  title={t('تغيير اتجاه شريط التزامن (أفقي / عمودي)', 'Toggle Sync Bar Axis')}
                  className="px-2 py-0.5 bg-[#282C35] hover:bg-[#3E4452] text-[#E6E9F0] border border-[#3A3F4B] text-[10px] font-mono font-bold rounded-none cursor-pointer"
                >
                  {activeProject.overlays?.syncBarOrientation === 'horizontal' ? '↕ Y' : '↔ X'}
                </button>
                {[1, 2, 4].map((spd) => {
                  const isSpd = (activeProject.overlays?.syncBarSpeed || 2) === spd;
                  return (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => onUpdateOverlays({ syncBarSpeed: spd })}
                      className={`px-1.5 py-0.5 border text-[10px] font-mono font-bold rounded-none cursor-pointer ${
                        isSpd
                          ? 'bg-[#FACC15] text-[#111317] border-[#FEF08A]'
                          : 'bg-[#282C35] hover:bg-[#3E4452] text-[#C4CAD4] border-[#3A3F4B]'
                      }`}
                    >
                      {spd}x
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Compact NDI Channel & Clean Alpha / Chroma Key Strip */}
          {onUpdateNdiConfig && (
            <div className="p-1.5 bg-[#1B1E24] border border-[#3A3F4B] space-y-1.5 rounded-none">
              <div className="flex items-center gap-1" dir="ltr">
                <button
                  type="button"
                  onClick={() => {
                    const nextEnabled = !ndiCfg.enabled;
                    if (!nextEnabled) {
                      void stopTauriNdiStream(activeProject.id, ndiCfg.sourceName);
                    }
                    onUpdateNdiConfig({
                      enabled: nextEnabled,
                      sourceName:
                        ndiCfg.sourceName?.trim() ||
                        `SGD_${activeProject.id.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`,
                    });
                  }}
                  title={t(
                    'تشغيل/إيقاف بث قناة NDI لهذه الشاشة (Tauri NDI Sender + NDI Screen Capture Tagging)',
                    'Toggle NDI Broadcast Stream for Active Screen'
                  )}
                  className={`h-7 px-2 flex items-center gap-1 text-[10px] font-mono font-bold border rounded-none cursor-pointer shrink-0 transition-colors ${
                    ndiCfg.enabled
                      ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                      : 'bg-[#282C35] hover:bg-[#3E4452] text-[#C4CAD4] border-[#3A3F4B]'
                  }`}
                >
                  <Broadcast weight={ndiCfg.enabled ? 'fill' : 'bold'} className="w-3.5 h-3.5" />
                  <span>NDI</span>
                </button>

                <input
                  type="text"
                  dir="ltr"
                  value={ndiCfg.sourceName}
                  onChange={(e) => onUpdateNdiConfig({ sourceName: e.target.value })}
                  placeholder="SGD_SCREEN_1"
                  title={t('اسم مصدر قناة NDI على الشبكة', 'NDI Network Source Name')}
                  className="flex-1 min-w-0 h-7 bg-[#242830] border border-[#3F4552] focus:border-[#8CC63F] px-2 text-[10px] font-mono font-bold text-[#E6E9F0] outline-none rounded-none"
                />

                <select
                  dir="ltr"
                  value={ndiCfg.frameRate}
                  onChange={(e) =>
                    onUpdateNdiConfig({ frameRate: Number(e.target.value) as NdiFrameRate })
                  }
                  title={t('معدل إطارات بث NDI بالثانية (FPS)', 'NDI Stream Frame Rate (FPS)')}
                  className="h-7 bg-[#242830] border border-[#3F4552] px-1 text-[10px] font-mono font-bold text-[#E6E9F0] outline-none cursor-pointer rounded-none shrink-0"
                >
                  <option value={25}>25p</option>
                  <option value={30}>30p</option>
                  <option value={50}>50p</option>
                  <option value={60}>60p</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    const feedUrl = `${window.location.origin}${window.location.pathname}#live-output?screen=${encodeURIComponent(
                      activeProject.id
                    )}`;
                    void copyTextWithTauriFallback(feedUrl).then((ok) => {
                      if (ok) {
                        setCopiedFeedUrl(true);
                        window.setTimeout(() => setCopiedFeedUrl(false), 1800);
                      }
                    });
                  }}
                  title={t(
                    'نسخ رابط Clean Feed المباشر لإدخاله في OBS Browser Source أو vMix Web Browser',
                    'Copy Clean Feed URL for OBS / vMix Browser Source'
                  )}
                  className={`w-7 h-7 flex items-center justify-center border rounded-none cursor-pointer shrink-0 transition-colors ${
                    copiedFeedUrl
                      ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB]'
                      : 'bg-[#282C35] hover:bg-[#38BDF8] text-[#C4CAD4] hover:text-[#111317] border-[#3A3F4B]'
                  }`}
                >
                  {copiedFeedUrl ? (
                    <Check weight="bold" className="w-3.5 h-3.5" />
                  ) : (
                    <LinkSimple weight="bold" className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {/* Clean Key Mode Row: Solid | Alpha (Transparent) | Chroma Green | Chroma Blue + Overlay-Only Toggle */}
              <div className="flex items-center gap-1" dir="ltr">
                <select
                  value={ndiCfg.bgKeyMode}
                  onChange={(e) =>
                    onUpdateNdiConfig({ bgKeyMode: e.target.value as NdiBgKeyMode })
                  }
                  title={t(
                    'نمط خلفية الخرْج لتركيب الشبكة فوق الفيديو (Solid / Alpha Key شفاف / Chroma)',
                    'Background Key Mode (Solid / Transparent Alpha / Chroma Key)'
                  )}
                  className="flex-1 min-w-0 h-6 bg-[#242830] border border-[#3F4552] px-1.5 text-[10px] font-mono text-[#DCE0E8] outline-none cursor-pointer rounded-none"
                >
                  <option value="solid">{t('خلفية عادية (Solid)', 'Solid Dark BG')}</option>
                  <option value="alpha">{t('شفاف (Alpha Key RGBA)', 'Alpha Key (Transparent)')}</option>
                  <option value="chroma_green">{t('كروما خضراء (Chroma Green)', 'Chroma Green (#00FF00)')}</option>
                  <option value="chroma_blue">{t('كروما زرقاء (Chroma Blue)', 'Chroma Blue (#0000FF)')}</option>
                </select>

                {ndiCfg.bgKeyMode !== 'solid' && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateNdiConfig({
                        onlySelectedAndGuidesInAlpha: !ndiCfg.onlySelectedAndGuidesInAlpha,
                      })
                    }
                    title={t(
                      'إخفاء المربعات غير المحددة ليظهر فقط التحديد والمساطر والليزر فوق الفيديو الحي',
                      'Show Only Selected Squares, Rulers & Laser over Live Video'
                    )}
                    className={`h-6 px-2 text-[9px] font-mono font-bold border rounded-none cursor-pointer shrink-0 transition-colors ${
                      ndiCfg.onlySelectedAndGuidesInAlpha
                        ? 'bg-[#38BDF8] text-[#09131C] border-[#E0F2FE]'
                        : 'bg-[#282C35] text-[#AEB5C2] border-[#3A3E47]'
                    }`}
                  >
                    {t('فقط التحديد والليزر', 'Overlay Only')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
