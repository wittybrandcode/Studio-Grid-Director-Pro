---
name: sgd-after-effects-ui-design
description: الدليل الهندسي الشامل (Design System & AI Skill) لتصميم واجهات إضافات Adobe After Effects (CEP / UXP / React) وبرامج البث والمونتاج الاحترافية بنفس الهوية البصرية، الألوان، الأزرار المقسمة لونياً، والأيقونات الخاصة بتطبيق Studio Grid Director Pro (SGD).
---

# SGD Pro UI — After Effects Extension & Broadcast Tool Design Skill

استخدم هذا الدليل المرجعي (`SKILL.md`) عند بناء أو تصميم أي إضافة لبرنامج **Adobe After Effects (CEP / UXP / ScriptUI Webview)** أو تطبيقات الهندسة البصرية والمونتاج والبث التلفزيوني، لضمان مطابقة الواجهة تماماً لهوية **Studio Grid Director Pro (SGD)** من حيث الصرامة الهندسية، الألوان الداكنة المريحة للعين، الأزرار التكتيكية، وتقسيم الأيقونات حسب الوظيفة بألوان مميزة.

---

## 1. الفلسفة الهندسية العامة (Core Design Constitution)

1. **زوايا حادة بالكامل (Zero-Radius Geometry — `0px` Everywhere)**
   - **قاعدة صارمة**: يُمنع استخدام الحواف الدائرية نهائياً في أي عنصر (`border-radius: 0px` أو `rounded-none` في Tailwind).
   - جميع الأزرار، الحقول، القوائم المنسدلة، النوافذ المنبثقة، التبويبات، ومربعات الألوان يجب أن تكون مربعة أو مستطيلة بحواف حادة 90 درجة مثل واجهات **After Effects / DaVinci Resolve / Ross Carbonite**.

2. **كثافة بصرية مدمجة مناسبة للوحات After Effects (High-Density Dockable Panel)**
   - ارتفاع الهيدر العلوي: `44px` (`h-11`).
   - حجم أزرار الأيقونات القياسي: `28px × 28px` (`w-7 h-7`) أو `24px × 24px` (`w-6 h-6`) للأشرطة الفرعية.
   - حجم الأيقونة داخل الزر: `16px × 16px` (`w-4 h-4`) أو `14px × 14px` (`w-3.5 h-3.5`).
   - المسافات الداخلية (Padding) مدمجة ودقيقة (`p-2` إلى `p-2.5`، والفراغات بين الأزرار `gap-1` أي `4px`).

3. **أشرطة أدوات بأيقونات صافية دون نصوص مزدحمة (100% Icon-Only Action Bars)**
   - أشرطة الأدوات العلوية والسفلية تعرض **أيقونات فقط** مع تلميحات غنية (`title` / Tooltip) بصيغة:
     `[اسم القسم] وظيفة الزر بالتفصيل (اختصار لوحة المفاتيح)`
     مثال: `[أدوات التفاعل] أداة التحديد المستطيل (Box Select - B)`.

4. **حدود تقنية واضحة بدلاً من الظلال الضبابية (1px Crisp Technical Borders)**
   - يُفصل بين كل قسم وآخر بحدود `1px solid` واضحة، مع شريط علوي ملون بسمك `2px` (`border-t-2`) أعلى كل مجموعة أيقونات لتحديد هويتها اللونية فوراً.

---

## 2. نظام الألوان الكامل (Master Color Palette — HEX Tokens)

### أ. الهوية واللون المشع الرئيسي (Brand Signature)
| العنصر | كود اللون (HEX) | الاستخدام |
| :--- | :--- | :--- |
| **الأخضر المشع (SGD Radiant Green)** | `#8CC63F` | شعار الأداة، مؤشرات التفعيل، قسم الإظهار/الإخفاء، وحالة الاتصال الحي |
| **توهج الشعار (Brand Glow)** | `rgba(140, 198, 63, 0.38)` | ظل نصي خفيف للشعار أو العناصر المفعلة بقوة |
| **حبر داكن فوق الأخضر** | `#0E1706` | لون الأيقونة أو النص عندما تكون الخلفية `#8CC63F` |

