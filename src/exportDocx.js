import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  LevelFormat,
  BorderStyle,
  WidthType,
  ShadingType,
  PageBreak,
  ImageRun,
} from "docx";
import { saveAs } from "file-saver";

let _coverImageBuffer = null;
async function getCoverImage() {
  if (_coverImageBuffer) return _coverImageBuffer;
  const resp = await fetch("/cover-image.jpg");
  const blob = await resp.blob();
  _coverImageBuffer = await blob.arrayBuffer();
  return _coverImageBuffer;
}

const FONT = "Jura";           // Latin/English font
const FONT_CS = "Fb Gandalf";  // Hebrew (Complex Script) font
const COLOR_PRIMARY = "4338CA";
const COLOR_HEADER_BG = "EEF2FF";
const COLOR_BORDER = "C7D2FE";
const COLOR_LIGHT_BORDER = "E2E8F0";
const COLOR_NOTES_BG = "F8FAFC";

const border = (color = COLOR_LIGHT_BORDER) => ({
  style: BorderStyle.SINGLE,
  size: 1,
  color,
});
const borders = (color) => ({
  top: border(color),
  bottom: border(color),
  left: border(color),
  right: border(color),
});
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function rtlRun(text, opts = {}) {
  return new TextRun({
    text,
    font: {
      ascii: FONT,
      hAnsi: FONT,
      eastAsia: FONT,
      cs: FONT_CS,
      complexScript: FONT_CS,
    },
    rightToLeft: true,
    ...opts,
  });
}

function rtlParagraph(children, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 120 },
    ...opts,
    children: Array.isArray(children) ? children : [children],
  });
}

function heading(text, level = 1) {
  const sizes = { 1: 32, 2: 28, 3: 24 };
  return rtlParagraph(
    [
      rtlRun(text, {
        bold: true,
        size: sizes[level] || 24,
        color: COLOR_PRIMARY,
      }),
    ],
    { spacing: { before: level === 1 ? 360 : 240, after: 200 } }
  );
}

function bulletItem(text, ref = "bullets") {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: [rtlRun(text, { size: 22 })],
  });
}

