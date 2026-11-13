# خارطة طريق الإصلاح وإعادة الهيكلة — Studio Grid Director Pro
**Refactoring, Bug-Fix & Stabilization Roadmap**

> تم إعداد هذه الخارطة بناءً على الدورة الهندسية الشاملة لتدقيق كامل طبقات المشروع (~27,767 سطر كود). تُنفَّذ الإصلاحات **مرحلةً بمرحلة** مع التحقق من البناء وفحص الأنواع (`npm run lint` و `npm run build`) بعد كل مرحلة قبل الانتقال إلى المرحلة التالية.

---

## نظرة عامة على المراحل

| المرحلة | المحور الأساسي | الأولوية | الحالة |
| :--- | :--- | :--- | :--- |
| **المرحلة 1** | تنظيف الديون البرمجية، الأصول المهملة، وتشديد TypeScript | P0 — تهيئة سريعة | ✅ مكتملة |
| **المرحلة 2** | إصلاح خادم الإنتاج، المزامنة اللحظية، وأمان Tauri/Archive | P0 — استقرار التشغيل | ✅ مكتملة |
| **المرحلة 3** | عزل البث العائم (PiP)، إعادة بناء محرك الألوان، وإدارة ذاكرة Canvas | P0/P1 — محرك البث والرسم | ✅ مكتملة |
| **المرحلة 4** | تكامل Resolume Arena، تصدير After Effects، الترجمة، وCSS | P1 — التكاملات والواجهة | ✅ مكتملة |
| **المرحلة 5** | تفكيك `App.tsx` و`gridEngine.ts`، وحسم بنية Tauri v2 وNDI | P2 — المعمارية طويلة الأمد | ✅ مكتملة |

---

## المرحلة 1: تنظيف الديون البرمجية والأصول المهملة وتشديد TypeScript
**الهدف:** إزالة الكود الميت والحزم غير المستخدمة والصور اليتيمة لخفض حجم الحزمة وتقليل الضوضاء قبل تعديل المنطق الأساسي.

### المهام التفصيلية
- [x] **1.1 حذف المكونات المهجورة (0 استيراد — 1,343 سطر ميت):**
  - `src/components/BlockingSummaryDrawer.tsx`
  - `src/components/CompositionSidebar.tsx`
  - `src/components/SquareInspectorSidebar.tsx`
- [x] **1.2 إزالة الدوال والاستيرادات الميتة:**
  - إزالة `handleExportPNG` (السطر 3295) و`Info` و`Keyboard` غير المستخدمة في `src/App.tsx`.
  - إزالة `currentProject` (السطر 54) و`ImageIcon`, `Monitor`, `WarningCircle` في `src/components/StudioModals.tsx`.
  - إزالة `Hash` في `src/components/sidebar/GridAndNotesSection.tsx:13`.
  - إزالة الأيقونات غير المستخدمة في `src/components/EngineeringModals.tsx` (`HelpCircle`, `Phone`, `Radio`, `Palette`, `Layers`).
- [x] **1.3 توحيد مكتبة الأيقونات على `@phosphor-icons/react`:**
  - ترحيل الأيقونات المستخدمة في `src/components/EngineeringModals.tsx` و`src/components/ResolumeArenaModal.tsx` من `lucide-react` إلى `@phosphor-icons/react`.
  - إزالة `lucide-react` من `package.json`.
- [x] **1.4 إزالة حزم NPM غير المستخدمة:**
  - إزالة `@google/genai`، `motion`، `dotenv` من `package.json`.
- [x] **1.5 تنظيف الأصول اليتيمة في البناء:**
  - حذف لقطات الشاشة الـ 13 غير المرجَعة في `public/assets/aistudio/` (~893 KB) حتى لا تُنسخ إلى `dist/`.
- [x] **1.6 تشديد إعدادات `tsconfig.json`:**
  - تفعيل `"strict": true`، `"noUnusedLocals": true`، `"noUnusedParameters": true`.