### ب. تدريج الخلفيات والأسطح الداكنة (5-Tier Charcoal Surfaces)
| الطبقة | كود اللون (HEX) | الاستخدام في واجهة الإضافة |
| :--- | :--- | :--- |
| **خلفية الفراغ / الحقل (Deepest Void)** | `#14171C` / `#181A1F` | خلفية حقول الإدخال النصية والرقمية وخلفية شاشة العمل |
| **خلفية المسرح والنافذة العامة** | `#1E2126` / `#22252A` | الخلفية الأساسية للنافذة (بنمط نقطي خفيف اختياري) |
| **خلفية القائمة الجانبية (Sidebar)** | `#242830` | خلفية لوحة التحكم الجانبية والأقسام القابلة للطي |
| **خلفية الهيدر والشريط العائم** | `#2A2E37` / `#2C3038` | الهيدر العلوي، الشريط السفلي، ورؤوس الأقسام (Accordions) |
| **خلفية النوافذ المنبثقة (Popovers)** | `#1F232B` / `#202329` | القوائم المنبثقة السريعة وقوائم النقر بالزر الأيمن |

### ج. الحدود والفواصل (Technical Borders & Hairlines)
| النوع | كود اللون (HEX) | الاستخدام |
| :--- | :--- | :--- |
| **حدود داخلية هادئة** | `#3A3E47` | حدود الأزرار الفضية الداخلية والفواصل الفرعية |
| **حدود قياسية للأقسام** | `#434853` | حدود الهيدر، الحقول، والفواصل العمودية (`w-px h-4`) |
| **حدود بارزة للشريط العائم** | `#494F5C` / `#525866` | حدود الشريط السفلي العائم والنوافذ المنبثقة |

### د. النصوص والأزرار التكتيكية الفضية (Typography & Tactile Silver Buttons)
| العنصر | كود اللون (HEX) | الاستخدام |
| :--- | :--- | :--- |
| **النص الأساسي (Primary Text)** | `#DCE0E8` | العناوين، أسماء الطبقات، والقيم الرئيسية |
| **النص الثانوي (Secondary Text)** | `#B8BEC9` | التسميات الفرعية والأوصاف |
| **النص الهادئ (Muted Text)** | `#8E95A2` | العناصر غير المفعلة أو النصوص الإرشادية (`placeholder`) |
| **زر فضي قياسي (Tactile Button)** | `#B4BAC6` (Hover: `#C8CDD8`) | الأزرار الداخلية داخل القوائم (مع نص وأيقونة داكنة `#1C1E22`) |
| **زر فضي بارز (Primary Silver CTA)** | `#C8CDD8` (Hover: `#D4D9E2`) | أزرار الحفظ والتأكيد داخل النوافذ (مع نص داكن `#1C1E22`) |

---

## 3. نظام تقسيم الأيقونات حسب الوظيفة بالألوان (Color-Coded Icon Banks)

هذه هي السمة الأبرز في الواجهة: **لا توضع جميع الأيقونات بلون رمادي واحد**، بل تُجمع كل فئة وظيفية داخل حاوية صغيرة (`p-0.5 border border-t-2`) لها لونها الخاص:

### 1) فئة أدوات التفاعل، الرسم، والملفات — **الأزرق السماوي (Cyan `#38BDF8`)**
تُستخدم لأدوات المؤشر (Select, Box, Pen, Laser, Hand) وكذلك لإدارة ملفات المشروع (فتح، حفظ، استيراد، تصدير JSON).
- **الحاوية (Bank Container)**:
  `bg-[#14202B] border border-[#263E52] border-t-2 border-t-[#38BDF8] p-0.5 flex items-center gap-1`
- **الزر العادي (Inactive Button)**:
  `bg-[#1B2C3B] hover:bg-[#274056] border border-[#2C4C66] text-[#7DD3FC] hover:text-[#E0F2FE]`
