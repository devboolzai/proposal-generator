import { useProposal } from "../state/useProposal";
import { styles } from "../styles/appStyles";
import { PAYMENT_TERMS_OPTIONS } from "../constants/proposalDefaults";
import AutoTextarea from "./AutoTextarea";

export default function Step4Notes() {
  const { proposalData, updateField, toggleNote, addNote, updateNote, removeNote } =
    useProposal();

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
          הערות (סמן כדי לכלול בהצעה, לחץ על הטקסט כדי לערוך)
        </label>
        {proposalData.notes.map((note, idx) => {
          const textStyle = {
            textDecoration: note.checked ? "none" : "line-through",
          };
          return (
            <div
              key={idx}
              style={{ ...styles.noteRow, opacity: note.checked ? 1 : 0.4 }}
            >
              <span
                style={{ ...styles.checkbox(note.checked), marginTop: "3px" }}
                onClick={() => toggleNote(idx)}
              >
                {note.checked ? "✓" : ""}
              </span>
              {note.text.includes("{paymentTerms}") ? (
                // Follows the payment-terms dropdown above, so it is changed
                // there rather than edited here.
                <span style={{ ...textStyle, flex: 1, padding: "2px 9px" }}>
                  {note.text.replace("{paymentTerms}", proposalData.paymentTerms)}
                </span>
              ) : (
                <AutoTextarea
                  style={{ ...styles.inlineInput, ...textStyle }}
                  value={note.text}
                  placeholder="הערה חדשה"
                  autoFocus={note.text === ""}
                  onChange={(e) => updateNote(idx, e.target.value)}
                />
              )}
              <button
                style={styles.iconBtn}
                title="מחיקת הערה"
                onClick={() => removeNote(idx)}
              >
                ✕
              </button>
            </div>
          );
        })}

        <button
          style={{ ...styles.iconBtn, color: "#a5b4fc", marginTop: "6px" }}
          onClick={addNote}
        >
          + הוספת הערה
        </button>

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
