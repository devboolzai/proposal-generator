import { useProposal } from "../state/useProposal";
import { styles } from "../styles/appStyles";

export default function Step3Pricing() {
  const { proposalData, updateField, addPricingRow, updatePricingRow, removePricingRow } = useProposal();

  return (
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
}