- **الزر النشط (Active Tool)**:
  `bg-[#38BDF8] text-[#09131C] border border-[#E0F2FE] ring-1 ring-[#38BDF8]`

### 2) فئة الإظهار والإخفاء للعناصر والطبقات — **الأخضر المشع (Radiant Green `#8CC63F`)**
تُستخدم حصرياً لجميع مفاتيح إظهار/إخفاء العناصر (المساطر، الشبكة، خطي المركز، الدائرة، مناطق الأمان، العناوين، الساعة، إلخ).
- **الحاوية (Bank Container)**:
  `bg-[#162011] border border-[#304622] border-t-2 border-t-[#8CC63F] p-0.5 flex items-center gap-1`
- **الزر عند الإخفاء (Hidden / OFF)**:
  `bg-[#1D2817] hover:bg-[#2A3B21] border border-[#384F2A] text-[#8CC63F]/80 hover:text-[#BEF264]`
- **الزر عند الإظهار (Visible / ON)**:
  `bg-[#8CC63F] text-[#0E1706] border border-[#ECFCCB] ring-1 ring-[#8CC63F]`
  *(مع إضافة نقطة سوداء صغيرة في الزاوية العلوية اليمنى `w-1.5 h-1.5 bg-[#0E1706]` لتأكيد التفعيل).*

### 3) فئة التكبير، الملاحة، الرادار، والتقارير الهندسية — **الكهرماني الذهبي (Amber `#F59E0B`)**
تُستخدم لأدوات الزوم (`-`, `+`, `Fit`, `1:1`)، البحث والقفز السريع، الرادار المصغر، وتصدير الصور والتقارير الهندسية.
- **الحاوية (Bank Container)**:
  `bg-[#241C11] border border-[#4D391D] border-t-2 border-t-[#F59E0B] p-0.5 flex items-center gap-1`
- **الزر العادي (Inactive Button)**:
  `bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] hover:text-[#FEF3C7]`
- **الزر النشط (Active State)**:
  `bg-[#F59E0B] text-[#140E05] border border-[#FEF3C7] ring-1 ring-[#FBBF24]`

### 4) فئة سجل التعديلات والنظام والمساعدة — **الفضي المعدني (Slate Silver `#94A3B8`)**
تُستخدم لأزرار التراجع والإعادة (`Undo / Redo`)، لوحة الاختصارات (`?`)، وتبديل اللغة (`AR / EN`).
- **الحاوية (Bank Container)**:
  `bg-[#1D2028] border border-[#3B4252] border-t-2 border-t-[#94A3B8] p-0.5 flex items-center gap-1`
- **الزر (Button)**:
  `bg-[#282D38] hover:bg-[#373E4D] border border-[#475061] text-[#CBD5E1] hover:text-[#FFFFFF] disabled:opacity-35`

### 5) فئة أوضاع المسرح والمعاينة — **البنفسجي الملكي (Violet `#A855F7`)**
تُستخدم لأوضاع عرض الكومبوزيشن المتعدد (Multi-Screen Wall)، الوضع النقي الخالي من الواجهات (Pure Mode)، وملء الشاشة.
- **الحاوية (Bank Container)**:
  `bg-[#21152B] border border-[#492C61] border-t-2 border-t-[#A855F7] p-0.5 flex items-center gap-1`
- **الزر العادي (Inactive Button)**:
  `bg-[#2D1D3E] hover:bg-[#3E2754] border border-[#58387A] text-[#D8B4FE] hover:text-[#F3E8FF]`
- **الزر النشط (Active View)**:
  `bg-[#A855F7] text-[#FFFFFF] border border-[#F3E8FF] ring-1 ring-[#C084FC]`

### 6) فئة البث المباشر، الرندر، والومضة التعريفية — **القرمزي البثّي (Broadcast Crimson `#F43F5E`)**
تُستخدم للأوامر الحية الحرجة مثل إرسال ومضة تعريفية للشاشة، تثبيت التنبيه، أو إطلاق الرندر/العرض المباشر في After Effects.
- **الحاوية (Bank Container)**:
  `bg-[#29141C] border border-[#5E283A] border-t-2 border-t-[#F43F5E] p-0.5 flex items-center gap-1`
