import { useState } from "react";
import { useProposal } from "../state/useProposal";
import { styles, BRAND, GLYPH } from "../styles/appStyles";
import { generateDocx } from "../exportDocx";
import { generatePdf } from "../exportPdf";
import ShareLinkModal from "./ShareLinkModal";

// Native list markers (list-style-type: disc) are positioned by html2canvas
// itself during PDF capture, and it ignores the RTL direction — the dots end
// up flush against the left edge of the page. Drawing the bullet as a real
// positioned element keeps it on the right in both the browser and the PDF,
// and preserves the hanging indent for items that wrap.
function BulletList({ items, gap = 16, glyph = GLYPH.check, color = BRAND.purple }) {
  return (
    <ul style={{ margin: `0 14px ${gap}px 0`, padding: 0, listStyleType: "none" }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            position: "relative",
            paddingRight: "20px",
            fontSize: "13px",
            marginBottom: "3px",
          }}
        >
          <span style={{ position: "absolute", right: 0, color }}>{glyph}</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function Preview() {
  const { proposalData, setPreviewMode, generatePreviewContent } = useProposal();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [sharing, setSharing] = useState(false);

  const sections = generatePreviewContent();
  const activeNotes = proposalData.notes
    .filter((n) => n.checked)
    .map((n) => n.text.replace("{paymentTerms}", `תנאי תשלום: ${proposalData.paymentTerms}`));
  const allNotes = [...activeNotes, ...proposalData.customNotes];

  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      await generatePdf(proposalData);
    } catch (err) {
      setPdfError(err.message || "יצירת ה-PDF נכשלה.");
    } finally {
      setPdfBusy(false);
    }
  };

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
          style={styles.btn("lg")}
          onClick={() => setSharing(true)}
          disabled={pdfBusy}
        >
          🔗 שליחה לחתימה
        </button>
        <button
          style={styles.btn("lg")}
          onClick={handleDownloadPdf}
          disabled={pdfBusy}
        >
          {pdfBusy ? "⏳ מייצר PDF…" : "📕 הורדה כ-PDF"}
        </button>
        <button
          style={styles.btn("lg")}
          onClick={() => generateDocx(proposalData, sections, allNotes)}
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
        <ShareLinkModal proposalData={proposalData} onClose={() => setSharing(false)} />
      )}

      <div style={styles.preview} id="proposal-preview">
        {/* Header */}
        <div style={styles.previewHeader}>
          <div>
            <div style={styles.previewDate}>
              תאריך: {proposalData.date}
            </div>
            <div style={{ fontSize: "15px", marginTop: "8px" }}>
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
              <p style={{ fontSize: "13px", color: BRAND.ink, marginBottom: "12px" }}>
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
                {section.managementSections.map((ms, mIdx) => (
                  <div key={mIdx}>
                    <div
                      style={{ ...styles.previewLead, marginTop: "12px" }}
                    >
                      ניהול עמוד {ms.platform} עסקי:
                    </div>
                    <BulletList items={ms.items} gap={8} />
                  </div>
                ))}
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
                  color: BRAND.purple,
                  marginTop: "8px",
                }}
              >
                סה"כ: {proposalData.totalAmount}
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
                color: BRAND.purple,
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
    </div>
  );
}
