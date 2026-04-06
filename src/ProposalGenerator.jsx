import { useState, useCallback, useRef } from "react";
import { generateDocx } from "./exportDocx";

// ============================================================
// SERVICE TEMPLATES - Based on actual proposals analyzed
// ============================================================
const SERVICE_TEMPLATES = {
  social_management: {
    label: "ניהול סושיאל",
    labelEn: "Social Media Management",
    platforms: ["Facebook", "Instagram", "TikTok", "LinkedIn"],
    setupItems: [
      "גיבוש אסטרטגיית תוכן",
      "מחקר מתחרים וקהל יעד",
      "איסוף חומרי גרפיקה על המותג",
      "גיבוש שפה ייחודית למותג",
      "בניית עוגני תוכן",
      "הטמעת הרעיון העיצובי",
      "חיבור לכלי ניטור ומעקב",
    ],
    managementItems: {
      facebook_instagram: [
        "הזנת תכנים סטטיים, תמונות, סרטונים וכו'",
        "העלאת פוסטים לעמוד בתדירות של {frequency} פוסטים {frequencyUnit}, בהתאם לעוגני התוכן.",
        "בניית תכניות תוכן חודשיות - קריאייטיב, ניסוח פוסטים, בחירת תמונות, קביעת לוחות זמנים לביצוע והעלאת הפוסטים.",
        "ייזום והעלאת רעיונות לפעילויות שוטפות.",
        "שליחת דו\"ח חודשי עד העשירי בחודש.",
      ],
      tiktok: [
        "עריכת סרטוני וידאו",
        "עריכה והעלאת סרטונים לעמוד בתדירות של {frequency} פוסטים {frequencyUnit}, בהתאם לעוגני התוכן.",
        "בניית תכניות תוכן חודשיות - קריאייטיב, בחירת סרטונים, קביעת לוחות זמנים לביצוע והעלאת הסרטונים.",
        "ייזום והעלאת רעיונות לפעילויות שוטפות.",
        "שליחת דו\"ח חודשי עד העשירי בחודש.",
      ],
      linkedin: [
        "הזנת תכנים סטטיים, תמונות, סרטונים וכו'",
        "העלאת פוסטים לעמוד בתדירות של {frequency} פוסטים {frequencyUnit}, בהתאם לעוגני התוכן.",
        "בניית תכניות תוכן חודשיות - קריאייטיב, ניסוח פוסטים, בחירת תמונות, קביעת לוחות זמנים לביצוע והעלאת הפוסטים.",
        "ייזום והעלאת רעיונות לפעילויות שוטפות.",
        "שליחת דו\"ח חודשי עד העשירי בחודש.",
      ],
    },
  },
  campaigns_meta: {
    label: "קמפיינים במטא",
    labelEn: "Meta Campaigns",
    setupItems: [
      "פתיחת חשבונות מפרסם *בבעלות הלקוח",
      "מחקר קהלים וקבוצות",
      "מיקוד קהל היעד",
      "חיבור לביזנס מנג'ר",
      "בניית קבוצות מודעות",
      "כתיבת טקסט ובניית מודעות",
      "העלאת דטאות",
      "בניית קהלים דומים",
      "בניית קהלים לפי תחומי עניין",
      "בניית קהלים לפי דמוגרפיה",
      "בניית קהלים בהתבסס על דאטה",
      "בניית קמפיינים וקבוצות מודעות",
      "הטמעת קודי המרה",
      "הטמעת קודי רימרקטינג",
      "הגדרות רשימות רימרקטינג",
      "הגדרת מעקב המרות ואירועים",
      "קריאייטיב ובניית מודעות",
    ],
    managementItems: [
      "פיקוח על הקמפיינים וביצוע שינויים בהתאם לביצועים",
      "מעקב אחר יעילות המודעות, הביטויים והפלייסמנטים ועריכתם בהתאם",
      "ניתוח תנועת הגולשים בקמפיינים",
      "ביצוע אופטימיזציה שוטפת לקמפיינים",
      "סינכרון בין קמפיינים בערוצים קיימים",
      "הפקת דו\"ח חודשי ללקוח",
      "שיחה חודשית עם הלקוח",
    ],
  },
  campaigns_google: {
    label: "קמפיינים בגוגל",
    labelEn: "Google Campaigns",
    setupItems: [
      "פתיחת חשבון פרסום בגוגל",
      "מחקר מילים בגוגל",
      "מחקר קהלים",
      "מיקוד קהל היעד",
      "בניית קמפיינים לפי אובג'קטיב",
      "בניית קבוצות מודעות",
      "קופירייטינג ובניית מודעות",
      "העלאת דטאות",
      "שתילת גוגל טג באתר",
    ],
    managementItems: [
      "פיקוח על הקמפיינים וביצוע שינויים בהתאם לביצועים",
      "מעקב אחר יעילות המודעות, הקהלים והפלייסמנטים ועריכתם בהתאם",
      "ניתוח תנועת הגולשים מהקמפיין",
      "ביצוע אופטימיזציה מקיפה לקמפיינים",
      "סינכרון בין קמפיינים קיימים",
      "הפקת דו\"ח חודשי ללקוח",
      "שיחה חודשית עם הלקוח",
    ],
  },
  campaigns_tiktok: {
    label: "קמפיינים בטיקטוק",
    labelEn: "TikTok Campaigns",
    setupItems: [
      "פתיחת חשבון מודעות בטיקטוק",
      "מחקר קהלים",
      "מיקוד קהל היעד",
      "חיבור לביזנס סנטר",
      "בניית קמפיינים",
      "בניית קבוצות מודעות",
      "קופירייטינג ובניית מודעות",
      "הטמעת טיקטוק פיקסל באתר/דף נחיתה",
      "בניית קהלים לפי תחומי עניין",
      "בניית קהלים לפי דמוגרפיה",
    ],
    managementItems: [
      "פיקוח על הקמפיינים וביצוע שינויים בהתאם לביצועים",
      "מעקב אחר יעילות המודעות, הקהלים והפלייסמנטים ועריכתם בהתאם",
      "ניתוח תנועת הגולשים מהקמפיין",
      "ביצוע אופטימיזציה מקיפה לקמפיינים",
      "סינכרון בין קמפיינים קיימים",
      "הפקת דו\"ח חודשי ללקוח",
      "שיחה חודשית עם הלקוח",
    ],
  },
  linkedin_network: {
    label: "הגדלת רשת לינקדאין",
    labelEn: "LinkedIn Network Growth",
    setupItems: [
      "מחקר ואיתור קהל היעד המדויק",
      'יצירת רשימות לידים ב-Sales Navigator לפי פרמטרים (תפקיד, תעשייה, מיקום וכו\')',
      "חיבור Sales Navigator ל-Dripify",
      "אפיון ובניית אוטומציה",
      "הגדרת הקמפיין (Sequence) לשליחת בקשות חברות בלבד",
      "הגדרת מגבלות בטיחות למניעת חסימות.",
    ],
    softwareCosts: [
      { name: "לינקדאין סיילס נויגיטור", cost: "119$" },
      { name: "דריפיפיי", cost: "79$" },
    ],
  },
  design_banners: {
    label: "עיצוב באנרים",
    labelEn: "Banner Design",
    items: [
      "עד {bannerCount} באנרים בגודל {bannerSize}",
      "עד 2 סבבי תיקונים",
      "עלות עיצוב באנר נוסף: 300 ₪",
      "עלות הוספת גודל: 150 ₪",
    ],
  },
  design_gifs: {
    label: "עיצוב והפקת GIFs",
    labelEn: "GIF Design & Production",
    items: [
      "GIF טיפוגרפי (Typography-based): הנפשת טקסט קריאטיבית, שימוש בפונטים מותאמים ושמירה על שפה מותגית נקייה ודינמית (6-10 שניות).",
      "סבבי תיקונים: המחיר כולל עד 2 סבבי תיקונים.",
      "פורמטים למסירה: הקבצים יוגשו בפורמט MP4 (להעלאה כווידאו).",
    ],
  },
  video_production: {
    label: "צילום ועריכת סרטונים",
    labelEn: "Video Production",
    items: [
      "יום צילום",
      "עריכת {videoCount} סרטונים עבור הסושיאל",
      "{videoFrequency} לחודש",
    ],
  },
  ai_character: {
    label: "הקמת דמות AI",
    labelEn: "AI Character Creation",
    items: [
      'עיצוב ופיתוח הדמות: יצירת ה-Look & Feel של הדמות באמצעות כלי AI מתקדמים, כולל "אימון" מודל לשמירה על פנים ומראה אחיד בכל הפוסטים.',
      "גיבוש שפה ייחודית: סגנון הדיבור, הערכים והאינטראקציה של הדמות עם הגולשים.",
      "אסטרטגיית תוכן ו-AI: הגדרת תפקיד הדמות (פרזנטור, מומחה תוכן, או דמות לייף-סטייל).",
      "בניית עוגני תוכן: הגדרת נושאים קבועים שהדמות תעסוק בהם.",
    ],
  },
  custom: {
    label: "שירות מותאם אישית",
    labelEn: "Custom Service",
    items: [],
  },
};