- **الزر العادي (Action Button)**:
  `bg-[#3B1B25] hover:bg-[#522433] border border-[#733244] text-[#FDA4AF] hover:text-[#FFE4E6]`
- **زر الإطلاق الرئيسي (Primary Live / Execute Button)**:
  `bg-[#E11D48] hover:bg-[#F43F5E] border border-[#FDA4AF] text-[#FFFFFF]`

---

## 4. الخطوط، الأيقونات، وشارات القراءة الهندسية (Typography & Iconography)

1. **مكتبة الأيقونات المعتمدة**:
   - `@phosphor-icons/react`
   - الوزن الافتراضي: `weight="bold"` (يعطي سماكة واضحة تشبه أيقونات برامج التصميم الهندسية).
   - عند التفعيل: يتحول الوزن إلى `weight="fill"`.

2. **الخطوط (Fonts)**:
   - **خط الواجهة العربي/الإنجليزي**: `'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif`.
   - **خط الأرقام والبيانات الهندسية (Telemetry & Coordinates)**: `'JetBrains Mono', 'IBM Plex Mono', monospace` مع إجبار الاتجاه `dir="ltr"` دائماً للأرقام والأكواد حتى داخل الواجهة العربية.

3. **خانة معلومات الحالة في أقصى الهيدر (Header Telemetry Box)**:
   - توضع في أقصى طرف الهيدر (`ms-auto`) بخلفية `#1E2128` وحدود `#434853`، وتعرض البيانات بألوان دلالية ثابتة:
     - نقطة الحالة الحية: أخضر `#8CC63F` (متصل/نشط) أو رمادي `#8E95A2` (في الانتظار).
     - اسم الكومبوزيشن/الشاشة: أبيض عريض `#DCE0E8`.
     - الدقة بالبكسل (`1920×1080px`): رمادي فاتح `#B8BEC9`.
     - القياس الفيزيائي أو الفريمات (`25fps · 00:01:12:04`): أصفر هندسي `#FEF08A`.
     - عدد العناصر/الطبقات المحددة: سماوي `#38BDF8`.

---

## 5. قوالب الكود الجاهزة للنسخ (Copy-Paste Component Blueprints)

### أ. متغيرات CSS القياسية (لإضافات After Effects بدون Tailwind أو معه)
```css
:root {
  /* Brand */
  --sgd-brand-green: #8CC63F;
  --sgd-brand-glow: rgba(140, 198, 63, 0.38);

  /* Surfaces */
  --sgd-bg-void: #14171C;
  --sgd-bg-stage: #1E2126;
  --sgd-bg-app: #22252A;
  --sgd-bg-sidebar: #242830;
  --sgd-bg-header: #2A2E37;
  --sgd-bg-popover: #1F232B;

  /* Borders */
  --sgd-border-subtle: #3A3E47;
  --sgd-border-default: #434853;
  --sgd-border-strong: #494F5C;

  /* Text */
  --sgd-text-primary: #DCE0E8;
  --sgd-text-secondary: #B8BEC9;
  --sgd-text-muted: #8E95A2;
  --sgd-text-dark: #1C1E22;

  /* Category Accents */
  --sgd-cat-tools-cyan: #38BDF8;
  --sgd-cat-history-slate: #94A3B8;
  --sgd-cat-zoom-amber: #F59E0B;
  --sgd-cat-visibility-green: #8CC63F;
  --sgd-cat-stage-violet: #A855F7;
  --sgd-cat-live-crimson: #F43F5E;
}

* {
  border-radius: 0px !important;
  box-sizing: border-box;
  user-select: none;
}
```