### معيار التحقق (Verification Gate 1)
- [x] نجاح `npm run lint` (`tsc --noEmit`) و`npm run build` بصفر أخطاء وتحذيرات متغير/استيراد ميت.

---

## المرحلة 2: إصلاح خادم الإنتاج والمزامنة اللحظية وجسر Tauri/Archive
**الهدف:** ضمان عمل بيئة الإنتاج (`npm start`)، واستقرار المزامنة عبر التبويبات والنوافذ، وتصحيح أخطاء التخزين والأرشفة.

### المهام التفصيلية
- [x] **2.1 إصلاح تشغيل الإنتاج والتحقق في `server.ts` و`package.json`:**
  - تهيئة مسار `server.ts` ليعمل مباشرة تحت Node 22 ESM (`npm start` عبر `node server.ts`) بتحويل استيرادات الأنواع إلى `import type` وإضافة الامتداد الصريح `./src/types/studio.ts`.
  - استبدال `fs.writeFileSync` في `server.ts` بكتابة ذرية غير متزامنة (`fs.promises.writeFile` لملف مؤقت ثم `rename` عبر طابور تسلسلي) لمنع تجميد الخادم عند حفظ مشاريع فيها صور Base64.
  - إضافة التحقق من صحة المدخلات وحماية مفاتيح النماذج (`__proto__`/`constructor`/`prototype`) في `/api/screens/sync` و`/api/projects`.
- [x] **2.2 سد فجوات المزامنة بين نافذة التحكم وشاشة البث الحي:**
  - إضافة `emitTauriSyncEvent(syncMsg)` عند استئناف البث في `onToggleLiveFrozen` (`src/App.tsx`).
  - تقييد `window.opener.postMessage(hb, window.location.origin)` في `src/components/LiveOutputView.tsx` بدلاً من `'*'`.
  - إضافة مستمع `window.addEventListener('message', ...)` متحقق من `origin` في `src/App.tsx`، وتحسين استعلام `LiveOutputView.tsx` عند غياب `screenId` لتجنب طلب `'screen-1'` إذا حُذفت، مع إضافة إعادة الاتصال التلقائي المتدرج (`es.onerror`) في SSE.
- [x] **2.3 إزالة الآثار الجانبية من داخل State Updaters وتنظيف الذاكرة:**
  - نقل `pushSyncToServer` و`emitLaserMove` من داخل `setScreens(prev => ...)` و`setLaser(prev => ...)` (`src/App.tsx`) إلى معالجات الأحداث باستخدام `screensRef` و`laserRef`.
  - مسح سجل التراجع `historyByScreen` الخاص بالشاشة المحذوفة داخل `handleDeleteScreen` (`src/App.tsx`).
- [x] **2.4 تصحيح `tauriBridge.ts` و`sgdArchive.ts`:**
  - تعديل `saveStudioBinaryFile` (`tauriBridge.ts`) للسقوط الاحتياطي لتنزيل المتصفح عند تعذّر `plugin:dialog|save` (بدلاً من معاملته كإلغاء).
  - إضافة مسار `tauriInvoke` احتياطي في `getAvailableTauriMonitors` (`tauriBridge.ts`).
  - استخدام `buffer.slice(byteOffset, byteOffset + byteLength)` عند إنشاء `Blob` في `tauriBridge.ts` و`sgdArchive.ts`.

### معيار التحقق (Verification Gate 2)
- [x] نجاح `npm run lint` و`npm run build`، واختبار إقلاع `node server.ts` بدون أخطاء.

---

## المرحلة 3: عزل نافذة PiP، إعادة بناء محرك معايرة الألوان، وإدارة ذاكرة Canvas
**الهدف:** جعل بث Picture-in-Picture نظيفاً ومستقراً في كل الأوضاع، وإصلاح فلاتر الألوان لتعمل بدقة عبر WebKit/Chromium دون إفساد الشفافية.

