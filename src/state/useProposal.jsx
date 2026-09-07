import { createContext, useCallback, useContext, useRef, useState } from "react";
import { SERVICE_TEMPLATES } from "../constants/serviceTemplates";
import { PAYMENT_TERMS_OPTIONS, DEFAULT_NOTES } from "../constants/proposalDefaults";
import { requestProposalId } from "../share/proposalId";

// ============================================================
// PROPOSAL STATE
//
// Single source of state for the whole app. Every step component
// reads what it needs via useProposal() — no prop drilling.
//
// The proposal number is deliberately NOT part of proposalData:
// it is allocated by the server, must never change, and must
// never be reachable by updateField.
// ============================================================
const ProposalContext = createContext(null);

export function ProposalProvider({ children }) {
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

  // ── The proposal number ──
  const [proposalId, setProposalId] = useState(null);
  const [proposalIdBusy, setProposalIdBusy] = useState(false);
  const [proposalIdError, setProposalIdError] = useState(null);

  // Refs, not state, because both guards have to hold within a single render
  // pass. Without them React would allocate twice — StrictMode runs effects
  // twice in development, and each call spends a number for good.
  const proposalIdRef = useRef(null);
  const inFlight = useRef(null);

  /**
   * Allocate this proposal's number, once. Idempotent by design: after the
   * first success every later call resolves to the same number, which is what
   * makes it unchangeable for the life of the wizard.
   *
   * @returns {Promise<number|null>} null when allocation failed — the reason
   *   is in proposalIdError and the call can be retried.
   */
  const ensureProposalId = useCallback(async (accessCode) => {
    if (proposalIdRef.current) return proposalIdRef.current;
    if (inFlight.current) return inFlight.current;

    setProposalIdError(null);
    setProposalIdBusy(true);

    inFlight.current = requestProposalId(accessCode)
      .then((id) => {
        proposalIdRef.current = id;
        setProposalId(id);
        return id;
      })
      .catch((err) => {
        setProposalIdError(err.message || "הקצאת מספר ההצעה נכשלה");
        // Clear only on failure, so a retry is possible while a success stays
        // pinned to the one number this proposal will ever have.
        inFlight.current = null;
        return null;
      })
      .finally(() => setProposalIdBusy(false));

    return inFlight.current;
  }, []);

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

  // ── Merge templates + user config into renderable sections ──
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

  return (
    <ProposalContext.Provider
      value={{
        step, setStep,
        proposalData, setProposalData,
        proposalId, proposalIdBusy, proposalIdError, ensureProposalId,
        selectedServiceTypes,
        serviceConfigs,
        previewMode, setPreviewMode,
        updateField,
        toggleNote,
        addPricingRow,
        updatePricingRow,
        removePricingRow,
        toggleServiceType,
        updateServiceConfig,
        toggleServiceItem,
        isItemExcluded,
        generatePreviewContent,
      }}
    >
      {children}
    </ProposalContext.Provider>
  );
}

export function useProposal() {
  const ctx = useContext(ProposalContext);
  if (!ctx) throw new Error("useProposal must be used inside <ProposalProvider>");
  return ctx;
}
