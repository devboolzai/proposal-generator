import { describe, expect, it } from "vitest";
import {
  buildDocumentSections,
  createBlankSection,
  createItem,
  createSection,
  resolveText,
  socialTitle,
} from "./sections";

describe("buildDocumentSections", () => {
  it("renders a template section with its title and grouped items", () => {
    const [doc] = buildDocumentSections([createSection("campaigns_google")]);
    expect(doc.title).toBe("קמפיינים ממומנים בגוגל");
    expect(doc.groups.map((g) => g.heading)).toEqual([
      "בניית מסע הפרסום כוללת:",
      "ניהול הקמפיינים כולל:",
    ]);
    expect(doc.groups[0].items[0]).toBe("פתיחת חשבון פרסום בגוגל");
  });

  it("leaves out excluded and blank items, and groups left empty", () => {
    const section = createSection("design_gifs");
    const [first, ...rest] = section.groups[0].items;
    first.included = false;
    rest.forEach((item) => (item.text = "  "));
    expect(buildDocumentSections([section])[0].groups).toEqual([]);
  });

  it("fills placeholders from the fields, falling back to defaults", () => {
    const section = createSection("design_banners");
    section.fields.bannerCount = "5";
    const [doc] = buildDocumentSections([section]);
    expect(doc.groups[0].items[0]).toBe("עד 5 באנרים בגודל 1080*1080");
  });

  it("keeps a hand-edited line as typed", () => {
    const section = createSection("design_banners");
    section.groups[0].items[0].text = "עד 3 באנרים מונפשים";
    section.fields.bannerCount = "5";
    const [doc] = buildDocumentSections([section]);
    expect(doc.groups[0].items[0]).toBe("עד 3 באנרים מונפשים");
  });

  it("shows only the social groups of the picked platforms", () => {
    const section = createSection("social_management");
    section.platforms = ["TikTok"];
    const [doc] = buildDocumentSections([section]);
    expect(doc.title).toBe("ניהול עמוד טיקטוק עסקי");
    expect(doc.groups.map((g) => g.heading)).toEqual([
      "הקמת עמודים או תחילת פעילות:",
      "ניהול עמוד TikTok עסקי:",
    ]);
  });

  it("drops a social section with no platform picked", () => {
    const section = createSection("social_management");
    section.platforms = [];
    expect(buildDocumentSections([section])).toEqual([]);
  });

  it("uses a typed title over the platform one", () => {
    const section = createSection("social_management");
    section.title = "ניהול רשתות חברתיות";
    expect(buildDocumentSections([section])[0].title).toBe("ניהול רשתות חברתיות");
  });

  it("renders added sections and drops untouched blank ones", () => {
    const untouched = createBlankSection();
    const filled = createBlankSection();
    filled.title = "בניית דף נחיתה";
    filled.groups[0].items.push(createItem("עיצוב ופיתוח"));
    expect(buildDocumentSections([untouched, filled])).toEqual([
      {
        title: "בניית דף נחיתה",
        description: "",
        groups: [{ heading: "", items: ["עיצוב ופיתוח"] }],
      },
    ]);
  });

  it("does not share state between two copies of a template", () => {
    const a = createSection("campaigns_meta");
    const b = createSection("campaigns_meta");
    a.groups[0].items[0].text = "שונה";
    expect(b.groups[0].items[0].text).not.toBe("שונה");
    expect(a.id).not.toBe(b.id);
  });
});

describe("helpers", () => {
  it("resolveText leaves unknown placeholders alone", () => {
    expect(resolveText("{a} ו-{b}", { a: "1" })).toBe("1 ו-{b}");
  });

  it("socialTitle merges Facebook and Instagram", () => {
    expect(socialTitle(["Facebook", "Instagram", "LinkedIn"])).toBe(
      "ניהול עמודי פייסבוק ואינסטגרם ולינקדאין עסקי"
    );
  });
});
