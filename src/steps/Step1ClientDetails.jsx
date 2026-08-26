import { useProposal } from "../state/useProposal";
import { styles } from "../styles/appStyles";

export default function Step1ClientDetails() {
  const { proposalData, updateField } = useProposal();

  return (
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
}
