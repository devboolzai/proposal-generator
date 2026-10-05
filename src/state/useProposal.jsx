import { createContext, useCallback, useContext, useRef, useState } from "react";
import { PAYMENT_TERMS_OPTIONS, DEFAULT_NOTES } from "../constants/proposalDefaults";
import { requestProposalId } from "../share/proposalId";
import {
  buildDocumentSections,
  createBlankSection,
  createGroup,
  createItem,
  createSection,
} from "./sections";

// ============================================================
// PROPOSAL STATE
//*test ignore*
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
    includeAppendix: true,
    includeSignature: true,
  });

  // The services, in document order — see state/sections.js for the shape.
  const [sections, setSections] = useState([]);
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

  const addNote = () => {
    setProposalData((prev) => ({
      ...prev,
      notes: [...prev.notes, { text: "", checked: true }],
    }));
  };

  const updateNote = (idx, text) => {
    setProposalData((prev) => {
      const notes = [...prev.notes];
      notes[idx] = { ...notes[idx], text };
      return { ...prev, notes };
    });
  };

  const removeNote = (idx) => {
    setProposalData((prev) => ({
      ...prev,
      notes: prev.notes.filter((_, i) => i !== idx),
    }));
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

  // ── Services (Step 2) ──
  const mapSection = (sectionId, fn) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? fn(s) : s)));
  };

  const mapGroup = (sectionId, groupId, fn) => {
    mapSection(sectionId, (s) => ({
      ...s,
      groups: s.groups.map((g) => (g.id === groupId ? fn(g) : g)),
    }));
  };

  // A template is picked at most once; the chip both adds and removes it.
  const toggleTemplate = (templateKey) => {
    setSections((prev) =>
      prev.some((s) => s.templateKey === templateKey)
        ? prev.filter((s) => s.templateKey !== templateKey)
        : [...prev, createSection(templateKey)]
    );
  };

  const addBlankSection = () => {
    setSections((prev) => [...prev, createBlankSection()]);
  };

  const removeSection = (sectionId) => {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  };

  const moveSection = (sectionId, delta) => {
    setSections((prev) => {
      const from = prev.findIndex((s) => s.id === sectionId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  const updateSection = (sectionId, patch) => {
    mapSection(sectionId, (s) => ({ ...s, ...patch }));
  };

  const addGroup = (sectionId) => {
    mapSection(sectionId, (s) => ({ ...s, groups: [...s.groups, createGroup()] }));
  };

  const updateGroup = (sectionId, groupId, patch) => {
    mapGroup(sectionId, groupId, (g) => ({ ...g, ...patch }));
  };

  const removeGroup = (sectionId, groupId) => {
    mapSection(sectionId, (s) => ({
      ...s,
      groups: s.groups.filter((g) => g.id !== groupId),
    }));
  };

  const addItem = (sectionId, groupId) => {
    mapGroup(sectionId, groupId, (g) => ({ ...g, items: [...g.items, createItem()] }));
  };

  const updateItem = (sectionId, groupId, itemId, patch) => {
    mapGroup(sectionId, groupId, (g) => ({
      ...g,
      items: g.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    }));
  };

  const removeItem = (sectionId, groupId, itemId) => {
    mapGroup(sectionId, groupId, (g) => ({
      ...g,
      items: g.items.filter((item) => item.id !== itemId),
    }));
  };

  // ── The services as the document shows them ──
  const generatePreviewContent = () => buildDocumentSections(sections);

  return (
    <ProposalContext.Provider
      value={{
        step, setStep,
        proposalData, setProposalData,
        proposalId, proposalIdBusy, proposalIdError, ensureProposalId,
        sections,
        previewMode, setPreviewMode,
        updateField,
        toggleNote,
        addNote,
        updateNote,
        removeNote,
        addPricingRow,
        updatePricingRow,
        removePricingRow,
        toggleTemplate,
        addBlankSection,
        removeSection,
        moveSection,
        updateSection,
        addGroup,
        updateGroup,
        removeGroup,
        addItem,
        updateItem,
        removeItem,
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
