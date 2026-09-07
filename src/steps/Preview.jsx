import { useEffect, useState } from "react";
import { useProposal } from "../state/useProposal";
import { styles, DOC, GLYPH } from "../styles/appStyles";
import { generateDocx } from "../exportDocx";
import { generatePdf } from "../exportPdf";
import { getAccessCode, setAccessCode } from "../share/api";
import ShareLinkModal from "./ShareLinkModal";

// Native list markers (list-style-type: disc) are positioned by html2canvas
// itself during PDF capture, and it ignores the RTL direction — the dots end
// up flush against the left edge of the page. Drawing the bullet as a real
// positioned element keeps it on the right in both the browser and the PDF,
// and preserves the hanging indent for items that wrap.
// `gap` is the space after the whole list; `itemGap` the space between items.
// Keep itemGap in step with the `after` spacing of bulletItem() in
// exportDocx.js, so the Word file breathes the same way as the PDF.
function BulletList({
  items,
  gap = 16,
  itemGap = 8,
  glyph = GLYPH.check,
  color = DOC.ink,
}) {
  return (
    <ul style={{ margin: `0 14px ${gap}px 0`, padding: 0, listStyleType: "none" }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            position: "relative",
            paddingRight: "20px",
            fontSize: "13px",
            marginBottom: `${itemGap}px`,
          }}
        >
          <span style={{ position: "absolute", right: 0, color }}>{glyph}</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

const idGate = {
  marginBottom: "16px",
  padding: "12px 16px",
  borderRadius: "8px",
  background: "rgba(99,102,241,0.12)",
  border: "1px solid rgba(99,102,241,0.35)",
  color: "#c7d2fe",
  fontSize: "13px",
  textAlign: "center",
};

export default function Preview() {
  const {
    proposalData,
    setPreviewMode,
    generatePreviewContent,
    proposalId,
    proposalIdBusy,
    proposalIdError,
    ensureProposalId,
  } = useProposal();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [code, setCode] = useState(getAccessCode);
  const generalManagement = section.managementSections.find(
    (ms) =>
      ms.platform === "Facebook" ||
      ms.platform === "Instagram" ||
      ms.platform === "LinkedIn"
  );

  const tiktokManagement = section.managementSections.find(
    (ms) => ms.platform === "TikTok"
  );

  // This is where the proposal earns its number: the first screen that can
  // turn it into a document. ensureProposalId is idempotent, so coming back
  // to the preview after editing keeps the number the client already saw.
  useEffect(() => {
    const stored = getAccessCode();
    if (stored) ensureProposalId(stored);
  }, [ensureProposalId]);

  const handleAllocate = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    // Only remember a code that actually worked, so a typo does not get
    // cached and silently 401 the send flow later.
    if (await ensureProposalId(trimmed)) setAccessCode(trimmed);
  };

  const sections = generatePreviewContent();
  const activeNotes = proposalData.notes
    .filter((n) => n.checked)
    .map((n) => n.text.replace("{paymentTerms}", `תנאי תשלום: ${proposalData.paymentTerms}`));
  const allNotes = [...activeNotes, ...proposalData.customNotes];

  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      await generatePdf(proposalData, proposalId);
    } catch (err) {
      setPdfError(err.message || "יצירת ה-PDF נכשלה.");
    } finally {
      setPdfBusy(false);
    }
  };

  // No number, no document. A proposal that reached a client without one
  // would be exactly the thing this feature exists to prevent.
  const exportsBlocked = !proposalId || pdfBusy;

  return (
    <div>
      <div
        style={{
          marginBottom: "16px",
          display: "flex",
          gap: "12px",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          style={{ ...styles.btn("lg"), opacity: exportsBlocked ? 0.5 : 1 }}
          onClick={() => setSharing(true)}
          disabled={exportsBlocked}
        >
          🔗 שליחה לחתימה
        </button>
        <button
          style={{ ...styles.btn("lg"), opacity: exportsBlocked ? 0.5 : 1 }}
          onClick={handleDownloadPdf}
          disabled={exportsBlocked}
        >
          {pdfBusy ? "⏳ מייצר PDF…" : "📕 הורדה כ-PDF"}
        </button>
        <button
          style={{ ...styles.btn("lg"), opacity: exportsBlocked ? 0.5 : 1 }}
          onClick={() => generateDocx(proposalData, sections, allNotes, proposalId)}
          disabled={exportsBlocked}
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

      {/* Allocation gate. Only ever shown before a number exists — once one is
          held it can never be lost or re-requested, so this cannot come back. */}
      {!proposalId && (
        <div style={idGate}>
          <div style={{ marginBottom: proposalIdBusy ? 0 : "10px" }}>
            {proposalIdBusy
              ? "⏳ מקצה מספר הצעה…"
              : proposalIdError ||
              "כדי להפיק את ההצעה יש להקצות לה מספר. נדרש קוד גישה."}
          </div>

          {!proposalIdBusy && (
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <input
                style={{ ...styles.input, width: "auto", flex: "0 1 220px" }}
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAllocate()}
                placeholder="קוד הגישה של המערכת"
                autoComplete="off"
              />
              <button
                style={styles.btn("primary")}
                onClick={handleAllocate}
                disabled={!code.trim()}
              >
                הקצאת מספר הצעה
              </button>
            </div>
          )}
        </div>
      )}

      {pdfError && (
        <div
          style={{
            marginBottom: "16px",
            padding: "10px 14px",
            borderRadius: "8px",
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.4)",
            color: "#fca5a5",
            fontSize: "13px",
            textAlign: "center",
          }}
        >
          {pdfError}
        </div>
      )}

      {/* An overlay, never a replacement: generatePdf rasterises the live
          #proposal-preview node below, so it has to stay mounted. */}
      {sharing && (
        <ShareLinkModal
          proposalData={proposalData}
          proposalId={proposalId}
          onClose={() => setSharing(false)}
        />
      )}

      <div style={styles.preview} id="proposal-preview">
        {/* Header */}
        <div style={styles.previewHeader}>
          <div>
            {/* The PDF is a raster of this node, so printing the number here
                is what puts it in the document — and makes it uneditable. */}
            {proposalId && (
              <div style={styles.previewProposalId}>
                הצעת מחיר מס' {proposalId}
              </div>
            )}
            <div style={styles.previewDate}>
              תאריך: {proposalData.date}
            </div>
            <div style={{ fontSize: "15px", marginTop: "8px" }}>
              לכבוד: {proposalData.clientName}
              {proposalData.clientTitle && ` – ${proposalData.clientTitle}`}
            </div>
            {proposalData.companyName && (
              <div style={{ fontSize: "15px", marginTop: "8px" }}>
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
              <p style={{ fontSize: "13px", marginBottom: "12px" }}>
                {section.description}
              </p>
            )}

            {section.type === "social" && (
              <>
                <div
                  style={styles.previewLead}
                >
                  הקמת עמודים או תחילת פעילות:
                </div>
                <BulletList items={section.setupItems} gap={16} />
                {generalManagement && (
                  <div>
                    <div style={{ ...styles.previewLead, marginTop: "12px" }}>
                      ניהול עמוד עסקי כולל:
                    </div>

                    <BulletList items={generalManagement.items} gap={8} />
                  </div>
                )}

                {tiktokManagement && (
                  <div>
                    <div style={{ ...styles.previewLead, marginTop: "12px" }}>
                      ניהול עמוד TikTok עסקי:
                    </div>

                    <BulletList items={tiktokManagement.items} gap={8} />
                  </div>
                )}
              </>
            )}

            {section.type === "campaigns" && (
              <>
                <div
                  style={styles.previewLead}
                >
                  {section.setupTitle}
                </div>
                <BulletList items={section.setupItems} gap={16} />
                <div
                  style={styles.previewLead}
                >
                  ניהול הקמפיינים כולל:
                </div>
                <BulletList items={section.managementItems} gap={8} />
              </>
            )}

            {section.type === "linkedin_network" && (
              <>
                <div
                  style={styles.previewLead}
                >
                  השירות כולל:
                </div>
                <BulletList items={section.setupItems} gap={16} />
                {section.softwareCosts && (
                  <div style={{ marginTop: "12px" }}>
                    <div
                      style={styles.previewLead}
                    >
                      עלויות תוכנה (תשלום ישיר לספקים – מנוי חודשי):
                    </div>
                    <BulletList
                      items={section.softwareCosts.map(
                        (sc) => `${sc.name} – ${sc.cost}`
                      )}
                      gap={8}
                    />
                  </div>
                )}
              </>
            )}

            {(section.type === "generic" || section.type === "custom") &&
              section.items &&
              section.items.length > 0 && (
                <BulletList items={section.items} gap={8} />
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
                      <td style={styles.previewTd}>{row.amount} ש"ח</td>
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

                  marginTop: "8px",
                }}
              >
                {proposalData.totalMonths
                  ? `סה"כ: ${proposalData.totalAmount} * ${proposalData.totalMonths} = ${proposalData.totalAmount * proposalData.totalMonths} ש"ח`
                  : `סה"כ: ${proposalData.totalAmount} ש"ח`}
              </div>
            )}
          </div>
        )}

        {/* Notes + appendix.
            This wrapper is what exportPdf.js looks for: everything from here
            down is forced onto its own single page, matching how the printed
            proposals are laid out. */}
        <div id="proposal-tail">
          {allNotes.length > 0 && (
            <div>
              <div style={styles.previewNotesTitle}>הערות</div>
              {allNotes.map((note, i) => (
                <div key={i} style={styles.previewNote}>
                  <span style={{ position: "absolute", right: 0, fontSize: "9px" }}>
                    {GLYPH.circle}
                  </span>
                  {note}
                </div>
              ))}
            </div>
          )}

          {/* Appendix */}
          {proposalData.includeAppendix && (
            <div
              style={{
                marginTop: "26px",
              }}
            >
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: "700",

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
                          borderBottom: `1px solid ${DOC.rule}`,
                          marginBottom: "8px",
                          height: "40px",
                        }}
                      />
                      <div style={{ fontSize: "12px", }}>
                        חתימה וחותמת
                      </div>
                    </div>
                    <div style={{ width: "60px" }} />
                    <div style={{ textAlign: "center", flex: 1 }}>
                      <div
                        style={{
                          borderBottom: `1px solid ${DOC.rule}`,
                          marginBottom: "8px",
                          height: "40px",
                        }}
                      />
                      <div style={{ fontSize: "12px", }}>
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
    </div>
  );
}