### ب. قالب الهيدر العلوي مع شعار `#8CC63F` وخانة المعلومات (React + Tailwind)
```tsx
<header className="h-11 shrink-0 flex items-center justify-start gap-1.5 px-3 bg-[#2A2E37] border-b border-[#434853] overflow-x-auto">
  {/* Brand Badge: Thick Radiant Green (#8CC63F) */}
  <div
    title="Studio Grid Director Pro"
    className="group relative h-8 px-3 bg-[#181B20] hover:bg-[#222730] border border-[#8CC63F]/65 hover:border-[#8CC63F] rounded-none flex items-center justify-center shrink-0 transition-colors"
  >
    <span
      dir="ltr"
      style={{
        color: '#8CC63F',
        WebkitTextStroke: '0.45px #8CC63F',
        textShadow: '0 0 8px rgba(140, 198, 63, 0.38)',
      }}
      className="font-display text-[15px] font-black tracking-[0.14em] leading-none"
    >
      SGD
    </span>
  </div>

  <div className="h-5 w-px bg-[#434853] mx-0.5 shrink-0" />

  {/* Cyan Bank: Project & Comp Files */}
  <div className="flex items-center gap-1 p-0.5 bg-[#14202B] border border-[#263E52] border-t-2 border-t-[#38BDF8] shrink-0">
    <button className="w-7 h-7 flex items-center justify-center rounded-none bg-[#1B2C3B] hover:bg-[#274056] border border-[#2C4C66] text-[#7DD3FC] hover:text-[#E0F2FE] cursor-pointer">
      <Folders weight="bold" className="w-4 h-4" />
    </button>
    <button className="w-7 h-7 flex items-center justify-center rounded-none bg-[#1B2C3B] hover:bg-[#274056] border border-[#2C4C66] text-[#7DD3FC] hover:text-[#E0F2FE] cursor-pointer">
      <FloppyDisk weight="bold" className="w-4 h-4" />
    </button>
  </div>

  {/* Amber Bank: Export & Reports */}
  <div className="flex items-center gap-1 p-0.5 bg-[#241C11] border border-[#4D391D] border-t-2 border-t-[#F59E0B] shrink-0">
    <button className="w-7 h-7 flex items-center justify-center rounded-none bg-[#332615] hover:bg-[#47351D] border border-[#664B24] text-[#FCD34D] hover:text-[#FEF3C7] cursor-pointer">
      <Camera weight="bold" className="w-4 h-4" />
    </button>
  </div>

  {/* Far-Left Telemetry Box */}
  <div className="ms-auto h-8 flex items-center gap-2.5 px-3 rounded-none bg-[#1E2128] border border-[#434853] text-xs whitespace-nowrap shrink-0">
    <span className="w-2 h-2 rounded-none bg-[#8CC63F] shrink-0" />
    <span className="font-bold text-[#DCE0E8]">Comp 1</span>
    <span dir="ltr" className="font-mono text-[11px] text-[#B8BEC9]">1920×1080px</span>
    <span dir="ltr" className="font-mono text-[11px] text-[#FEF08A] font-bold">(60fps · 8bpc)</span>
    <span dir="ltr" className="font-mono text-[10px] text-[#38BDF8]">12 Layers</span>
  </div>
</header>
```

### ج. قالب قسم الإظهار والإخفاء في الشريط السفلي (Radiant Green Show/Hide Strip)
```tsx
{/* Show/Hide Elements Bank — Radiant Green (#8CC63F) */}
<div className="flex items-center gap-1 p-0.5 bg-[#162011] border border-[#304622] border-t-2 border-t-[#8CC63F]">
  {items.map(({ id, active, title, Icon, onClick }) => (
    <button
      key={id}
      type="button"
      onClick={onClick}
      title={title}
      className={`relative w-7 h-7 flex items-center justify-center rounded-none border cursor-pointer transition-colors ${
        active
          ? 'bg-[#8CC63F] text-[#0E1706] border-[#ECFCCB] ring-1 ring-[#8CC63F]'
          : 'bg-[#1D2817] hover:bg-[#2A3B21] text-[#8CC63F]/80 hover:text-[#BEF264] border-[#384F2A]'
      }`}
    >
      <Icon weight={active ? 'fill' : 'bold'} className="w-4 h-4" />
      {active && (
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-[#0E1706] rounded-none" />
      )}
    </button>
  ))}
</div>
```