const PAYMENT_TERMS_OPTIONS = [
  "תשלום מראש כנגד חשבונית עסקה עד 10 לכל חודש",
  "שוטף 60 כנגד חשבונית עסקה",
  "תשלום כנגד חשבונית עסקה",
  "שוטף 30 כנגד חשבונית עסקה",
];

const DEFAULT_NOTES = [
  { text: "כל המחירים אינם כוללים מע\"מ.", checked: true },
  { text: "אמצעי תשלום: העברה בנקאית / כרטיס אשראי.", checked: true },
  { text: "{paymentTerms}", checked: true },
  { text: "במידה והתשלום לא יועבר במועד יחוייב כרטיס האשראי לביטחון.", checked: true },
  { text: "המחיר אינו כולל רכישת מדיה (פרסום ממומן).", checked: true },
  { text: "התשלום לספק הפרסום עבור הפרסום הינו באחריות הלקוח ואינו כלול בהצעה.", checked: true },
  { text: "סרטונים, מאמרים, תכנות ודפי נחיתה אינם כלולים בהצעה ויתומחרו בנפרד ע\"פי הצורך.", checked: true },
  { text: "מעבר ל-2 סבבי תיקונים – עלות כל סבב תיקונים נוסף 150 ₪", checked: false },
  { text: "מקבל השירות מצהיר כי החומרים המועברים על ידו לנותן השירות (ויז'ואלים או טקסט) נמצאים בבעלותו או יש לו אישור להשתמש בהם עפ\"י חוק זכויות יוצרים.", checked: true },
  { text: "סיום התקשרות יעשה בכתב בהתראה של 30 יום מראש.", checked: true },
  { text: "זמן ההתקשרות המינימלי הינו 3 חודשי עבודה.", checked: false },
  { text: "בסיום ההתקשרות חלק משיטת ומבנה העבודה לרבות סקריפטים וקהלים יוסרו מהחשבון.", checked: false },
];

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ProposalGenerator() {
  const [step, setStep] = useState(1);
  const [proposalData, setProposalData] = useState({
    date: new Date().toLocaleDateString("he-IL"),
    clientName: "",
    clientTitle: "",
    companyName: "",
    subject: "",
    services: [],
    pricingRows: [{ description: "", amount: "", unit: "חודשי", note: "" }],
    totalMonths: "",
    totalAmount: "",
    paymentTerms: PAYMENT_TERMS_OPTIONS[0],
    notes: DEFAULT_NOTES.map((n) => ({ ...n })),
    customNotes: [],
    includeAppendix: true,
    includeSignature: true,
  });

  const [selectedServiceTypes, setSelectedServiceTypes] = useState([]);
  const [serviceConfigs, setServiceConfigs] = useState({});
  const [previewMode, setPreviewMode] = useState(false);

  const updateField = (field, value) => {
    setProposalData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleNote = (idx) => {
    setProposalData((prev) => {
      const notes = [...prev.notes];
      notes[idx] = { ...notes[idx], checked: !notes[idx].checked };
      return { ...prev, notes };
    });
  };

  const addPricingRow = () => {
    setProposalData((prev) => ({
      ...prev,
      pricingRows: [
        ...prev.pricingRows,
        { description: "", amount: "", unit: "חודשי", note: "" },
      ],
    }));
  };

  const updatePricingRow = (idx, field, value) => {
    setProposalData((prev) => {
      const rows = [...prev.pricingRows];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, pricingRows: rows };
    });
  };

  const removePricingRow = (idx) => {
    setProposalData((prev) => ({
      ...prev,
      pricingRows: prev.pricingRows.filter((_, i) => i !== idx),
    }));
  };

  const toggleServiceType = (key) => {
    setSelectedServiceTypes((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  };

  const updateServiceConfig = (serviceKey, field, value) => {
    setServiceConfigs((prev) => ({
      ...prev,
      [serviceKey]: { ...(prev[serviceKey] || {}), [field]: value },
    }));
  };

  const toggleServiceItem = (serviceKey, section, idx) => {
    setServiceConfigs((prev) => {
      const config = prev[serviceKey] || {};
      const excluded = config.excludedItems || {};
      const sectionExcluded = excluded[section] || [];
      const newSectionExcluded = sectionExcluded.includes(idx)
        ? sectionExcluded.filter((i) => i !== idx)
        : [...sectionExcluded, idx];
      return {
        ...prev,
        [serviceKey]: {
          ...config,
          excludedItems: { ...excluded, [section]: newSectionExcluded },
        },
      };
    });
  };

  const isItemExcluded = (serviceKey, section, idx) => {
    return (
      serviceConfigs[serviceKey]?.excludedItems?.[section]?.includes(idx) || false
    );
  };

  // Generate preview content
  const generatePreviewContent = () => {
    const sections = [];

    selectedServiceTypes.forEach((key) => {
      const template = SERVICE_TEMPLATES[key];
      const config = serviceConfigs[key] || {};

      if (key === "social_management") {
        const platforms = config.platforms || [];
        if (platforms.length > 0) {
          const platformNames = platforms
            .map((p) => {
              if (p === "Facebook" && platforms.includes("Instagram"))
                return null;
              if (p === "Instagram" && platforms.includes("Facebook"))
                return "פייסבוק ואינסטגרם";
              if (p === "TikTok") return "טיקטוק";
              if (p === "LinkedIn") return "לינקדאין";
              return p;
            })
            .filter(Boolean);

          sections.push({
            type: "social",
            title: `ניהול עמוד${platformNames.length > 1 ? "י" : ""} ${platformNames.join(" ו")} עסקי`,
            setupItems: template.setupItems.filter(
              (_, i) => !isItemExcluded(key, "setup", i)
            ),
            managementSections: platforms.map((p) => {
              const pKey =
                p === "Facebook" || p === "Instagram"
                  ? "facebook_instagram"
                  : p.toLowerCase();
              const items = (template.managementItems[pKey] || []).filter(
                (_, i) => !isItemExcluded(key, `mgmt_${pKey}`, i)
              );
              return {
                platform: p,
                items: items.map((item) =>
                  item
                    .replace("{frequency}", config.frequency || "2-3")
                    .replace("{frequencyUnit}", config.frequencyUnit || "בשבוע")
                ),
              };
            }),
          });
        }
      } else if (key === "campaigns_meta" || key === "campaigns_google" || key === "campaigns_tiktok") {
        sections.push({
          type: "campaigns",
          title:
            key === "campaigns_meta"
              ? "קמפיינים ממומנים במטא (פייסבוק ואינסטגרם)"
              : key === "campaigns_google"
                ? "קמפיינים ממומנים בגוגל"
                : "קמפיינים ממומנים בטיקטוק",
          setupTitle:
            key === "campaigns_meta"
              ? "הקמת הקמפיינים כוללת:"
              : "בניית מסע הפרסום כוללת:",
          setupItems: template.setupItems.filter(
            (_, i) => !isItemExcluded(key, "setup", i)
          ),
          managementItems: template.managementItems.filter(
            (_, i) => !isItemExcluded(key, "management", i)
          ),
        });
      } else if (key === "linkedin_network") {
        sections.push({
          type: "linkedin_network",
          title: "אוטומציה להגדלת רשת הקשרים (Network Growth)",
          description:
            "בניית תשתית אוטומטית להגדלת כמות הקשרים (Connections) בפרופיל הלינקדאין. המערכת תבצע שליחת בקשות חברות לקהל יעד מפולח ומדויק, במטרה להרחיב את החשיפה המקצועית.",
          setupItems: template.setupItems.filter(
            (_, i) => !isItemExcluded(key, "setup", i)
          ),
          softwareCosts: template.softwareCosts,
        });
      } else if (key === "custom") {
        sections.push({
          type: "custom",
          title: config.customTitle || "שירות מותאם אישית",
          description: config.customDescription || "",
          items: (config.customItems || "").split("\n").filter(Boolean),
        });
      } else {
        sections.push({
          type: "generic",
          title: template.label,
          items: (template.items || [])
            .filter((_, i) => !isItemExcluded(key, "items", i))
            .map((item) =>
              item
                .replace("{bannerCount}", config.bannerCount || "10")
                .replace("{bannerSize}", config.bannerSize || "1080*1080")
                .replace("{videoCount}", config.videoCount || "4-6")
                .replace("{videoFrequency}", config.videoFrequency || "1")
            ),
        });
      }
    });

    return sections;
  };

  // ============================================================
  // STYLES
  // ============================================================
  const styles = {
    app: {
      fontFamily: "var(--font-stack)",
      direction: "rtl",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
      color: "#e2e8f0",
    },
    header: {
      background: "linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)",
      padding: "20px 32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      boxShadow: "0 4px 30px rgba(99,102,241,0.3)",
    },
    headerTitle: {
      fontSize: "24px",
      fontWeight: "800",
      color: "#fff",
      margin: 0,
      letterSpacing: "-0.5px",
    },
    headerSub: {
      fontSize: "13px",
      color: "rgba(255,255,255,0.8)",
      margin: 0,
    },
    stepBar: {
      display: "flex",
      gap: "4px",
      padding: "16px 32px",
      background: "rgba(15,23,42,0.8)",
      borderBottom: "1px solid rgba(99,102,241,0.2)",
    },
    stepItem: (active, completed) => ({
      flex: 1,
      padding: "10px 16px",
      borderRadius: "8px",
      textAlign: "center",
      fontSize: "13px",
      fontWeight: active ? "700" : "500",
      cursor: "pointer",
      background: active
        ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
        : completed
          ? "rgba(99,102,241,0.15)"
          : "rgba(30,41,59,0.5)",
      color: active ? "#fff" : completed ? "#a5b4fc" : "#64748b",
      border: active
        ? "1px solid #818cf8"
        : completed
          ? "1px solid rgba(99,102,241,0.3)"
          : "1px solid rgba(51,65,85,0.5)",
      transition: "all 0.2s",
    }),
    content: {
      maxWidth: "900px",
      margin: "0 auto",
      padding: "24px 32px",
    },
    card: {
      background: "rgba(30,41,59,0.6)",
      border: "1px solid rgba(99,102,241,0.15)",
      borderRadius: "16px",
      padding: "24px",
      marginBottom: "20px",
      backdropFilter: "blur(10px)",
    },
    cardTitle: {
      fontSize: "17px",
      fontWeight: "700",
      color: "#a5b4fc",
      marginBottom: "16px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    label: {
      display: "block",
      fontSize: "13px",
      fontWeight: "600",
      color: "#94a3b8",
      marginBottom: "6px",
    },
    input: {
      width: "100%",
      padding: "10px 14px",
      borderRadius: "8px",
      border: "1px solid rgba(99,102,241,0.25)",
      background: "rgba(15,23,42,0.6)",
      color: "#e2e8f0",
      fontSize: "14px",
      outline: "none",
      direction: "rtl",
      boxSizing: "border-box",
      transition: "border-color 0.2s",
    },
    textarea: {
      width: "100%",
      padding: "10px 14px",
      borderRadius: "8px",
      border: "1px solid rgba(99,102,241,0.25)",
      background: "rgba(15,23,42,0.6)",
      color: "#e2e8f0",
      fontSize: "14px",
      outline: "none",
      direction: "rtl",
      boxSizing: "border-box",
      minHeight: "80px",
      resize: "vertical",
      fontFamily: "var(--font-stack)",
    },
    select: {
      width: "100%",
      padding: "10px 14px",
      borderRadius: "8px",
      border: "1px solid rgba(99,102,241,0.25)",
      background: "rgba(15,23,42,0.6)",
      color: "#e2e8f0",
      fontSize: "14px",
      outline: "none",
      direction: "rtl",
      boxSizing: "border-box",
    },
    row: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "16px",
      marginBottom: "16px",
    },
    row3: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: "16px",
      marginBottom: "16px",
    },
    fieldGroup: { marginBottom: "16px" },
    serviceChip: (selected) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "8px 16px",
      borderRadius: "20px",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      border: selected
        ? "2px solid #818cf8"
        : "2px solid rgba(51,65,85,0.5)",
      background: selected
        ? "rgba(99,102,241,0.2)"
        : "rgba(30,41,59,0.3)",
      color: selected ? "#c7d2fe" : "#64748b",
      transition: "all 0.2s",
      margin: "4px",
    }),
    checkbox: (checked) => ({
      width: "18px",
      height: "18px",
      borderRadius: "4px",
      border: checked
        ? "2px solid #818cf8"
        : "2px solid rgba(100,116,139,0.4)",
      background: checked ? "#6366f1" : "transparent",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      flexShrink: 0,
      fontSize: "11px",
      color: "#fff",
      transition: "all 0.15s",
    }),
    noteRow: {
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
      padding: "8px 0",
      borderBottom: "1px solid rgba(51,65,85,0.3)",
      fontSize: "13px",
      lineHeight: "1.6",
    },
    btn: (variant) => ({
      padding: variant === "lg" ? "14px 32px" : "10px 20px",
      borderRadius: "10px",
      border: "none",
      fontSize: variant === "lg" ? "16px" : "14px",
      fontWeight: "700",
      cursor: "pointer",
      background:
        variant === "primary" || variant === "lg"
          ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
          : variant === "danger"
            ? "rgba(239,68,68,0.15)"
            : "rgba(51,65,85,0.5)",
      color:
        variant === "primary" || variant === "lg"
          ? "#fff"
          : variant === "danger"
            ? "#f87171"
            : "#94a3b8",
      border:
        variant === "danger"
          ? "1px solid rgba(239,68,68,0.3)"
          : variant === "primary" || variant === "lg"
            ? "1px solid #818cf8"
            : "1px solid rgba(51,65,85,0.5)",
      transition: "all 0.2s",
    }),
    btnRow: {
      display: "flex",
      justifyContent: "space-between",
      gap: "12px",
      marginTop: "24px",
    },
    pricingHeader: {
      display: "grid",
      gridTemplateColumns: "2fr 1fr 1fr 1fr 40px",
      gap: "8px",
      padding: "8px 0",
      borderBottom: "2px solid rgba(99,102,241,0.3)",
      fontSize: "12px",
      fontWeight: "700",
      color: "#94a3b8",
    },
    pricingRow: {
      display: "grid",
      gridTemplateColumns: "2fr 1fr 1fr 1fr 40px",
      gap: "8px",
      padding: "8px 0",
      alignItems: "center",
      borderBottom: "1px solid rgba(51,65,85,0.3)",
    },
    pricingInput: {
      padding: "8px 10px",
      borderRadius: "6px",
      border: "1px solid rgba(99,102,241,0.2)",
      background: "rgba(15,23,42,0.6)",
      color: "#e2e8f0",
      fontSize: "13px",
      outline: "none",
      direction: "rtl",
      width: "100%",
      boxSizing: "border-box",
    },
    // Preview styles
    preview: {
      background: "#fff",
      color: "#1a1a1a",
      direction: "rtl",
      fontFamily: "var(--font-stack)",
      padding: "48px",
      maxWidth: "800px",
      margin: "0 auto",
      borderRadius: "12px",
      boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      lineHeight: "1.7",
      fontSize: "14px",
    },
    previewHeader: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: "32px",
      paddingBottom: "16px",
      borderBottom: "3px solid #6366f1",
    },
    previewTitle: {
      fontSize: "20px",
      fontWeight: "800",
      color: "#312e81",
      marginBottom: "24px",
    },
    previewSection: {
      marginBottom: "24px",
    },
    previewSectionTitle: {
      fontSize: "16px",
      fontWeight: "700",
      color: "#4338ca",
      marginBottom: "8px",
    },
    previewBullet: {
      paddingRight: "20px",
      position: "relative",
      marginBottom: "4px",
    },
    previewTable: {
      width: "100%",
      borderCollapse: "collapse",
      marginBottom: "24px",
    },
    previewTh: {
      background: "#eef2ff",
      padding: "10px 14px",
      border: "1px solid #c7d2fe",
      textAlign: "right",
      fontSize: "13px",
      fontWeight: "700",
      color: "#4338ca",
    },
    previewTd: {
      padding: "10px 14px",
      border: "1px solid #e2e8f0",
      textAlign: "right",
      fontSize: "13px",
    },
    previewNotes: {
      background: "#f8fafc",
      borderRadius: "8px",
      padding: "16px",
      marginTop: "24px",
    },
    previewNote: {
      fontSize: "12px",
      color: "#475569",
      marginBottom: "4px",
      paddingRight: "16px",
      position: "relative",
    },
  };

  // ============================================================
  // RENDER STEP 1: Client Details
  // ============================================================
  const renderStep1 = () => (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>📋 פרטי לקוח</div>
        <div style={styles.row}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>תאריך</label>
            <input
              style={styles.input}
              value={proposalData.date}
              onChange={(e) => updateField("date", e.target.value)}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>הנידון</label>
            <input
              style={styles.input}
              placeholder="למשל: קמפיינים ממומנים במטא"
              value={proposalData.subject}
              onChange={(e) => updateField("subject", e.target.value)}
            />
          </div>
        </div>
        <div style={styles.row}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>לכבוד (שם איש קשר)</label>
            <input
              style={styles.input}
              placeholder="למשל: נדב גואטה"
              value={proposalData.clientName}
              onChange={(e) => updateField("clientName", e.target.value)}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>תפקיד (אופציונלי)</label>
            <input
              style={styles.input}
              placeholder="למשל: מנהל שיווק"
              value={proposalData.clientTitle}
              onChange={(e) => updateField("clientTitle", e.target.value)}
            />
          </div>
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>עבור (שם חברה/ארגון)</label>
          <input
            style={styles.input}
            placeholder="למשל: אוניברסיטת בר-אילן"
            value={proposalData.companyName}
            onChange={(e) => updateField("companyName", e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  // ============================================================
  // RENDER STEP 2: Service Selection
  // ============================================================
  const renderStep2 = () => (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>🎯 בחירת שירותים</div>
        <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
          בחר את סוגי השירותים שברצונך לכלול בהצעה. ניתן לבחור מספר שירותים.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {Object.entries(SERVICE_TEMPLATES).map(([key, tpl]) => (
            <div
              key={key}
              style={styles.serviceChip(selectedServiceTypes.includes(key))}
              onClick={() => toggleServiceType(key)}
            >
              <span
                style={styles.checkbox(selectedServiceTypes.includes(key))}
              >
                {selectedServiceTypes.includes(key) ? "✓" : ""}
              </span>
              {tpl.label}
            </div>
          ))}
        </div>
      </div>

      {selectedServiceTypes.map((key) => {
        const template = SERVICE_TEMPLATES[key];
        const config = serviceConfigs[key] || {};

        if (key === "social_management") {
          return (
            <div key={key} style={styles.card}>
              <div style={styles.cardTitle}>📱 {template.label}</div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>פלטפורמות</label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {template.platforms.map((p) => (
                    <div
                      key={p}
                      style={styles.serviceChip(
                        (config.platforms || []).includes(p)
                      )}
                      onClick={() => {
                        const curr = config.platforms || [];
                        updateServiceConfig(
                          key,
                          "platforms",
                          curr.includes(p)
                            ? curr.filter((x) => x !== p)
                            : [...curr, p]
                        );
                      }}
                    >
                      {p}
                    </div>
                  ))}
                </div>
              </div>
              <div style={styles.row}>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>תדירות פוסטים</label>
                  <input
                    style={styles.input}
                    placeholder="2-3"
                    value={config.frequency || ""}
                    onChange={(e) =>
                      updateServiceConfig(key, "frequency", e.target.value)
                    }
                  />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>יחידה</label>
                  <select
                    style={styles.select}
                    value={config.frequencyUnit || "בשבוע"}
                    onChange={(e) =>
                      updateServiceConfig(key, "frequencyUnit", e.target.value)
                    }
                  >
                    <option value="בשבוע">בשבוע</option>
                    <option value="בחודש">בחודש</option>
                  </select>
                </div>
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>
                  פריטי הקמה (לחץ כדי להסיר/להוסיף)
                </label>
                {template.setupItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.noteRow,
                      opacity: isItemExcluded(key, "setup", i) ? 0.4 : 1,
                      textDecoration: isItemExcluded(key, "setup", i)
                        ? "line-through"
                        : "none",
                      cursor: "pointer",
                    }}
                    onClick={() => toggleServiceItem(key, "setup", i)}
                  >
                    <span
                      style={styles.checkbox(
                        !isItemExcluded(key, "setup", i)
                      )}
                    >
                      {!isItemExcluded(key, "setup", i) ? "✓" : ""}
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (
          key === "campaigns_meta" ||
          key === "campaigns_google" ||
          key === "campaigns_tiktok"
        ) {
          return (
            <div key={key} style={styles.card}>
              <div style={styles.cardTitle}>🚀 {template.label}</div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>פריטי הקמה</label>
                {template.setupItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.noteRow,
                      opacity: isItemExcluded(key, "setup", i) ? 0.4 : 1,
                      textDecoration: isItemExcluded(key, "setup", i)
                        ? "line-through"
                        : "none",
                      cursor: "pointer",
                    }}
                    onClick={() => toggleServiceItem(key, "setup", i)}
                  >
                    <span
                      style={styles.checkbox(
                        !isItemExcluded(key, "setup", i)
                      )}
                    >
                      {!isItemExcluded(key, "setup", i) ? "✓" : ""}
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>פריטי ניהול</label>
                {template.managementItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.noteRow,
                      opacity: isItemExcluded(key, "management", i) ? 0.4 : 1,
                      textDecoration: isItemExcluded(key, "management", i)
                        ? "line-through"
                        : "none",
                      cursor: "pointer",
                    }}
                    onClick={() => toggleServiceItem(key, "management", i)}
                  >
                    <span
                      style={styles.checkbox(
                        !isItemExcluded(key, "management", i)
                      )}
                    >
                      {!isItemExcluded(key, "management", i) ? "✓" : ""}
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (key === "linkedin_network") {
          return (
            <div key={key} style={styles.card}>
              <div style={styles.cardTitle}>🔗 {template.label}</div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>פריטי שירות</label>
                {template.setupItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.noteRow,
                      opacity: isItemExcluded(key, "setup", i) ? 0.4 : 1,
                      textDecoration: isItemExcluded(key, "setup", i)
                        ? "line-through"
                        : "none",
                      cursor: "pointer",
                    }}
                    onClick={() => toggleServiceItem(key, "setup", i)}
                  >
                    <span
                      style={styles.checkbox(
                        !isItemExcluded(key, "setup", i)
                      )}
                    >
                      {!isItemExcluded(key, "setup", i) ? "✓" : ""}
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (key === "custom") {
          return (
            <div key={key} style={styles.card}>
              <div style={styles.cardTitle}>✨ שירות מותאם אישית</div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>כותרת השירות</label>
                <input
                  style={styles.input}
                  value={config.customTitle || ""}
                  onChange={(e) =>
                    updateServiceConfig(key, "customTitle", e.target.value)
                  }
                />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>תיאור השירות</label>
                <textarea
                  style={styles.textarea}
                  value={config.customDescription || ""}
                  onChange={(e) =>
                    updateServiceConfig(
                      key,
                      "customDescription",
                      e.target.value
                    )
                  }
                />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>
                  פריטים (כל שורה = פריט בולט)
                </label>
                <textarea
                  style={{ ...styles.textarea, minHeight: "120px" }}
                  placeholder="פריט ראשון&#10;פריט שני&#10;פריט שלישי"
                  value={config.customItems || ""}
                  onChange={(e) =>
                    updateServiceConfig(key, "customItems", e.target.value)
                  }
                />
              </div>
            </div>
          );
        }

        if (key === "design_banners") {
          return (
            <div key={key} style={styles.card}>
              <div style={styles.cardTitle}>🎨 {template.label}</div>
              <div style={styles.row}>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>כמות באנרים</label>
                  <input
                    style={styles.input}
                    placeholder="10"
                    value={config.bannerCount || ""}
                    onChange={(e) =>
                      updateServiceConfig(key, "bannerCount", e.target.value)
                    }
                  />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>גודל באנרים</label>
                  <input
                    style={styles.input}
                    placeholder="1080*1080"
                    value={config.bannerSize || ""}
                    onChange={(e) =>
                      updateServiceConfig(key, "bannerSize", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          );
        }

        if (key === "video_production") {
          return (
            <div key={key} style={styles.card}>
              <div style={styles.cardTitle}>🎬 {template.label}</div>
              <div style={styles.row}>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>כמות סרטונים</label>
                  <input
                    style={styles.input}
                    placeholder="4-6"
                    value={config.videoCount || ""}
                    onChange={(e) =>
                      updateServiceConfig(key, "videoCount", e.target.value)
                    }
                  />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>תדירות (לחודש)</label>
                  <input
                    style={styles.input}
                    placeholder="1"
                    value={config.videoFrequency || ""}
                    onChange={(e) =>
                      updateServiceConfig(key, "videoFrequency", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={key} style={styles.card}>
            <div style={styles.cardTitle}>📦 {template.label}</div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>פריטי שירות</label>
              {(template.items || []).map((item, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.noteRow,
                    opacity: isItemExcluded(key, "items", i) ? 0.4 : 1,
                    textDecoration: isItemExcluded(key, "items", i)
                      ? "line-through"
                      : "none",
                    cursor: "pointer",
                  }}
                  onClick={() => toggleServiceItem(key, "items", i)}
                >
                  <span
                    style={styles.checkbox(!isItemExcluded(key, "items", i))}
                  >
                    {!isItemExcluded(key, "items", i) ? "✓" : ""}
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ============================================================
  // RENDER STEP 3: Pricing
  // ============================================================
  const renderStep3 = () => (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>💰 תמחור</div>
        <div style={styles.pricingHeader}>
          <span>תיאור</span>
          <span>סכום</span>
          <span>סוג</span>
          <span>הערה</span>
          <span></span>
        </div>
        {proposalData.pricingRows.map((row, idx) => (
          <div key={idx} style={styles.pricingRow}>
            <input
              style={styles.pricingInput}
              placeholder="ניהול פרסום בערוצי מטא"
              value={row.description}
              onChange={(e) =>
                updatePricingRow(idx, "description", e.target.value)
              }
            />
            <input
              style={styles.pricingInput}
              placeholder="2,500 ₪"
              value={row.amount}
              onChange={(e) => updatePricingRow(idx, "amount", e.target.value)}
            />
            <select
              style={styles.pricingInput}
              value={row.unit}
              onChange={(e) => updatePricingRow(idx, "unit", e.target.value)}
            >
              <option value="חודשי">חודשי</option>
              <option value="חד-פעמי">חד-פעמי</option>
              <option value="לפרויקט">לפרויקט</option>
              <option value="% מתקציב">% מתקציב</option>
            </select>
            <input
              style={styles.pricingInput}
              placeholder="הערה"
              value={row.note}
              onChange={(e) => updatePricingRow(idx, "note", e.target.value)}
            />
            <button
              style={{
                ...styles.btn("danger"),
                padding: "6px 10px",
                fontSize: "16px",
              }}
              onClick={() => removePricingRow(idx)}
            >
              ×
            </button>
          </div>
        ))}
        <button
          style={{ ...styles.btn("primary"), marginTop: "12px" }}
          onClick={addPricingRow}
        >
          + שורת תמחור
        </button>

        <div style={{ ...styles.row, marginTop: "24px" }}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>כמות חודשים (אופציונלי)</label>
            <input
              style={styles.input}
              placeholder="12"
              value={proposalData.totalMonths}
              onChange={(e) => updateField("totalMonths", e.target.value)}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>סה"כ (אופציונלי)</label>
            <input
              style={styles.input}
              placeholder="30,000 ₪ + מע״מ"
              value={proposalData.totalAmount}
              onChange={(e) => updateField("totalAmount", e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );

  // ============================================================
  // RENDER STEP 4: Notes & Terms
  // ============================================================
  const renderStep4 = () => (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>📝 הערות ותנאים</div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>תנאי תשלום</label>
          <select
            style={styles.select}
            value={proposalData.paymentTerms}
            onChange={(e) => updateField("paymentTerms", e.target.value)}
          >
            {PAYMENT_TERMS_OPTIONS.map((opt, i) => (
              <option key={i} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <label style={styles.label}>
          הערות סטנדרטיות (לחץ כדי להפעיל/לכבות)
        </label>
        {proposalData.notes.map((note, idx) => (
          <div
            key={idx}
            style={{
              ...styles.noteRow,
              opacity: note.checked ? 1 : 0.4,
              cursor: "pointer",
            }}
            onClick={() => toggleNote(idx)}
          >
            <span style={styles.checkbox(note.checked)}>
              {note.checked ? "✓" : ""}
            </span>
            <span
              style={{
                textDecoration: note.checked ? "none" : "line-through",
              }}
            >
              {note.text.replace("{paymentTerms}", proposalData.paymentTerms)}
            </span>
          </div>
        ))}

        <div style={{ marginTop: "20px" }}>
          <label style={styles.label}>הערות נוספות (חופשי)</label>
          <textarea
            style={styles.textarea}
            placeholder="הוסף הערות נוספות כאן, כל שורה = הערה חדשה"
            value={proposalData.customNotes.join("\n")}
            onChange={(e) =>
              updateField(
                "customNotes",
                e.target.value.split("\n").filter(Boolean)
              )
            }
          />
        </div>

        <div style={{ marginTop: "20px", display: "flex", gap: "20px" }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
            onClick={() =>
              updateField("includeAppendix", !proposalData.includeAppendix)
            }
          >
            <span style={styles.checkbox(proposalData.includeAppendix)}>
              {proposalData.includeAppendix ? "✓" : ""}
            </span>
            <span style={{ fontSize: "13px" }}>כלול נספח א' (טופס הזמנה)</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
            onClick={() =>
              updateField("includeSignature", !proposalData.includeSignature)
            }
          >
            <span style={styles.checkbox(proposalData.includeSignature)}>
              {proposalData.includeSignature ? "✓" : ""}
            </span>
            <span style={{ fontSize: "13px" }}>כלול שורות חתימה</span>
          </div>
        </div>
      </div>
    </div>
  );

  // ============================================================
  // RENDER STEP 5: Preview
  // ============================================================
  const renderPreview = () => {
    const sections = generatePreviewContent();
    const activeNotes = proposalData.notes
      .filter((n) => n.checked)
      .map((n) => n.text.replace("{paymentTerms}", `תנאי תשלום: ${proposalData.paymentTerms}`));
    const allNotes = [...activeNotes, ...proposalData.customNotes];

    return (
      <div>
        <div
          style={{
            marginBottom: "16px",
            display: "flex",
            gap: "12px",
            justifyContent: "center",
          }}
        >
          <button
            style={styles.btn("lg")}
            onClick={() => {
              const activeNotes = proposalData.notes
                .filter((n) => n.checked)
                .map((n) => n.text.replace("{paymentTerms}", `תנאי תשלום: ${proposalData.paymentTerms}`));
              const allNotes = [...activeNotes, ...proposalData.customNotes];
              generateDocx(proposalData, generatePreviewContent(), allNotes);
            }}
          >
            📄 הורדה כ-Word
          </button>
          <button
            style={styles.btn()}
            onClick={() => setPreviewMode(false)}
          >
            ← חזרה לעריכה
          </button>
        </div>

        <div style={styles.preview} id="proposal-preview">
          {/* Header */}
          <div style={styles.previewHeader}>
            <div>
              <div style={{ fontSize: "13px", color: "#6366f1", fontWeight: "600" }}>
                תאריך: {proposalData.date}
              </div>
              <div style={{ fontSize: "15px", fontWeight: "700", marginTop: "8px" }}>
                לכבוד: {proposalData.clientName}
                {proposalData.clientTitle && ` – ${proposalData.clientTitle}`}
              </div>
              {proposalData.companyName && (
                <div style={{ fontSize: "14px", color: "#475569", marginTop: "4px" }}>
                  עבור: {proposalData.companyName}
                </div>
              )}
            </div>
          </div>

          {/* Subject */}
          {proposalData.subject && (
            <div style={styles.previewTitle}>
              הנידון: {proposalData.subject}
            </div>
          )}

          {/* Service Sections */}
          {sections.map((section, sIdx) => (
            <div key={sIdx} style={styles.previewSection}>
              <div style={styles.previewSectionTitle}>{section.title}</div>

              {section.description && (
                <p style={{ fontSize: "13px", color: "#475569", marginBottom: "12px" }}>
                  {section.description}
                </p>
              )}

              {section.type === "social" && (
                <>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#1e293b",
                      marginBottom: "6px",
                    }}
                  >
                    הקמת עמודים או תחילת פעילות:
                  </div>
                  <ul
                    style={{
                      margin: "0 20px 16px 0",
                      padding: 0,
                      listStyleType: "disc",
                    }}
                  >
                    {section.setupItems.map((item, i) => (
                      <li key={i} style={{ fontSize: "13px", marginBottom: "3px" }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                  {section.managementSections.map((ms, mIdx) => (
                    <div key={mIdx}>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "#1e293b",
                          marginBottom: "6px",
                          marginTop: "12px",
                        }}
                      >
                        ניהול עמוד {ms.platform} עסקי:
                      </div>
                      <ul
                        style={{
                          margin: "0 20px 8px 0",
                          padding: 0,
                          listStyleType: "disc",
                        }}
                      >
                        {ms.items.map((item, i) => (
                          <li
                            key={i}
                            style={{ fontSize: "13px", marginBottom: "3px" }}
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}

              {section.type === "campaigns" && (
                <>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#1e293b",
                      marginBottom: "6px",
                    }}
                  >
                    {section.setupTitle}
                  </div>
                  <ul
                    style={{
                      margin: "0 20px 16px 0",
                      padding: 0,
                      listStyleType: "disc",
                    }}
                  >
                    {section.setupItems.map((item, i) => (
                      <li key={i} style={{ fontSize: "13px", marginBottom: "3px" }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#1e293b",
                      marginBottom: "6px",
                    }}
                  >
                    ניהול הקמפיינים כולל:
                  </div>
                  <ul
                    style={{
                      margin: "0 20px 8px 0",
                      padding: 0,
                      listStyleType: "disc",
                    }}
                  >
                    {section.managementItems.map((item, i) => (
                      <li key={i} style={{ fontSize: "13px", marginBottom: "3px" }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {section.type === "linkedin_network" && (
                <>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#1e293b",
                      marginBottom: "6px",
                    }}
                  >
                    השירות כולל:
                  </div>
                  <ul
                    style={{
                      margin: "0 20px 16px 0",
                      padding: 0,
                      listStyleType: "disc",
                    }}
                  >
                    {section.setupItems.map((item, i) => (
                      <li key={i} style={{ fontSize: "13px", marginBottom: "3px" }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                  {section.softwareCosts && (
                    <div style={{ marginTop: "12px" }}>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "#1e293b",
                          marginBottom: "6px",
                        }}
                      >
                        עלויות תוכנה (תשלום ישיר לספקים – מנוי חודשי):
                      </div>
                      <ul
                        style={{
                          margin: "0 20px 8px 0",
                          padding: 0,
                          listStyleType: "disc",
                        }}
                      >
                        {section.softwareCosts.map((sc, i) => (
                          <li
                            key={i}
                            style={{ fontSize: "13px", marginBottom: "3px" }}
                          >
                            {sc.name} – {sc.cost}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {(section.type === "generic" || section.type === "custom") &&
                section.items &&
                section.items.length > 0 && (
                  <ul
                    style={{
                      margin: "0 20px 8px 0",
                      padding: 0,
                      listStyleType: "disc",
                    }}
                  >
                    {section.items.map((item, i) => (
                      <li key={i} style={{ fontSize: "13px", marginBottom: "3px" }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          ))}

          {/* Pricing Table */}
          {proposalData.pricingRows.some((r) => r.description) && (
            <div style={styles.previewSection}>
              <div style={styles.previewSectionTitle}>דמי ניהול</div>
              <table style={styles.previewTable}>
                <thead>
                  <tr>
                    <th style={styles.previewTh}>פירוט</th>
                    <th style={styles.previewTh}>סכום</th>
                    <th style={styles.previewTh}>סוג</th>
                    {proposalData.pricingRows.some((r) => r.note) && (
                      <th style={styles.previewTh}>הערה</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {proposalData.pricingRows
                    .filter((r) => r.description)
                    .map((row, i) => (
                      <tr key={i}>
                        <td style={styles.previewTd}>{row.description}</td>
                        <td style={styles.previewTd}>{row.amount}</td>
                        <td style={styles.previewTd}>{row.unit}</td>
                        {proposalData.pricingRows.some((r) => r.note) && (
                          <td style={styles.previewTd}>{row.note}</td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
              {proposalData.totalMonths && (
                <div style={{ fontSize: "13px", marginBottom: "4px" }}>
                  <strong>כמות חודשים:</strong> {proposalData.totalMonths}
                </div>
              )}
              {proposalData.totalAmount && (
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: "700",
                    color: "#312e81",
                    marginTop: "8px",
                  }}
                >
                  סה"כ: {proposalData.totalAmount}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {allNotes.length > 0 && (
            <div style={styles.previewNotes}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "700",
                  color: "#4338ca",
                  marginBottom: "10px",
                }}
              >
                הערות
              </div>
              {allNotes.map((note, i) => (
                <div key={i} style={styles.previewNote}>
                  • {note}
                </div>
              ))}
            </div>
          )}

          {/* Appendix */}
          {proposalData.includeAppendix && (
            <div
              style={{
                marginTop: "32px",
                paddingTop: "24px",
                borderTop: "2px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#312e81",
                  marginBottom: "16px",
                }}
              >
                נספח א' – הזמנת שירותי פרסום דיגיטליים
              </div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  marginBottom: "12px",
                }}
              >
                פרטי הלקוח:
              </div>
              <table style={styles.previewTable}>
                <tbody>
                  {[
                    ["שם העסק:", "", "מספר ח.פ/ע.מ:", ""],
                    ["כתובת העסק:", "", "טלפון:", ""],
                    ["שם פרטי:", "", "שם משפחה:", ""],
                    ["ת.ז.:", "", 'דוא"ל:', ""],
                  ].map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          style={{
                            ...styles.previewTd,
                            fontWeight: j % 2 === 0 ? "600" : "400",
                            minWidth: j % 2 === 0 ? "100px" : "150px",
                          }}
                        >
                          {cell || "\u00A0"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {proposalData.includeSignature && (
                <div style={{ marginTop: "24px" }}>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      marginBottom: "12px",
                    }}
                  >
                    הרשאה לחיוב כרטיס אשראי:
                  </div>
                  <table style={styles.previewTable}>
                    <tbody>
                      {[
                        ["סוג הכרטיס:", "", "סכום החיוב:", ""],
                        ["מספר הכרטיס:", "", "תוקף:", ""],
                        ["CVV:", "", "", ""],
                      ].map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td
                              key={j}
                              style={{
                                ...styles.previewTd,
                                fontWeight: j % 2 === 0 ? "600" : "400",
                              }}
                            >
                              {cell || "\u00A0"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: "40px",
                    }}
                  >
                    <div style={{ textAlign: "center", flex: 1 }}>
                      <div
                        style={{
                          borderBottom: "1px solid #1e293b",
                          marginBottom: "8px",
                          height: "40px",
                        }}
                      />
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        חתימה וחותמת
                      </div>
                    </div>
                    <div style={{ width: "60px" }} />
                    <div style={{ textAlign: "center", flex: 1 }}>
                      <div
                        style={{
                          borderBottom: "1px solid #1e293b",
                          marginBottom: "8px",
                          height: "40px",
                        }}
                      />
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        תאריך
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================
  const steps = [
    { num: 1, label: "פרטי לקוח" },
    { num: 2, label: "שירותים" },
    { num: 3, label: "תמחור" },
    { num: 4, label: "הערות ותנאים" },
    { num: 5, label: "תצוגה מקדימה" },
  ];

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.headerTitle}>מחולל הצעות מחיר</h1>
          <p style={styles.headerSub}>Proposal Generator</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {step < 5 && (
            <button
              style={styles.btn("primary")}
              onClick={() => {
                if (step === 4) setPreviewMode(true);
                setStep(5);
              }}
            >
              תצוגה מקדימה →
            </button>
          )}
        </div>
      </div>

      <div style={styles.stepBar}>
        {steps.map((s) => (
          <div
            key={s.num}
            style={styles.stepItem(step === s.num, step > s.num)}
            onClick={() => setStep(s.num)}
          >
            {s.label}
          </div>
        ))}
      </div>

      <div style={styles.content}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderPreview()}

        {step < 5 && (
          <div style={styles.btnRow}>
            {step > 1 ? (
              <button style={styles.btn()} onClick={() => setStep(step - 1)}>
                → הקודם
              </button>
            ) : (
              <div />
            )}
            <button
              style={styles.btn("primary")}
              onClick={() => setStep(step + 1)}
            >
              הבא ←
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
