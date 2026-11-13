import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowSquareOut,
  Broadcast,
  Check,
  Copy,
  DownloadSimple,
  FileCode,
  FolderOpen,
  Monitor,
  Plugs,
  PictureInPicture,
  SlidersHorizontal,
  Sparkle,
  Stack,
  Stop,
  UploadSimple,
  Warning,
  X,
} from '@phosphor-icons/react';
import { NdiChannelConfig, StudioProject, UILanguage } from '../types/studio';
import { exportScreenNativePixelMapPng } from '../utils/gridEngine';
import {
  ArenaInputPackMode,
  ArenaLiveStatus,
  ArenaSliceGenMode,
  buildArenaAtlasPlan,
  clearResolumeArenaClips,
  exportArenaCompositionAtlasPng,
  exportArenaSliceMaskPng,
  exportResolumeArenaXmlPreset,
  fetchResolumeArenaStatus,
  parseResolumeAdvancedOutputXml,
  setResolumeArenaMasterOpacity,
  triggerResolumeArenaColumn,
} from '../utils/resolumeBridge';
import { isTauriRuntime, openTauriLiveOutputWindow } from '../utils/tauriBridge';

interface ResolumeArenaModalProps {
  isOpen: boolean;
  onClose: () => void;
  screens: StudioProject[];
  activeScreen: StudioProject;
  workspaceName: string;
  lang?: UILanguage;
  isLiveConnected?: boolean;
  isPipActive?: boolean;
  onTogglePipStream?: () => void;
  onSyncBeforeOpenOutput?: () => void;
  onImportArenaScreens: (
    importedScreens: StudioProject[],
    mode: 'replace' | 'append',
    importedWorkspaceName?: string
  ) => void;
  onMatchActiveScreenResolution?: (width: number, height: number) => void;
  onUpdateActiveNdiConfig: (patch: Partial<NdiChannelConfig>) => void;
}

type ArenaWorkflowMode = 'live_sync' | 'xml_setup' | 'import_xml';

