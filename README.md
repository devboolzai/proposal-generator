# מחולל הצעות מחיר | Proposal Generator

אפליקציית React להפקת הצעות מחיר בפורמט Word (.docx) עם תמיכה מלאה ב-RTL עברית.

## התקנה מהירה

```bash
npm install
npm run dev
```

האפליקציה תרוץ על `http://localhost:5173`

## העלאה ל-Vercel

### אפשרות 1: מ-GitHub (מומלץ)
1. העלה את הפרויקט ל-GitHub repo
2. היכנס ל-[vercel.com](https://vercel.com) והתחבר עם GitHub
3. לחץ "Import Project" ובחר את ה-repo
4. Vercel יזהה אוטומטית שזה Vite — פשוט לחץ Deploy

### אפשרות 2: מ-CLI
```bash
npm i -g vercel
vercel
```

### אפשרות 3: Netlify
1. הרץ `npm run build`
2. גרור את תיקיית `dist/` לתוך [app.netlify.com/drop](https://app.netlify.com/drop)

## חתימה דיגיטלית של לקוחות

מלבד ההורדה הידנית, אפשר לשלוח את ההצעה לחתימה. במסך התצוגה המקדימה יש כפתור
"🔗 שליחה לחתימה": הוא מייצר PDF, יוצר קישור אישי ושולח אותו במייל ללקוח.
הלקוח קורא את ההצעה, חותם בציור על המסך, ומקבל — יחד עם Boolzai — עותק חתום במייל.

### שני פרויקטים ב-Vercel

הריפו הזה מכיל **שני** פרויקטים נפרדים ב-Vercel, כדי שלקוח לעולם לא יקבל כתובת
שמגישה את קוד המחולל:

| פרויקט | Root Directory | דומיין | קהל |
|---|---|---|---|
| `proposal-generator` | `.` | הדומיין הקיים | פנימי |
| `proposal-sign` | `sign` | `sign.boolzai.co.il` | לקוחות |

שניהם חייבים להיות מחוברים **לאותו Blob Store** — זה מה שמחבר ביניהם. אין DB:
כל הצעה היא תיקייה אחת ב-Blob (`proposals/<token>/`) עם `meta.json`,
`original.pdf` ו-`signed.pdf`.

הקוד המשותף יושב ב-[shared/](shared/) והוא נטול תלויות npm בכוונה — רק
`node:` builtins — כי `sign/` נבנה עם Root Directory משלו ולא רואה את ה-node_modules
שמעליו. קריאות ה-Blob עצמן חיות ב-`api/_lib/store.js` של כל פרויקט בנפרד.

### הקמה ראשונית

1. ליצור Blob Store ולחבר אותו לשני הפרויקטים.
2. לאמת את הדומיין `boolzai.co.il` ב-[Resend](https://resend.com) (רשומות SPF/DKIM).
3. להוסיף CNAME עבור `sign` אל הפרויקט השני.
4. להגדיר משתני סביבה — ראו [.env.example](.env.example) ו-[sign/.env.example](sign/.env.example).
5. לנעול את המחולל: Deployment Protection ב-Vercel, או לכל הפחות `APP_ACCESS_CODE`
   שכבר נדרש בכל endpoint שכותב.

### פיתוח מקומי

`npm run dev` מריץ רק את הקליינט — הוא לא מריץ את `api/`. לזרימה המלאה צריך
שני מופעים של `vercel dev`:

```bash
npm i -g vercel

# מסוף 1 — המחולל
vercel link && vercel env pull .env.local && vercel dev

# מסוף 2 — דף החתימה
cd sign && vercel link && vercel env pull .env.local && vercel dev --listen 3001
```

ולהגדיר `SIGN_BASE_URL=http://localhost:3001` ב-`.env.local` שבשורש.

### בדיקות

```bash
npm test
```

מכסה את מודל הנתונים המשותף ואת הוספת עמוד החתימה ל-PDF.

## מבנה הפרויקט

```
proposal-app/
├── index.html
├── vite.config.js
├── package.json
├── shared/                 # מודל הנתונים המשותף לשני הפרויקטים (ללא תלויות)
│   ├── proposal.js         #   נתיבים, סטטוסים, תוקף, מבנה meta.json
│   ├── http.js             #   עזרי בקשה/תשובה
│   └── emailTemplate.js    #   מעטפת המייל הממותגת
├── api/                    # פונקציות צד-המוכר (יצירת קישור ושליחתו)
├── sign/                   # פרויקט Vercel נפרד — דף החתימה של הלקוח
│   ├── src/                #   SignPage, SignaturePad, SignatureBlock
│   └── api/                #   proposal-get / proposal-pdf / proposal-sign
└── src/
    ├── main.jsx            # React mount
    ├── App.jsx             # App wrapper
    ├── ProposalGenerator.jsx  # UI הראשי - כל הטפסים והתצוגה
    ├── share/              # יצירת קישור החתימה מתוך המחולל
    ├── steps/              # 5 שלבי האשף + ShareLinkModal
    ├── exportPdf.js        # ייצוא PDF (צילום DOM — ראו ההערה בראש הקובץ)
    └── exportDocx.js       # ייצוא Word עם docx-js
```

## פיצ'רים

- **9 סוגי שירותים מוכנים** מבוססים על ההצעות שלך
- **תמחור דינמי** — שורות, סוגים, סיכום
- **הערות סטנדרטיות** עם toggle להפעלה/כיבוי
- **נספח א'** — טופס הזמנת שירותים + הרשאת אשראי
- **ייצוא Word** — קובץ .docx מוכן עם RTL, טבלאות, bullets
- **תצוגה מקדימה** לפני הורדה