### د. قالب التبويبات الخمسة العلوية في القائمة الجانبية (5-Tab Sidebar Navigation)
```tsx
<div className="grid grid-cols-5 border-b border-[#3A3E47] bg-[#202328]">
  {tabs.map(({ id, shortLabel, Icon, badge, isActive }) => (
    <button
      key={id}
      type="button"
      className={`relative py-2 px-1 flex flex-col items-center justify-center gap-1 rounded-none border-l last:border-l-0 border-[#3A3E47] cursor-pointer transition-colors ${
        isActive
          ? 'bg-[#2C313B] text-[#FFFFFF] font-bold'
          : 'bg-[#20232A] hover:bg-[#282C35] text-[#AEB5C2] hover:text-[#DCE0E8]'
      }`}
    >
      <div className="flex items-center gap-1">
        <Icon weight={isActive ? 'fill' : 'bold'} className={`w-4 h-4 ${isActive ? 'text-[#38BDF8]' : ''}`} />
        {badge > 0 && (
          <span className={`px-1 text-[9px] font-mono font-bold rounded-none ${
            isActive ? 'bg-[#38BDF8] text-[#111317]' : 'bg-[#181A20] text-[#DCE0E8]'
          }`}>
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] leading-tight truncate">{shortLabel}</span>
      {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#38BDF8]" />}
    </button>
  ))}
</div>
```

### هـ. قالب الصناديق القابلة للطي داخل القائمة الجانبية (Collapsible Accordion Card)
```tsx
<section className="rounded-none bg-[#2A2D34] border border-[#434853]">
  <header className="w-full flex items-center justify-between px-2.5 py-2 bg-[#2F333B] border-b border-[#434853]">
    <div className="flex items-center gap-1.5 text-xs font-bold text-[#DCE0E8]">
      <Ruler weight="bold" className="w-4 h-4 text-[#38BDF8]" />
      <span>إعدادات الشبكة والمحاذاة</span>
    </div>
    <CaretDown weight="bold" className="w-3.5 h-3.5 text-[#B8BEC9]" />
  </header>
  <div className="p-2.5 space-y-2 text-xs">
    {/* الحقول والأزرار التكتيكية الفضية */}
    <div className="grid grid-cols-2 gap-1.5">
      <div className="bg-[#202328] border border-[#3F444E] p-1.5">
        <label className="block text-[10px] text-[#B8BEC9] mb-1">العرض (Width)</label>
        <input
          type="number"
          dir="ltr"
          className="w-full bg-[#16181D] border border-[#434853] focus:border-[#38BDF8] px-2 py-1 text-xs font-mono text-[#DCE0E8] outline-none rounded-none"
          defaultValue={1920}
        />
      </div>
    </div>
  </div>
</section>
```

---

## 6. قائمة التحقق الذاتية عند توليد أي واجهة جديدة بهذا النمط (Checklist)

- [ ] هل جميع الحواف حادة `0px` (`rounded-none`) بدون أي استثناء؟
- [ ] هل الشعار وعناصر التفعيل البصرية تستخدم اللون الأخضر المشع `#8CC63F`؟
- [ ] هل تم تقسيم أشرطة الأيقونات إلى مجموعات لونية واضحة (`#38BDF8` للأدوات والملفات، `#8CC63F` للإظهار والإخفاء، `#F59E0B` للزوم والتقارير، `#94A3B8` للتراجع والنظام، `#A855F7` للمسرح، `#F43F5E` للبث والرندر) مع شريط علوي `border-t-2` لكل مجموعة؟
- [ ] هل جميع الأرقام والإحداثيات تستخدم خط `font-mono` مع `dir="ltr"`؟
- [ ] هل أشرطة الأدوات العلوية والسفلية خالية من النصوص المزدحمة وتعتمد على أيقونات `@phosphor-icons/react` بوزن `bold` أو `fill` مع تلميحات `title` واضحة؟