export const ResolumeArenaModal: React.FC<ResolumeArenaModalProps> = ({
  isOpen,
  onClose,
  screens,
  activeScreen,
  workspaceName,
  lang = 'ar',
  isLiveConnected = false,
  isPipActive = false,
  onTogglePipStream,
  onSyncBeforeOpenOutput,
  onImportArenaScreens,
  onMatchActiveScreenResolution,
  onUpdateActiveNdiConfig,
}) => {
  const [workflowMode, setWorkflowMode] = useState<ArenaWorkflowMode>('live_sync');
  const [packMode, setPackMode] = useState<ArenaInputPackMode>('auto_atlas');
  const [sliceMode, setSliceMode] = useState<ArenaSliceGenMode>('combined');
  const [largeWallExportMode, setLargeWallExportMode] = useState<
    'native_per_screen' | 'scaled_atlas'
  >('native_per_screen');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Arena 7 REST API Control state
  const [arenaUrl, setArenaUrl] = useState<string>('http://127.0.0.1:8080');
  const [arenaStatus, setArenaStatus] = useState<ArenaLiveStatus | null>(null);
  const [isConnectingArena, setIsConnectingArena] = useState<boolean>(false);
  const [arenaMasterOpacity, setArenaMasterOpacity] = useState<number>(100);
  const [lastTriggeredCol, setLastTriggeredCol] = useState<number | null>(null);

  // XML Import state
  const xmlFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'append'>('append');
  const [importFeedback, setImportFeedback] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const isAr = lang !== 'en';
  const t = (ar: string, en: string) => (isAr ? ar : en);

  const atlasPlan = useMemo(
    () => buildArenaAtlasPlan(screens, packMode, sliceMode, 0),
    [screens, packMode, sliceMode]
  );

  if (!isOpen) return null;

  const liveStreamUrl = `${window.location.origin}${window.location.pathname}#live-output?screen=${encodeURIComponent(activeScreen.id)}`;
  const WIN_PRESET_PATH =
    '%USERPROFILE%\\Documents\\Resolume Arena\\Presets\\Advanced Output';

  const currentBgMode = activeScreen.ndiConfig?.bgKeyMode || 'solid';
  const isOverlayOnly = Boolean(
    activeScreen.ndiConfig?.onlySelectedAndGuidesInAlpha &&
      currentBgMode === 'alpha'
  );

  const handleCopyText = (key: string, value: string) => {
    try {
      void navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // ignore
    }
  };

  const handleConnectArenaRest = async () => {
    setIsConnectingArena(true);
    try {
      const status = await fetchResolumeArenaStatus(arenaUrl);
      setArenaStatus(status);
      if (status.connected && typeof status.masterOpacity === 'number') {
        setArenaMasterOpacity(status.masterOpacity);
      }
    } finally {
      setIsConnectingArena(false);
    }
  };

  const handleExportBothBundle = () => {
    const useScaledAtlas =
      atlasPlan.isExceeding8192 && largeWallExportMode === 'scaled_atlas';
    void exportResolumeArenaXmlPreset(
      screens,
      workspaceName,
      packMode,
      sliceMode,
      0,
      useScaledAtlas
    );

    if (atlasPlan.isExceeding8192 && largeWallExportMode === 'native_per_screen') {
      atlasPlan.placements.forEach((p, idx) => {
        window.setTimeout(() => {
          exportScreenNativePixelMapPng(p.screen, p.screenIndex);
        }, (idx + 1) * 240);
      });
      return;
    }

    window.setTimeout(() => {
      exportArenaCompositionAtlasPng(
        screens,
        workspaceName,
        packMode,
        sliceMode,
        0
      );
    }, 260);
  };

  const handleXmlFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseResolumeAdvancedOutputXml(text);
      if (!parsed.ok) {
        setImportFeedback({
          ok: false,
          msg: parsed.error || t('فشل قراءة ملف XML', 'Failed to parse XML'),
        });
        return;
      }

      onImportArenaScreens(
        parsed.screens,
        importMode,
        parsed.workspaceName || undefined
      );
      setImportFeedback({
        ok: true,
        msg: t(
          `تم استيراد ${parsed.screens.length} شاشة من Resolume Arena بنجاح!`,
          `Successfully imported ${parsed.screens.length} screen(s) from Resolume Arena!`
        ),
      });
    } catch {
      setImportFeedback({
        ok: false,
        msg: t('حدث خطأ أثناء قراءة الملف', 'Error reading XML file'),
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-4"
      dir={isAr ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <input
        ref={xmlFileInputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        onChange={handleXmlFileSelected}
        className="hidden"
      />

      <div
        className="bg-[#181A20] border border-[#3E4452] rounded-none w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1E232B] border-b border-[#343946] shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              dir="ltr"
              className="px-2.5 py-1 bg-[#0F2922] border border-[#10B981] text-[#34D399] font-mono text-xs font-black tracking-wider"
            >
              ARENA
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F3F5F8]">
                {t(
                  'التحكم المتزامن المباشر داخل Resolume Arena (بدون تسجيل دخول)',
                  'Real-Time Synchronous Control inside Resolume Arena (Zero Login)'
                )}
              </h2>
              <p className="text-[11px] text-[#9AA1AE]">
                {t(
                  'تحكّم في المربعات والليزر والمساطر من هنا بينما تتحدث الشاشة لحظياً داخل Arena',
                  'Control cells, laser, and rulers in SGD while the screen updates live inside Arena'
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

        {/* 3 Clear Mode Tabs */}
        <div className="grid grid-cols-3 bg-[#14171D] border-b border-[#343946] shrink-0 text-xs font-bold">
          <button
            type="button"
            onClick={() => setWorkflowMode('live_sync')}
            className={`py-2.5 px-2 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              workflowMode === 'live_sync'
                ? 'bg-[#1E232D] border-[#10B981] text-[#34D399]'
                : 'border-transparent text-[#9AA1AE] hover:text-[#E6E9F0]'
            }`}
          >
            <Broadcast weight="bold" className="w-4 h-4 shrink-0" />
            <span>
              {t(
                '1. التزامن المباشر الحي داخل Arena',
                '1. Live Real-Time Sync in Arena'
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWorkflowMode('xml_setup')}
            className={`py-2.5 px-2 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              workflowMode === 'xml_setup'
                ? 'bg-[#1E232D] border-[#38BDF8] text-[#7DD3FC]'
                : 'border-transparent text-[#9AA1AE] hover:text-[#E6E9F0]'
            }`}
          >
            <FileCode weight="bold" className="w-4 h-4 shrink-0" />
            <span>
              {t(
                '2. تصدير تقسيم الشاشات (.XML)',
                '2. Export Screens & Slices (.XML)'
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWorkflowMode('import_xml')}
            className={`py-2.5 px-2 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              workflowMode === 'import_xml'
                ? 'bg-[#1E232D] border-[#FACC15] text-[#FEF08A]'
                : 'border-transparent text-[#9AA1AE] hover:text-[#E6E9F0]'
            }`}
          >
            <UploadSimple weight="bold" className="w-4 h-4 shrink-0" />
            <span>
              {t(
                '3. استيراد ملف شاشات من Arena',
                '3. Import XML from Arena'
              )}
            </span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-3.5 text-xs flex-1">
          {workflowMode === 'live_sync' && (
            <>
              {/* Live Connection Status Banner */}
              <div
                className={`p-3 border flex flex-wrap items-center justify-between gap-3 ${
                  isLiveConnected || isPipActive
                    ? 'bg-[#0D261E] border-[#10B981] text-[#A7F3D0]'
                    : 'bg-[#1C2029] border-[#3E4452] text-[#D0D5DF]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-3 h-3 shrink-0 ${
                      isLiveConnected || isPipActive
                        ? 'bg-[#10B981] animate-pulse'
                        : 'bg-[#F59E0B]'
                    }`}
                  />
                  <div>
                    <div className="font-bold text-xs text-[#F3F5F8]">
                      {isLiveConnected || isPipActive
                        ? t(
                            `التزامن الحي نشط الآن: ${activeScreen.name} (${activeScreen.compWidth}×${activeScreen.compHeight})`,
                            `Live Sync Active: ${activeScreen.name} (${activeScreen.compWidth}×${activeScreen.compHeight})`
                          )
                        : t(
                            `الشاشة النشطة للبث: ${activeScreen.name} (${activeScreen.compWidth}×${activeScreen.compHeight}px)`,
                            `Active Screen for Broadcast: ${activeScreen.name} (${activeScreen.compWidth}×${activeScreen.compHeight}px)`
                          )}
                    </div>
                    <p className="text-[11px] text-[#9AA1AE]">
                      {isLiveConnected || isPipActive
                        ? t(
                            'كل تعديل أو حركة ليزر تقوم بها الآن في المحرر تنتقل فوراً وبنفس اللحظة إلى نافذة البث!',
                            'Every edit or laser movement updates instantaneously in the broadcast window!'
                          )
                        : t(
                            'اختر وضع الخلفية ثم افتح نافذة البث بالأسفل لالتقاطها داخل OBS / Arena بدون تسجيل دخول:',
                            'Select background mode and launch the broadcast window below:'
                          )}
                    </p>
                  </div>
                </div>

                {/* Output Mode Selector: Full Grid vs Transparent Overlay */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateActiveNdiConfig({
                        enabled: true,
                        bgKeyMode: 'solid',
                        onlySelectedAndGuidesInAlpha: false,
                      })
                    }
                    className={`px-2.5 py-1 text-[10.5px] font-bold border cursor-pointer ${
                      !isOverlayOnly
                        ? 'bg-[#10B981] text-[#09130E] border-[#34D399]'
                        : 'bg-[#14171D] text-[#9AA1AE] border-[#343946]'
                    }`}
                  >
                    {t('شبكة كاملة', 'Full Grid')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateActiveNdiConfig({
                        enabled: true,
                        bgKeyMode: 'alpha',
                        onlySelectedAndGuidesInAlpha: true,
                      })
                    }
                    className={`px-2.5 py-1 text-[10.5px] font-bold border cursor-pointer ${
                      isOverlayOnly
                        ? 'bg-[#38BDF8] text-[#091318] border-[#7DD3FC]'
                        : 'bg-[#14171D] text-[#9AA1AE] border-[#343946]'
                    }`}
                  >
                    {t('شفاف (فقط المحدد والليزر)', 'Alpha Overlay Only')}
                  </button>
                </div>
              </div>

              {/* Why OBS Browser Source asked for Google Login & The Instant Fix */}
              <div className="bg-[#261E10] border border-[#F59E0B]/70 p-2.5 flex items-start gap-2.5 text-[11px] text-[#FDE68A]">
                <Warning weight="bold" className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold text-[#FEF08A]">
                    {t(
                      'لماذا طلب OBS تسجيل الدخول لحساب Google عند استخدام (Navigateur / Browser)؟ ',
                      'Why did OBS Browser Source ask for Google Login? '
                    )}
                  </span>
                  {t(
                    'لأن رابط بيئة المعاينة الحالية محمي بحسابك في متصفحك فقط، ومتصفح OBS الداخلي غير مسجل الدخول. الحل الفوري لتجاوز تسجيل الدخول 100% هو فتح نافذة البث من متصفحك الحالي بالزر الأخضر أدناه، ثم اختيار (Capture de fenêtre / Window Capture) داخل OBS!',
                    'Because the cloud preview URL is authenticated in your current browser, not inside OBS’s internal browser. To bypass login 100%, open the broadcast window from your browser below and use Capture de fenêtre (Window Capture) in OBS!'
                  )}
                </div>
              </div>

              {/* PRIMARY ZERO-LOGIN SOLUTION: Open Broadcast Window in Current Authenticated Browser + OBS Capture de fenêtre */}
              <div className="bg-[#1C212B] border border-[#343B4A] border-r-4 border-r-[#10B981] p-3.5 space-y-3">
                <div className="font-bold text-[#F3F5F8] text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-[#10B981] text-[#09130E] font-mono font-black text-[11px]">
                      الحل المباشر (بدون تسجيل دخول)
                    </span>
                    <span>
                      {t(
                        'تشغيل البث المتزامن عبر (Capture de fenêtre) في OBS إلى داخل Arena',
                        'Zero-Login Live Sync via OBS (Capture de fenêtre) into Arena'
                      )}
                    </span>
                  </div>
                </div>

                {/* Step 1: Launch Either Floating PiP or Separate Chrome Window */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {onTogglePipStream && (
                    <button
                      type="button"
                      onClick={onTogglePipStream}
                      className={`py-2.5 px-3 font-bold text-xs flex items-center justify-center gap-2 border cursor-pointer transition-colors ${
                        isPipActive
                          ? 'bg-[#F43F5E] hover:bg-[#FB7185] text-white border-[#FDA4AF]'
                          : 'bg-[#10B981] hover:bg-[#34D399] text-[#09130E] border-[#34D399]'
                      }`}
                    >
                      <PictureInPicture weight="bold" className="w-4 h-4" />
                      <span>
                        {isPipActive
                          ? t(
                              'إيقاف نافذة البث العائمة (Image dans l’image)',
                              'Stop Floating PiP Broadcast Window'
                            )
                          : t(
                              '1A. تشغيل نافذة بث عائمة صافية بدون حواف (PiP)',
                              '1A. Launch Borderless Floating Broadcast (PiP)'
                            )}
                      </span>
                    </button>
                  )}

                  <a
                    href={liveStreamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (onSyncBeforeOpenOutput) onSyncBeforeOpenOutput();
                      if (isTauriRuntime()) {
                        e.preventDefault();
                        void openTauriLiveOutputWindow(activeScreen);
                      }
                    }}
                    className="py-2.5 px-3 bg-[#38BDF8] hover:bg-[#7DD3FC] text-[#091318] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <ArrowSquareOut weight="bold" className="w-4 h-4" />
                    <span>
                      {t(
                        '1B. أو فتح شاشة البث النظيفة في نافذة متصفح مستقلة',
                        '1B. Or Open Clean Output in Separate Browser Window'
                      )}
                    </span>
                  </a>
                </div>

                {/* Step 2 & 3 Instructions matching French/English OBS */}
                <div className="bg-[#12151C] border border-[#2C3240] p-3 space-y-2 text-[11.5px] text-[#CBD5E1] leading-relaxed">
                  <p>
                    <b className="text-[#34D399]">2. داخل برنامج OBS:</b>{' '}
                    {t(
                      'احذف مصدر (Navigateur) القديم، وأضف بدلاً منه ',
                      'Remove Browser Source and add '
                    )}
                    <code
                      dir="ltr"
                      className="px-1.5 py-0.5 bg-[#1E2430] border border-[#38BDF8]/50 text-[#7DD3FC] font-mono font-bold"
                    >
                      Capture de fenêtre (Window Capture)
                    </code>{' '}
                    {t(
                      'ثم اختر من قائمة (Fenêtre) نافذة البث التي فتحتها (أو نافذة Image dans l’image)، واجعل (Méthode de capture) على ',
                      'then select the opened window (or Image dans l’image) and set Capture Method to '
                    )}
                    <code
                      dir="ltr"
                      className="px-1.5 py-0.5 bg-[#1E2430] text-[#FACC15] font-mono"
                    >
                      Windows 10 (1903 et versions ultérieures)
                    </code>
                    {t(
                      ' (يلتقط الشاشة بـ 60 إطار/ثانية بدون أشرطة المتصفح وحتى لو كانت النافذة في الخلفية!).',
                      ' (captures cleanly even in the background!).'
                    )}
                  </p>

                  <p>
                    <b className="text-[#38BDF8]">3. الإرسال إلى Resolume Arena:</b>{' '}
                    {t(
                      'اضغط في OBS على ',
                      'In OBS click '
                    )}
                    <code
                      dir="ltr"
                      className="px-1.5 py-0.5 bg-[#0F2922] border border-[#10B981]/50 text-[#34D399] font-mono font-bold"
                    >
                      Démarrer la caméra virtuelle
                    </code>{' '}
                    {t(
                      'ثم افتح Resolume Arena ⬅ من قائمة (Sources) أسفل اليسار اسحب (OBS Virtual Camera) إلى أي Clip! الآن عد إلى هذه النافذة وتحكم في المربعات والليزر بالتزامن اللحظي!',
                      'then in Resolume Arena -> Sources -> drag OBS Virtual Camera into any Clip!'
                    )}
                  </p>
                </div>

                {/* Localhost / Tauri Note with URL Copy */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10.5px] text-[#9AA1AE]">
                  <span>
                    {t(
                      'ملاحظة: عند تشغيل التطبيق محلياً على جهازك (Tauri أو localhost) يعمل أيضاً رابط Browser Source مباشرة بدون تسجيل دخول:',
                      'Note: When running locally (Tauri or localhost), Browser Source URL also works without login:'
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText('live_url', liveStreamUrl)}
                    className="px-2 py-1 bg-[#252A36] hover:bg-[#323949] border border-[#475061] text-[#E6E9F0] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'live_url' ? (
                      <>
                        <Check weight="bold" className="w-3 h-3 text-[#4ADE80]" />
                        <span>{t('تم نسخ الرابط', 'Copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy weight="bold" className="w-3 h-3" />
                        <span>{t('نسخ الرابط', 'Copy URL')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Arena 7 Direct REST API Remote Control (Local Webserver via SSRF-safe Proxy) */}
              <div className="bg-[#161922] border border-[#343B4A] p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Plugs weight="bold" className="w-4 h-4 text-[#38BDF8]" />
                    <span className="font-bold text-xs text-[#F3F5F8]">
                      {t(
                        'التحكم المباشر بـ Resolume Arena 7 Webserver API (محلي / LAN)',
                        'Resolume Arena 7 REST API Control (Localhost / Private LAN)'
                      )}
                    </span>
                  </div>
                  {arenaStatus?.connected && (
                    <span className="px-2 py-0.5 bg-[#0F2922] border border-[#10B981] text-[#34D399] font-mono text-[10px] font-bold">
                      {arenaStatus.productName} v{arenaStatus.version}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={arenaUrl}
                    onChange={(e) => setArenaUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8080"
                    className="flex-1 min-w-[180px] h-7 px-2 bg-[#12151C] border border-[#3E4452] focus:border-[#38BDF8] text-[#F3F5F8] font-mono text-[11px] outline-none"
                  />
                  <button
                    type="button"
                    disabled={isConnectingArena}
                    onClick={() => void handleConnectArenaRest()}
                    className="h-7 px-3 bg-[#1E293B] hover:bg-[#38BDF8] text-[#7DD3FC] hover:text-[#091318] border border-[#38BDF8]/60 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    <Plugs weight="bold" className="w-3.5 h-3.5" />
                    <span>
                      {isConnectingArena
                        ? t('جاري الاتصال...', 'Connecting...')
                        : arenaStatus?.connected
                        ? t('تحديث الحالة', 'Refresh')
                        : t('اتصال بـ Arena', 'Connect Arena')}
                    </span>
                  </button>

                  {onMatchActiveScreenResolution &&
                    arenaStatus?.connected &&
                    arenaStatus.compWidth &&
                    arenaStatus.compHeight && (
                      <button
                        type="button"
                        onClick={() =>
                          onMatchActiveScreenResolution(
                            arenaStatus.compWidth!,
                            arenaStatus.compHeight!
                          )
                        }
                        className="h-7 px-2.5 bg-[#0F2922] hover:bg-[#10B981] text-[#34D399] hover:text-[#09130E] border border-[#10B981]/60 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Monitor weight="bold" className="w-3.5 h-3.5" />
                        <span>
                          {t(
                            `مطابقة الدقة (${arenaStatus.compWidth}×${arenaStatus.compHeight})`,
                            `Match Comp (${arenaStatus.compWidth}×${arenaStatus.compHeight})`
                          )}
                        </span>
                      </button>
                    )}
                </div>

                {arenaStatus && !arenaStatus.connected && arenaStatus.error && (
                  <div className="p-2 bg-[#2A151A] border border-[#F43F5E]/60 text-[10.5px] text-[#FDA4AF]">
                    {arenaStatus.error}
                  </div>
                )}

                {arenaStatus?.connected && (
                  <div className="bg-[#12151C] border border-[#2C3240] p-2.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[#CBD5E1]">
                      <span>
                        <b className="text-[#34D399]">{arenaStatus.compName}</b>{' '}
                        <span dir="ltr" className="font-mono text-[#9AA1AE]">
                          ({arenaStatus.compWidth ?? '?'}×{arenaStatus.compHeight ?? '?'}px ·{' '}
                          {arenaStatus.layersCount ?? 0} Layers / {arenaStatus.columnsCount ?? 0} Cols)
                        </span>
                      </span>
                      <div className="flex items-center gap-2" dir="ltr">
                        <SlidersHorizontal weight="bold" className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span className="text-[10px] font-mono text-[#9AA1AE]">Master:</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={arenaMasterOpacity}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setArenaMasterOpacity(val);
                            void setResolumeArenaMasterOpacity(arenaUrl, val);
                          }}
                          className="w-24 cursor-pointer accent-[#10B981]"
                        />
                        <span className="text-[10px] font-mono font-bold text-[#F3F5F8] w-8">
                          {arenaMasterOpacity}%
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#262B37]">
                      <span className="text-[10px] text-[#9AA1AE]">
                        {t('تشغيل عمود (Columns):', 'Trigger Column:')}
                      </span>
                      {Array.from(
                        { length: Math.min(8, Math.max(4, arenaStatus.columnsCount || 6)) },
                        (_, idx) => idx + 1
                      ).map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={async () => {
                            const ok = await triggerResolumeArenaColumn(arenaUrl, col);
                            if (ok) setLastTriggeredCol(col);
                          }}
                          className={`px-2 py-0.5 text-[10.5px] font-mono font-bold border cursor-pointer transition-colors ${
                            lastTriggeredCol === col
                              ? 'bg-[#10B981] text-[#09130E] border-[#34D399]'
                              : 'bg-[#1E232D] hover:bg-[#323949] text-[#E6E9F0] border-[#3E4452]'
                          }`}
                        >
                          Col {col}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setLastTriggeredCol(null);
                          void clearResolumeArenaClips(arenaUrl);
                        }}
                        className="px-2 py-0.5 text-[10.5px] font-bold bg-[#31151B] hover:bg-[#DC2626] text-[#FDA4AF] hover:text-white border border-[#F43F5E]/60 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Stop weight="bold" className="w-3 h-3" />
                        <span>{t('إيقاف الكل', 'Disconnect All')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {workflowMode === 'xml_setup' && (
            <>
              {/* Visual Mini-Map Preview of What Resolume Arena Will Receive */}
              <div className="bg-[#13161C] border border-[#2F3543] p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-[#F3F5F8] flex items-center gap-1.5">
                    <Monitor weight="bold" className="w-4 h-4 text-[#38BDF8]" />
                    <span>
                      {t(
                        'معاينة تخطيط الـ Composition والـ Slices لملف Advanced Output:',
                        'Preview of Arena Composition & Slices Layout:'
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="px-2 py-0.5 bg-[#0F2922] border border-[#10B981] text-[#34D399] font-bold">
                      {atlasPlan.compWidth} × {atlasPlan.compHeight} px
                    </span>
                    <span className="px-2 py-0.5 bg-[#1E293B] border border-[#38BDF8]/50 text-[#7DD3FC]">
                      {atlasPlan.placements.length} Screens / {atlasPlan.totalSlices} Slices
                    </span>
                  </div>
                </div>

                {/* Proportional Visual Diagram of Screens inside the Arena Composition */}
                <div className="w-full h-24 bg-[#090B0E] border border-[#282E3B] relative overflow-hidden flex items-center justify-center p-2">
                  <div
                    className="relative bg-[#11151E] border border-[#38BDF8]/40"
                    style={{
                      aspectRatio: `${atlasPlan.compWidth} / ${atlasPlan.compHeight}`,
                      maxHeight: '100%',
                      maxWidth: '100%',
                      height: '100%',
                    }}
                  >
                    {atlasPlan.placements.map((p, idx) => {
                      const leftPct = (p.inputX / atlasPlan.compWidth) * 100;
                      const topPct = (p.inputY / atlasPlan.compHeight) * 100;
                      const widthPct = (p.width / atlasPlan.compWidth) * 100;
                      const heightPct = (p.height / atlasPlan.compHeight) * 100;
                      const color = p.screen.selectionColor || '#10B981';

                      return (
                        <div
                          key={p.screen.id}
                          style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            width: `${widthPct}%`,
                            height: `${heightPct}%`,
                            borderColor: color,
                            backgroundColor: `${color}22`,
                          }}
                          className="absolute border-2 flex flex-col items-center justify-center overflow-hidden p-0.5"
                          title={`${p.screen.name} (${p.width}×{p.height}) -> X:${p.inputX}, Y:${p.inputY}`}
                        >
                          <span className="text-[9px] font-bold text-white truncate max-w-full leading-tight">
                            #{idx + 1} {p.screen.name}
                          </span>
                          <span
                            dir="ltr"
                            className="text-[8px] font-mono text-[#A7F3D0] leading-tight"
                          >
                            {p.width}×{p.height}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Option Row: Slice Mode & Packing Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#9AA1AE] shrink-0">
                      {t('تقسيم الـ Slices:', 'Slices:')}
                    </span>
                    <select
                      value={sliceMode}
                      onChange={(e) =>
                        setSliceMode(e.target.value as ArenaSliceGenMode)
                      }
                      className="flex-1 h-7 px-2 bg-[#1B1F29] border border-[#3E4452] text-[#F3F5F8] text-[11px] font-bold rounded-none"
                    >
                      <option value="combined">
                        {t(
                          'شامل (الشاشة + مخارج المعالجات + المربعات الملونة)',
                          'All (Screen + Processor Zones + Colored Groups)'
                        )}
                      </option>
                      <option value="full_screen">
                        {t('شريحة واحدة لكل شاشة فقط', '1 Full Slice per Screen')}
                      </option>
                      <option value="processor_zones">
                        {t('حسب مخارج المعالجات فقط', 'Processor Zones Only')}
                      </option>
                      <option value="color_groups">
                        {t('حسب المربعات الملونة فقط', 'Colored Cells Only')}
                      </option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#9AA1AE] shrink-0">
                      {t('ترتيب الخريطة:', 'Layout:')}
                    </span>
                    <select
                      value={packMode}
                      onChange={(e) =>
                        setPackMode(e.target.value as ArenaInputPackMode)
                      }
                      className="flex-1 h-7 px-2 bg-[#1B1F29] border border-[#3E4452] text-[#F3F5F8] text-[11px] font-bold rounded-none"
                    >
                      <option value="auto_atlas">
                        {t('صف متجاور تلقائي بدون فراغ', 'Auto Side-by-Side Atlas')}
                      </option>
                      <option value="stage_layout">
                        {t('حسب ترتيب مسرح الشاشات', 'Match Stage Positions')}
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Large Wall >8192px Scale Alignment Warning & Export Mode Selector */}
              {atlasPlan.isExceeding8192 && (
                <div className="bg-[#261E10] border border-[#F59E0B]/70 p-2.5 space-y-2 text-[11px] text-[#FDE68A]">
                  <div className="flex items-start gap-2">
                    <Warning weight="bold" className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <b className="text-[#FEF08A]">
                        {t(
                          `تنبيه دقة الجدار (${atlasPlan.compWidth}×${atlasPlan.compHeight}px يتجاوز حد المتصفح 8192px): `,
                          `Large Wall Notice (${atlasPlan.compWidth}×${atlasPlan.compHeight}px exceeds 8192px Canvas cap): `
                        )}
                      </b>
                      {t(
                        `لتجنب عدم تطابق مقاس صورة الـ Atlas المصغرة (${atlasPlan.atlasWidth}×${atlasPlan.atlasHeight}px، ${Math.round(atlasPlan.atlasScale * 100)}%) مع إحداثيات XML، اختر وضع التصدير:`,
                        `To prevent scale mismatch between a capped Atlas PNG (${atlasPlan.atlasWidth}×${atlasPlan.atlasHeight}px, ${Math.round(atlasPlan.atlasScale * 100)}%) and XML coordinates, choose export mode:`
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLargeWallExportMode('native_per_screen')}
                      className={`p-1.5 text-[10.5px] font-bold border text-start cursor-pointer ${
                        largeWallExportMode === 'native_per_screen'
                          ? 'bg-[#10B981]/20 border-[#10B981] text-[#6EE7B7]'
                          : 'bg-[#14171D] border-[#343946] text-[#CBD5E1]'
                      }`}
                    >
                      {t(
                        '1:1 شاشات مستقلة بدقتها الأصلية + XML غير مصغّر (افتراضي دقيق)',
                        '1:1 Per-Screen Native PNGs + Unscaled XML (Recommended)'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLargeWallExportMode('scaled_atlas')}
                      className={`p-1.5 text-[10.5px] font-bold border text-start cursor-pointer ${
                        largeWallExportMode === 'scaled_atlas'
                          ? 'bg-[#F59E0B]/20 border-[#F59E0B] text-[#FDE68A]'
                          : 'bg-[#14171D] border-[#343946] text-[#CBD5E1]'
                      }`}
                    >
                      {t(
                        `Atlas مصغّر (${atlasPlan.atlasWidth}×${atlasPlan.atlasHeight}) + XML مطابق للمقياس`,
                        `Scaled Atlas (${atlasPlan.atlasWidth}×${atlasPlan.atlasHeight}) + Matched XML`
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-[#1C212B] border border-[#343B4A] p-3 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={handleExportBothBundle}
                    className="sm:col-span-3 py-2.5 px-4 bg-[#10B981] hover:bg-[#34D399] text-[#09130E] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Sparkle weight="bold" className="w-4 h-4" />
                    <span>
                      {atlasPlan.isExceeding8192 && largeWallExportMode === 'native_per_screen'
                        ? t(
                            `تحميل XML الأصلي + خرائط 1:1 لكل شاشة (${atlasPlan.placements.length} PNG)`,
                            `Download Native .XML + 1:1 PNG per Screen (${atlasPlan.placements.length} PNGs)`
                          )
                        : t(
                            'تحميل الاثنين معاً (ملف Arena .XML + صورة الخريطة .PNG)',
                            'Download Both (.XML Preset + Atlas .PNG)'
                          )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void exportResolumeArenaXmlPreset(
                        screens,
                        workspaceName,
                        packMode,
                        sliceMode,
                        0,
                        atlasPlan.isExceeding8192 && largeWallExportMode === 'scaled_atlas'
                      )
                    }
                    className="py-1.5 px-2.5 bg-[#14171D] hover:bg-[#252A36] border border-[#38BDF8] text-[#7DD3FC] font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileCode weight="bold" className="w-3.5 h-3.5" />
                    <span>{t('ملف .XML فقط', '.XML Only')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      exportArenaCompositionAtlasPng(
                        screens,
                        workspaceName,
                        packMode,
                        sliceMode,
                        0
                      )
                    }
                    className="py-1.5 px-2.5 bg-[#14171D] hover:bg-[#252A36] border border-[#475061] text-[#E6E9F0] font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <DownloadSimple weight="bold" className="w-3.5 h-3.5 text-[#FACC15]" />
                    <span>
                      {atlasPlan.isExceeding8192
                        ? t(`صورة Atlas (${atlasPlan.atlasWidth}px)`, `Atlas PNG (${atlasPlan.atlasWidth}px)`)
                        : t('صورة الخريطة (PNG)', 'Atlas Map (PNG)')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportArenaSliceMaskPng(activeScreen, false)}
                    className="py-1.5 px-2.5 bg-[#14171D] hover:bg-[#252A36] border border-[#475061] text-[#CBD5E1] font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Stack weight="bold" className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>{t('قناع قص (Slice Mask)', 'Slice Mask PNG')}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 bg-[#12151C] border border-[#2D3342] px-2.5 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen weight="bold" className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
                    <code
                      dir="ltr"
                      className="text-[11px] font-mono text-[#FDE047] truncate block"
                    >
                      {WIN_PRESET_PATH}
                    </code>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText('win_path', WIN_PRESET_PATH)}
                    className="px-2.5 py-1 bg-[#252A36] hover:bg-[#38BDF8] text-[#E6E9F0] hover:text-[#111317] font-bold text-[10.5px] flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                  >
                    {copiedKey === 'win_path' ? (
                      <>
                        <Check weight="bold" className="w-3 h-3 text-[#4ADE80]" />
                        <span>{t('تم النسخ', 'Copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy weight="bold" className="w-3 h-3" />
                        <span>{t('نسخ مسار مجلد Arena', 'Copy Arena Path')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          {workflowMode === 'import_xml' && (
            <div className="bg-[#1C212B] border border-[#343B4A] border-r-4 border-r-[#FACC15] p-4 space-y-3">
              <div>
                <h3 className="text-xs font-bold text-[#F3F5F8]">
                  {t(
                    'استيراد الشاشات والـ Slices من ملف Resolume Arena (.xml)',
                    'Import Screens & Slices from a Resolume Arena (.xml) File'
                  )}
                </h3>
                <p className="text-[11.5px] text-[#CBD5E1] mt-1 leading-relaxed">
                  {t(
                    'إذا كان لديك إعداد شاشات جاهز داخل Resolume Arena: افتح في Arena نافذة (Output ➔ Advanced...) ثم اختر (Preset ➔ Save As...) لحفظ ملف الـ XML، ثم ارفعه هنا ليقوم التطبيق ببناء كل الشاشات ومقاساتها وشرائحها تلقائياً!',
                    'In Resolume Arena, open (Output -> Advanced...), save your preset as an .xml file, and upload it here to automatically create all screens and slices in your workspace.'
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <select
                  value={importMode}
                  onChange={(e) =>
                    setImportMode(e.target.value as 'replace' | 'append')
                  }
                  className="h-9 px-3 bg-[#12151C] border border-[#3E4452] text-[#F3F5F8] text-xs font-bold"
                >
                  <option value="append">
                    {t('إضافة الشاشات إلى مشروعي الحالي', 'Append to current screens')}
                  </option>
                  <option value="replace">
                    {t('استبدال المشروع الحالي بشاشات Arena', 'Replace current workspace')}
                  </option>
                </select>

                <button
                  type="button"
                  onClick={() => xmlFileInputRef.current?.click()}
                  className="h-9 px-4 bg-[#FACC15] hover:bg-[#FDE047] text-[#111317] font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <UploadSimple weight="bold" className="w-4 h-4" />
                  <span>
                    {t(
                      'اختر ملف Resolume Arena (.XML) من جهازك',
                      'Select Resolume Arena (.XML) File'
                    )}
                  </span>
                </button>
              </div>

              {importFeedback && (
                <div
                  className={`p-2.5 text-xs font-bold border ${
                    importFeedback.ok
                      ? 'bg-[#0F2922] border-[#10B981] text-[#6EE7B7]'
                      : 'bg-[#31151B] border-[#F43F5E] text-[#FDA4AF]'
                  }`}
                >
                  {importFeedback.msg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
