import { useProposal } from "../state/useProposal";
import { styles } from "../styles/appStyles";
import { SERVICE_TEMPLATES } from "../constants/serviceTemplates";

export default function Step2Services() {
  const { selectedServiceTypes, serviceConfigs, toggleServiceType, updateServiceConfig, toggleServiceItem, isItemExcluded } = useProposal();

  return (
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
}