export async function generateDocx(proposalData, sections, activeNotes, proposalId) {
  if (!Number.isInteger(proposalId)) {
    throw new Error("לא הוקצה מספר להצעה — יש לרענן את מסך התצוגה המקדימה.");
  }

  const coverImageData = await getCoverImage();
  const docChildren = [];

  // ── Header ──
  // Same line, and same position, as the on-screen preview and the PDF.
  docChildren.push(
    rtlParagraph(
      [
        rtlRun(`הצעת מחיר מס' ${proposalId}`, {
          size: 24,
          bold: true,
          color: COLOR_PRIMARY,
        }),
      ],
      { spacing: { after: 80 } }
    )
  );

  docChildren.push(
    rtlParagraph(
      [
        rtlRun(`תאריך: ${proposalData.date}`, {
          size: 22,
          color: COLOR_PRIMARY,

        }),
      ],
      { spacing: { after: 80 } }
    )
  );

  const clientLine = proposalData.clientTitle
    ? `${proposalData.clientName} – ${proposalData.clientTitle}`
    : proposalData.clientName;

  docChildren.push(
    rtlParagraph([rtlRun(`לכבוד: ${clientLine}`, { size: 26, })], {
      spacing: { after: 60 },
    })
  );

  if (proposalData.companyName) {
    docChildren.push(
      rtlParagraph(
        [rtlRun(`עבור: ${proposalData.companyName}`, { size: 24 })],
        { spacing: { after: 200 } }
      )
    );
  }

  // Divider
  docChildren.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_PRIMARY },
      },
      spacing: { after: 300 },
      children: [],
    })
  );

  // ── Subject ──
  if (proposalData.subject) {
    docChildren.push(
      rtlParagraph(
        [
          rtlRun(`הנידון: ${proposalData.subject}`, {
            size: 32,
            
            color: "312E81",
          }),
        ],
        { spacing: { after: 300 } }
      )
    );
  }

  // ── Service Sections ──
  sections.forEach((section) => {
    docChildren.push(heading(section.title, 2));

    if (section.description) {
      docChildren.push(
        rtlParagraph([rtlRun(section.description, { size: 22, color: "475569" })], {
          spacing: { after: 200 },
        })
      );
    }

    if (section.type === "social") {
      docChildren.push(
        rtlParagraph(
          [rtlRun("הקמת עמודים או תחילת פעילות:", { size: 22, bold: true })],
          { spacing: { after: 100 } }
        )
      );
      section.setupItems.forEach((item) => docChildren.push(bulletItem(item)));
      docChildren.push(rtlParagraph([], { spacing: { after: 100 } }));

      section.managementSections.forEach((ms) => {
        docChildren.push(
          rtlParagraph(
            [
              rtlRun(`ניהול עמוד ${ms.platform} עסקי:`, {
                size: 22,
                bold: true,
              }),
            ],
            { spacing: { before: 160, after: 100 } }
          )
        );
        ms.items.forEach((item) => docChildren.push(bulletItem(item)));
      });
    }

    if (section.type === "campaigns") {
      docChildren.push(
        rtlParagraph(
          [rtlRun(section.setupTitle, { size: 22, bold: true })],
          { spacing: { after: 100 } }
        )
      );
      section.setupItems.forEach((item) => docChildren.push(bulletItem(item)));
      docChildren.push(rtlParagraph([], { spacing: { after: 100 } }));

      docChildren.push(
        rtlParagraph(
          [rtlRun("ניהול הקמפיינים כולל:", { size: 22, bold: true })],
          { spacing: { before: 160, after: 100 } }
        )
      );
      section.managementItems.forEach((item) =>
        docChildren.push(bulletItem(item))
      );
    }

    if (section.type === "linkedin_network") {
      docChildren.push(
        rtlParagraph(
          [rtlRun("השירות כולל:", { size: 22, bold: true })],
          { spacing: { after: 100 } }
        )
      );
      section.setupItems.forEach((item) => docChildren.push(bulletItem(item)));

      if (section.softwareCosts) {
        docChildren.push(
          rtlParagraph(
            [
              rtlRun(
                "עלויות תוכנה (תשלום ישיר לספקים – מנוי חודשי):",
                { size: 22, bold: true }
              ),
            ],
            { spacing: { before: 200, after: 100 } }
          )
        );
        section.softwareCosts.forEach((sc) =>
          docChildren.push(bulletItem(`${sc.name} – ${sc.cost}`))
        );
      }
    }

    if (
      (section.type === "generic" || section.type === "custom") &&
      section.items?.length > 0
    ) {
      section.items.forEach((item) => docChildren.push(bulletItem(item)));
    }

    docChildren.push(rtlParagraph([], { spacing: { after: 200 } }));
  });

  // ── Pricing Table ──
  const pricingRows = proposalData.pricingRows.filter((r) => r.description);
  if (pricingRows.length > 0) {
    docChildren.push(heading("דמי ניהול", 2));

    const hasNotes = pricingRows.some((r) => r.note);
    const colWidths = hasNotes ? [3200, 2000, 1800, 2000] : [4200, 2500, 2200];
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const headerLabels = hasNotes
      ? ["פירוט", "סכום", "סוג", "הערה"]
      : ["פירוט", "סכום", "סוג"];

    const headerRow = new TableRow({
      children: headerLabels.map(
        (label, i) =>
          new TableCell({
            width: { size: colWidths[i], type: WidthType.DXA },
            borders: borders(COLOR_BORDER),
            shading: { fill: COLOR_HEADER_BG, type: ShadingType.CLEAR },
            margins: cellMargins,
            children: [
              rtlParagraph(
                [rtlRun(label, { size: 22, bold: true, color: COLOR_PRIMARY })],
                { spacing: { after: 0 } }
              ),
            ],
          })
      ),
    });

    const dataRows = pricingRows.map(
      (row) =>
        new TableRow({
          children: (hasNotes
            ? [row.description, row.amount, row.unit, row.note || ""]
            : [row.description, row.amount, row.unit]
          ).map(
            (val, i) =>
              new TableCell({
                width: { size: colWidths[i], type: WidthType.DXA },
                borders: borders(COLOR_LIGHT_BORDER),
                margins: cellMargins,
                children: [
                  rtlParagraph([rtlRun(val, { size: 22 })], {
                    spacing: { after: 0 },
                  }),
                ],
              })
          ),
        })
    );

    docChildren.push(
      new Table({
        width: { size: tableWidth, type: WidthType.DXA },
        columnWidths: colWidths,
        rows: [headerRow, ...dataRows],
      })
    );

    docChildren.push(rtlParagraph([], { spacing: { after: 120 } }));

    if (proposalData.totalMonths) {
      docChildren.push(
        rtlParagraph([
          rtlRun("כמות חודשים: ", { size: 22, bold: true }),
          rtlRun(proposalData.totalMonths, { size: 22 }),
        ])
      );
    }

    if (proposalData.totalAmount) {
      docChildren.push(
        rtlParagraph(
          [
            rtlRun(`סה"כ: ${proposalData.totalAmount}`, {
              size: 26,
              bold: true,
              color: "312E81",
            }),
          ],
          { spacing: { before: 120, after: 300 } }
        )
      );
    }
  }

  // ── Notes ──
  // Same rule as the PDF: the notes open a page of their own, so the pricing
  // table and its total stay together on the page above.
  if (activeNotes.length > 0) {
    docChildren.push(new Paragraph({ children: [new PageBreak()] }));
    docChildren.push(heading("הערות", 2));
    activeNotes.forEach((note) => docChildren.push(bulletItem(note, "noteBullets")));
    docChildren.push(rtlParagraph([], { spacing: { after: 200 } }));
  }

  // ── Appendix ──
  if (proposalData.includeAppendix) {
    docChildren.push(new Paragraph({ children: [new PageBreak()] }));
    docChildren.push(
      heading("נספח א' – הזמנת שירותי פרסום דיגיטליים", 1)
    );
    docChildren.push(
      rtlParagraph([rtlRun("פרטי הלקוח:", { size: 24, bold: true })], {
        spacing: { after: 160 },
      })
    );

    const formRows = [
      ["שם העסק:", "", "מספר ח.פ/ע.מ:", ""],
      ["כתובת העסק:", "", "טלפון:", ""],
      ["שם פרטי:", "", "שם משפחה:", ""],
      ["ת.ז.:", "", 'דוא"ל:', ""],
    ];

    const formColWidths = [2000, 2500, 2000, 2500];
    const formTableWidth = formColWidths.reduce((a, b) => a + b, 0);

    docChildren.push(
      new Table({
        width: { size: formTableWidth, type: WidthType.DXA },
        columnWidths: formColWidths,
        rows: formRows.map(
          (row) =>
            new TableRow({
              children: row.map(
                (cell, i) =>
                  new TableCell({
                    width: { size: formColWidths[i], type: WidthType.DXA },
                    borders: borders(COLOR_LIGHT_BORDER),
                    margins: cellMargins,
                    children: [
                      rtlParagraph(
                        [
                          rtlRun(cell || "\u00A0", {
                            size: 22,
                            bold: i % 2 === 0 && cell !== "",
                          }),
                        ],
                        { spacing: { after: 0 } }
                      ),
                    ],
                  })
              ),
            })
        ),
      })
    );

    if (proposalData.includeSignature) {
      docChildren.push(rtlParagraph([], { spacing: { after: 300 } }));
      docChildren.push(
        rtlParagraph(
          [rtlRun("הרשאה לחיוב כרטיס אשראי:", { size: 24, bold: true })],
          { spacing: { after: 160 } }
        )
      );

      const ccRows = [
        ["סוג הכרטיס:", "", "סכום החיוב:", ""],
        ["מספר הכרטיס:", "", "תוקף:", ""],
        ["CVV:", "", "", ""],
      ];

      docChildren.push(
        new Table({
          width: { size: formTableWidth, type: WidthType.DXA },
          columnWidths: formColWidths,
          rows: ccRows.map(
            (row) =>
              new TableRow({
                children: row.map(
                  (cell, i) =>
                    new TableCell({
                      width: { size: formColWidths[i], type: WidthType.DXA },
                      borders: borders(COLOR_LIGHT_BORDER),
                      margins: cellMargins,
                      children: [
                        rtlParagraph(
                          [
                            rtlRun(cell || "\u00A0", {
                              size: 22,
                              bold: i % 2 === 0 && cell !== "",
                            }),
                          ],
                          { spacing: { after: 0 } }
                        ),
                      ],
                    })
                ),
              })
          ),
        })
      );

      docChildren.push(rtlParagraph([], { spacing: { after: 500 } }));

      // Signature lines
      const sigColWidths = [4000, 1000, 4000];
      docChildren.push(
        new Table({
          width: { size: 9000, type: WidthType.DXA },
          columnWidths: sigColWidths,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 4000, type: WidthType.DXA },
                  borders: {
                    top: border("FFFFFF"),
                    left: border("FFFFFF"),
                    right: border("FFFFFF"),
                    bottom: border("1E293B"),
                  },
                  margins: cellMargins,
                  children: [rtlParagraph([rtlRun("\u00A0")], { spacing: { after: 0 } })],
                }),
                new TableCell({
                  width: { size: 1000, type: WidthType.DXA },
                  borders: borders("FFFFFF"),
                  children: [rtlParagraph([rtlRun("")], { spacing: { after: 0 } })],
                }),
                new TableCell({
                  width: { size: 4000, type: WidthType.DXA },
                  borders: {
                    top: border("FFFFFF"),
                    left: border("FFFFFF"),
                    right: border("FFFFFF"),
                    bottom: border("1E293B"),
                  },
                  margins: cellMargins,
                  children: [rtlParagraph([rtlRun("\u00A0")], { spacing: { after: 0 } })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 4000, type: WidthType.DXA },
                  borders: borders("FFFFFF"),
                  margins: cellMargins,
                  children: [
                    new Paragraph({
                      bidirectional: true,
                      alignment: AlignmentType.CENTER,
                      children: [
                        rtlRun("חתימה וחותמת", { size: 20, color: "64748B" }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 1000, type: WidthType.DXA },
                  borders: borders("FFFFFF"),
                  children: [rtlParagraph([rtlRun("")], { spacing: { after: 0 } })],
                }),
                new TableCell({
                  width: { size: 4000, type: WidthType.DXA },
                  borders: borders("FFFFFF"),
                  margins: cellMargins,
                  children: [
                    new Paragraph({
                      bidirectional: true,
                      alignment: AlignmentType.CENTER,
                      children: [
                        rtlRun("תאריך", { size: 20, color: "64748B" }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
    }
  }

  // ── Build Document ──
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.RIGHT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
        {
          reference: "noteBullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.RIGHT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
          },
        },
        children: [
          new Paragraph({
            spacing: { before: 0, after: 0, line: 240 },
            children: [
              new ImageRun({
                data: coverImageData,
                transformation: { width: 595, height: 842 },
                floating: {
                  horizontalPosition: { offset: 0 },
                  verticalPosition: { offset: 0 },
                  behindDocument: true,
                },
              }),
            ],
          }),
        ],
      },
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
          bidi: true,
        },
        children: docChildren,
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  // The number leads, so a folder of proposals sorts and searches by it.
  const who = proposalData.companyName
    ? proposalData.companyName.replace(/\s+/g, "_")
    : proposalData.date.replace(/\//g, "-");
  saveAs(buffer, `הצעת_מחיר_${proposalId}_${who}.docx`);
}