### المهام التفصيلية
- [x] **3.1 عزل نافذة البث العائمة PiP (`src/App.tsx`):**
  - إنشاء عنصر `<canvas>` مخصّص ومخفي للبث النظيف (`isLiveOutput: true`) مرتبط بـ `<video ref={pipVideoRef}>` في موقع ثابت خارج التفرعات الشرطية (`isPureWallMode`, `isInAppLiveOutput`, `isPanoramicWallView`) حتى لا ينقطع البث عند تبديل أوضاع العرض ولا تتسرب حدود التحرير إلى OBS/Resolume.
  - إيقاف جميع مسارات `stream.getTracks().forEach(t => t.stop())` وتفريغ `video.srcObject = null` عند إغلاق PiP أو فك التركيب.
- [x] **3.2 إعادة بناء `applyCanvasColorCalibration` (`src/utils/gridEngine.ts:1069-1140`):**
  - استبدال الرسم الذاتي الهش (`ctx.filter` + `drawImage(ctx.canvas, 0, 0)`) بمعالجة لونية متوافقة مع WebKit/Tauri (معالجة WebGL Offscreen سريعة أو معالجة Pixel LUT بالبيانات عند الحاجة) تدعم:
    1. منحنى `Gamma` غير خطي حقيقي (`pow(v, 1 / gamma)`).
    2. تطبيق تعديل القنوات (`R/G/B/Luma`) وحرارة اللون دون تلويث الخلفية الشفافة (`bgKeyMode === 'alpha'`) بالأسود المعتم.
  - تصفير `uncalibratedSnapshot.width = 0; height = 0` بعد انتهاء Split Compare لتحرير ذاكرة GPU فوراً.
- [x] **3.3 تحسين إدارة ذاكرة الـ Canvas عند الدقات الكبيرة (8K/16K):**
  - تحرير الألواح المؤقتة (`offCanvas`, `subCanvas`) بتصفير أبعادها مباشرة بعد استدعاء `toBlob` أو `drawImage` في `gridEngine.ts` و`resolumeBridge.ts`.

### معيار التحقق (Verification Gate 3)
- [x] نجاح `npm run lint` و`npm run build` والتحقق من سلامة مسار PiP ومعايرة الألوان وتحرير ذاكرة الـ Canvas.

---

## المرحلة 4: إصلاح تكامل Resolume Arena، تصدير After Effects، الترجمة، وCSS
**الهدف:** معالجة عدم تطابق المقاييس مع Resolume، وتحسين موثوقية التصدير والواجهة ثنائية اللغة.

### المهام التفصيلية
- [x] **4.1 توحيد مقياس Resolume XML وPNG فوق 8192px (`resolumeBridge.ts`, `gridEngine.ts`):**
  - توحيد الحساب عند تجاوز دقة الجدار `8192px` بحيث تعكس `<InputRect>` و`Composition` في XML أبعاد ملف الـ Atlas المصغّر أو توفر وضع تصدير `1:1 Per-Screen PNGs + Unscaled XML` كخيار افتراضي دقيق مع إظهار تنبيه واضح للمستخدم عند التصغير.
  - احترام ترتيب الطبقات `wallZIndex` عند رسم الـ Composite Wall Map في `exportAllScreensPixelMapPack`.
- [x] **4.2 حسم طبقة Resolume Arena 7 REST API (`resolumeBridge.ts`, `ResolumeArenaModal.tsx`):**
  - ربط `onMatchActiveScreenResolution` فعلياً في الواجهة أو إزالته إذا لم يعد مطلوباً.
  - معالجة الدوال غير المستدعاة (`fetchResolumeArenaStatus`, `triggerResolumeArenaColumn`, إلخ): إما ربطها عبر بروكسي `/api/resolume/*` في `server.ts` لتفادي قيود CORS وتفعيل التحكم الحي داخل `ResolumeArenaModal.tsx`، أو تنظيفها كودياً إذا تقرر الاكتفاء ببث PiP وملفات XML.
