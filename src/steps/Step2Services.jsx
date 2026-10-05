import { useProposal } from "../state/useProposal";
import { styles } from "../styles/appStyles";
import { SERVICE_TEMPLATES } from "../constants/serviceTemplates";
import { fieldValues, isGroupShown, resolveText, sectionTitle } from "../state/sections";
import AutoTextarea from "./AutoTextarea";

const addChip = {
  ...styles.serviceChip(false),
  borderStyle: "dashed",
  color: "#a5b4fc",
};

const addLink = { ...styles.iconBtn, color: "#a5b4fc", marginTop: "6px" };

export default function Step2Services() {
  const { sections, toggleTemplate, addBlankSection } = useProposal();
  const isPicked = (key) => sections.some((s) => s.templateKey === key);

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>🎯 בחירת שירותים</div>
        <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
          בחר את סוגי השירותים שברצונך לכלול בהצעה. כל סעיף ניתן לעריכה, וניתן
          להוסיף סעיפים משלך.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {Object.entries(SERVICE_TEMPLATES).map(([key, tpl]) => (
            <div
              key={key}
              style={styles.serviceChip(isPicked(key))}
              onClick={() => toggleTemplate(key)}
            >
              <span style={styles.checkbox(isPicked(key))}>
                {isPicked(key) ? "✓" : ""}
              </span>
              {tpl.label}
            </div>
          ))}
          <div style={addChip} onClick={addBlankSection}>
            + סעיף חדש
          </div>
        </div>
      </div>

      {sections.map((section, idx) => (
        <SectionCard
          key={section.id}
          section={section}
          isFirst={idx === 0}
          isLast={idx === sections.length - 1}
        />
      ))}

      {sections.length > 0 && (
        <button style={styles.btn()} onClick={addBlankSection}>
          + סעיף חדש
        </button>
      )}
    </div>
  );
}

function SectionCard({ section, isFirst, isLast }) {
  const {
    removeSection,
    moveSection,
    updateSection,
    addGroup,
    updateGroup,
    removeGroup,
    addItem,
    updateItem,
    removeItem,
  } = useProposal();

  const template = SERVICE_TEMPLATES[section.templateKey];
  const values = fieldValues(section);

  const setField = (key, value) =>
    updateSection(section.id, { fields: { ...section.fields, [key]: value } });

  const togglePlatform = (p) =>
    updateSection(section.id, {
      platforms: section.platforms.includes(p)
        ? section.platforms.filter((x) => x !== p)
        : [...section.platforms, p],
    });

  const moveBtn = (disabled) => ({
    ...styles.iconBtn,
    opacity: disabled ? 0.3 : 1,
    cursor: disabled ? "default" : "pointer",
  });

  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardTitle, justifyContent: "space-between" }}>
        <span>
          {template?.icon || "✨"} {template?.label || "סעיף מותאם אישית"}
        </span>
        <span>
          <button
            style={moveBtn(isFirst)}
            disabled={isFirst}
            title="הזזה למעלה"
            onClick={() => moveSection(section.id, -1)}
          >
            ▲
          </button>
          <button
            style={moveBtn(isLast)}
            disabled={isLast}
            title="הזזה למטה"
            onClick={() => moveSection(section.id, 1)}
          >
            ▼
          </button>
          <button
            style={styles.iconBtn}
            title="הסרת הסעיף"
            onClick={() => removeSection(section.id)}
          >
            ✕
          </button>
        </span>
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>
          כותרת הסעיף
          {section.title === null && " (מתעדכנת לפי הפלטפורמות)"}
        </label>
        <input
          style={styles.input}
          value={sectionTitle(section)}
          placeholder="לדוגמה: בניית דף נחיתה"
          onChange={(e) => updateSection(section.id, { title: e.target.value })}
        />
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>תיאור (לא חובה)</label>
        <AutoTextarea
          style={styles.input}
          value={section.description}
          onChange={(e) =>
            updateSection(section.id, { description: e.target.value })
          }
        />
      </div>

      {template?.platforms && (
        <div style={styles.fieldGroup}>
          <label style={styles.label}>פלטפורמות</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {template.platforms.map((p) => (
              <div
                key={p}
                style={styles.serviceChip(section.platforms.includes(p))}
                onClick={() => togglePlatform(p)}
              >
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {template?.fields && (
        <div style={styles.row}>
          {template.fields.map((f) => (
            <div key={f.key}>
              <label style={styles.label}>{f.label}</label>
              {f.options ? (
                <select
                  style={styles.select}
                  value={values[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                >
                  {f.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  style={styles.input}
                  placeholder={f.default}
                  value={section.fields[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {section.groups.map((group) => {
        const shown = isGroupShown(section, group);
        return (
          <div
            key={group.id}
            style={{ ...styles.fieldGroup, opacity: shown ? 1 : 0.5 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                style={{ ...styles.inlineInput, fontWeight: 700, color: "#94a3b8" }}
                value={group.heading}
                placeholder="כותרת משנה (לא חובה)"
                onChange={(e) =>
                  updateGroup(section.id, group.id, { heading: e.target.value })
                }
              />
              {group.platforms && (
                <span style={{ fontSize: "12px", color: "#64748b", flexShrink: 0 }}>
                  מוצג רק עבור {group.platforms.join(", ")}
                </span>
              )}
              <button
                style={styles.iconBtn}
                title="מחיקת תת-הרשימה"
                onClick={() => removeGroup(section.id, group.id)}
              >
                ✕
              </button>
            </div>

            {group.items.map((item) => (
              <div
                key={item.id}
                style={{ ...styles.noteRow, opacity: item.included ? 1 : 0.4 }}
              >
                <span
                  style={{ ...styles.checkbox(item.included), marginTop: "3px" }}
                  title={item.included ? "הסתרה מההצעה" : "הצגה בהצעה"}
                  onClick={() =>
                    updateItem(section.id, group.id, item.id, {
                      included: !item.included,
                    })
                  }
                >
                  {item.included ? "✓" : ""}
                </span>
                {/* Shows the line with its quick-fill values in place. Typing
                    saves it as plain text, so a hand-edited line keeps what
                    was typed even if the fields above change later. */}
                <AutoTextarea
                  style={{
                    ...styles.inlineInput,
                    textDecoration: item.included ? "none" : "line-through",
                  }}
                  value={resolveText(item.text, values)}
                  placeholder="פריט חדש"
                  autoFocus={item.text === ""}
                  onChange={(e) =>
                    updateItem(section.id, group.id, item.id, {
                      text: e.target.value,
                    })
                  }
                />
                <button
                  style={styles.iconBtn}
                  title="מחיקת פריט"
                  onClick={() => removeItem(section.id, group.id, item.id)}
                >
                  ✕
                </button>
              </div>
            ))}

            <button style={addLink} onClick={() => addItem(section.id, group.id)}>
              + הוספת פריט
            </button>
          </div>
        );
      })}

      <button style={styles.btn()} onClick={() => addGroup(section.id)}>
        + הוספת תת-רשימה
      </button>
    </div>
  );
}
