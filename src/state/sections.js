import { SERVICE_TEMPLATES } from "../constants/serviceTemplates";

// ============================================================
// SECTIONS - the services part of a proposal, as plain data.
//
// Picking a template copies it into a section the user then owns:
// every title, heading and item can be edited, added or removed
// without touching the template. buildDocumentSections() turns the
// sections into what the preview and the Word export render.
// ============================================================

// A counter rather than crypto.randomUUID(), which only exists in secure
// contexts — opening the dev server by LAN IP would break it. The ids only
// have to be unique within this page's lifetime.
let lastId = 0;
const newId = () => `s${++lastId}`;

export function createItem(text = "") {
  return { id: newId(), text, included: true };
}

export function createGroup(heading = "", items = [], platforms = null) {
  return { id: newId(), heading, platforms, items: items.map(createItem) };
}

export function createSection(templateKey) {
  const template = SERVICE_TEMPLATES[templateKey];
  return {
    id: newId(),
    templateKey,
    // null = follow the picked platforms (see sectionTitle).
    title: template.platforms ? null : template.title,
    description: template.description || "",
    fields: Object.fromEntries((template.fields || []).map((f) => [f.key, ""])),
    platforms: template.platforms ? [...template.defaultPlatforms] : null,
    groups: template.groups.map((g) => createGroup(g.heading, g.items, g.platforms)),
  };
}

export function createBlankSection() {
  return {
    id: newId(),
    templateKey: null,
    title: "",
    description: "",
    fields: {},
    platforms: null,
    groups: [createGroup()],
  };
}

/** The section's quick-fill values, falling back to each field's default. */
export function fieldValues(section) {
  const defs = SERVICE_TEMPLATES[section.templateKey]?.fields || [];
  return Object.fromEntries(
    defs.map((f) => [f.key, section.fields[f.key] || f.default])
  );
}

/** Fills `{key}` placeholders; unknown ones are left as typed. */
export function resolveText(text, values) {
  return text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

export function socialTitle(platforms) {
  const names = platforms
    .map((p) => {
      if (p === "Facebook" && platforms.includes("Instagram")) return null;
      if (p === "Instagram" && platforms.includes("Facebook"))
        return "פייסבוק ואינסטגרם";
      if (p === "TikTok") return "טיקטוק";
      if (p === "LinkedIn") return "לינקדאין";
      return p;
    })
    .filter(Boolean);
  return `ניהול עמוד${names.length > 1 ? "י" : ""} ${names.join(" ו")} עסקי`;
}

export function sectionTitle(section) {
  return section.title ?? socialTitle(section.platforms || []);
}

export function isGroupShown(section, group) {
  return !group.platforms || group.platforms.some((p) => section.platforms?.includes(p));
}

/**
 * What the document shows: `[{ title, description, groups: [{ heading, items }] }]`
 * with excluded and blank lines, hidden or empty groups, and empty sections
 * left out, and every placeholder filled in.
 */
export function buildDocumentSections(sections) {
  return sections.flatMap((section) => {
    // A platform picker with nothing picked has nothing to manage.
    if (section.platforms && section.platforms.length === 0) return [];

    const values = fieldValues(section);
    const groups = section.groups
      .filter((g) => isGroupShown(section, g))
      .map((g) => ({
        heading: g.heading.trim(),
        items: g.items
          .filter((item) => item.included)
          .map((item) => resolveText(item.text, values).trim())
          .filter(Boolean),
      }))
      .filter((g) => g.items.length > 0);

    const title = sectionTitle(section).trim();
    const description = section.description.trim();
    if (!title && !description && groups.length === 0) return [];

    return [{ title, description, groups }];
  });
}