- [x] **4.3 تحسين مولد After Effects ExtendScript (`gridEngine.ts:3647-3709`):**
  - تهريب كامل لمحارف النصوص (`\`, `\n`, `\r`, `"`, `'`) في أسماء الطبقات والتعليقات.
  - إضافة حماية من تجميد After Effects في الشبكات الكثيفة (تحذير/خيار تجميع أو حد عتبة للطبقات الفردية).
- [x] **4.4 استكمال الترجمة (`i18n`) وإصلاح `NumericInput` و`index.css`:**
  - تمرير `lang` إلى `TechnicalPatchSheetModal` وترجمة جميع نصوصه وشارة `[مقفلة]` على الـ Canvas وأسماء القوالب الافتراضية.
  - ضبط `inputMode={isFloat ? 'decimal' : 'numeric'}` في `src/components/NumericInput.tsx:134`.
  - إزالة قواعد `!important` المتعارضة في `src/index.css:44-125` واستبدالها بأصناف موحدة صريحة في المكوّنات بحيث يطابق JSX الشكل الفعلي.

### معيار التحقق (Verification Gate 4)
- [x] فحص تصدير Resolume XML/PNG، وتوليد `.jsx` لـ After Effects، والتبديل الكامل بين `AR` و`EN` في الواجهة والمطبوعات (`npm run lint` و`npm run build` بصفر أخطاء).

---

## المرحلة 5: التفكيك المعماري لـ `App.tsx` وحسم بنية Tauri v2 وNDI
**الهدف:** تحويل الكود الضخم إلى وحدات قابلة للصيانة والاختبار، وإكمال/تأمين طبقة تطبيق سطح المكتب.

### المهام التفصيلية
- [x] **5.1 تفكيك `src/App.tsx` (6,075 سطر) إلى Hooks ووحدات:**
  - `src/hooks/useWorkspaceSync.ts` (المزامنة عبر SSE و`BroadcastChannel` وTauri Events وServer Sync).
  - `src/hooks/useWorkspaceStorage.ts` (الحفظ، التحميل، سجل التراجع لكل شاشة، والاستيراد/التصدير).
  - `src/hooks/useCanvasInteraction.ts` (حساب الإحداثيات، السحب، التكبير، المساطر، وقائمة السياق).
  - `src/hooks/useLaserAndDrawing.ts` (أداة الليزر الحي، الذيل الضوئي، والرسم الحر).
- [x] **5.2 تقسيم `src/utils/gridEngine.ts` (3,832 سطر):**
  - فصله إلى: `gridMath.ts`، `canvasRenderer.ts`، `colorCalibration.ts`، `exporters.ts`.
- [x] **5.3 استكمال وتأمين حزمة Tauri v2 وNDI:**
  - إضافة آلية `in-flight lock` لمنع تكدس إطارات NDI في `tauriBridge.ts:544-597` وتصفير `ndiScratchCanvas` عند التوقف.
  - تشديد صلاحيات `src-tauri/tauri.conf.json` و`capabilities/default.json` (تحديد سياسة CSP، وتضييق `fs:scope` و`assetProtocol.scope` من `**` إلى مسارات العمل المصرّح بها، وتحديد النوافذ المسموح لها بالصلاحيات الخطرة).
  - إضافة ملفات Rust المفقودة في `src-tauri/` (`Cargo.toml`, `build.rs`, `src/main.rs`, `src/lib.rs`) وتوضيح/تفعيل ميزة NDI عبر `grafton-ndi` خلف Feature Flag اختياري لتوثيق متطلب NewTek NDI SDK عند البناء الأصلي.
- [x] **5.4 مراجعة `vite.config.ts`:**
  - استبدال تعديل نص `/@vite/client` بطبقة إعداد متوافقة أو إبقائها موثقة ومعزولة لبيئة المعاينة فقط.

### معيار التحقق (Verification Gate 5)
- [x] نجاح `npm run lint` (`tsc --noEmit`) و`npm run build` وإقلاع `npm start` (`node server.ts`) ومراجعة قابلية الصيانة (ملاحظة: أداة `cargo check` غير مثبّتة في حاوية Node الحالية، وتُشغَّل عند البناء الأصلي على بيئة تحتوي على Rust + NewTek NDI SDK).
