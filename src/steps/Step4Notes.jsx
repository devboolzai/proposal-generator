import { useProposal } from "../state/useProposal";
import { styles } from "../styles/appStyles";
import { PAYMENT_TERMS_OPTIONS } from "../constants/proposalDefaults";

export default function Step4Notes() {
  const { proposalData, updateField, toggleNote } = useProposal();

  return (
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
}
