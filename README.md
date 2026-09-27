# מחולל הצעות מחיר | Proposal Generator

אפליקציית React להפקת הצעות מחיר בפורמט Word (.docx) עם תמיכה מלאה ב-RTL עברית.

## התקנה מהירה

```bash
npm install
npm run dev
```

האפליקציה תרוץ על `http://localhost:5173`

להרצה מלאה מול ה-API (כולל ייצוא PDF/Word), ראו [פיתוח מקומי](#פיתוח-מקומי) למטה.

## העלאה לשרת

שתי האפליקציות רצות על VPS אחד מאחורי nginx, כ-`proposal-gen` (`:3000`)
ו-`proposal-sign` (`:3001`) — ראו את הפירוט בטבלה למטה.

הפריסה עצמה היא סקריפט אחד:

```bash
./scripts/deploy.sh [gen|sign|both]
```

הוא בונה מקומית, מעביר את התוצר לדרופלט, מתקין שם רק תלויות production, מזיז
את הסימלינק `current` לגרסה החדשה ומפעיל מחדש את ה-service המתאים. הוא שומר
את 3 הגרסאות האחרונות, כך שרולבק הוא רק החזרת הסימלינק לגרסה הקודמת ואתחול
מחדש של ה-service — בלי build מחדש.

## חתימה דיגיטלית של לקוחות

מלבד ההורדה הידנית, אפשר לשלוח את ההצעה לחתימה. במסך התצוגה המקדימה יש כפתור
"🔗 שליחה לחתימה": הוא מייצר PDF, יוצר קישור אישי ושולח אותו במייל ללקוח.
הלקוח קורא את ההצעה, חותם בציור על המסך, ומקבל — יחד עם Boolzai — עותק חתום במייל.

### שתי אפליקציות על שרת אחד

הריפו הזה מכיל **שתי** אפליקציות נפרדות, כדי שלקוח לעולם לא יקבל כתובת שמגישה
את קוד המחולל:

| פרויקט | service | דומיין | קהל |
|---|---|---|---|
| `proposal-generator` | `proposal-gen` | `quote.boolzai.co.il` | פנימי |
| `proposal-sign` | `proposal-sign` | `sign.boolzai.co.il` | לקוחות |

מה שמחבר ביניהן זו תיקיית `/var/lib/proposals` (`PROPOSALS_DIR`) המשותפת
לשתיהן. אין DB: כל הצעה היא תיקייה אחת, `proposals/<token>/`, עם `meta.json`,
`original.pdf`, `signed.pdf` ו-`proposal.docx`.

### מספר הצעה

לכל הצעה יש מספר רץ ייחודי, שמתחיל ב-**50001** ועולה באחד. המספר מוקצה בכניסה
למסך התצוגה המקדימה (`POST /api/proposal-id`), מודפס בראש ההצעה — ולכן נכנס
אוטומטית ל-PDF, שהוא צילום של אותו מסך — ומופיע גם בקובץ ה-Word, בשם הקובץ,
בשורת הנושא של המיילים ובגוף ההודעה. הוא נשמר ב-`meta.json` ואינו משתנה לעולם.

> ⚠️ **אין למחוק את `counters/proposal-id.json`.** זה המונה, והוא ה-state היחיד
> שאי אפשר לשחזר: מחיקתו תחזיר את המספור ל-50001 ותנפיק מספרים שכבר נמצאים על
> הצעות אצל לקוחות.

הקצאה שלא הבשילה להצעה שנשלחה משאירה חור ברצף — זה תקין ומצופה. ההקצאה עצמה
אטומית: היא מוגנת בתור פנים-תהליכי ובנעילת קובץ, ולכן שתי הקצאות בו-זמניות
יקבלו שני מספרים שונים.

הקוד המשותף יושב ב-[shared/](shared/) והוא נטול תלויות npm בכוונה — רק
`node:` builtins — כי כל אפליקציה נפרסת מהתיקייה שלה עם ה-node_modules שלה,
ולא רואה את זו של האחרת. הפרימיטיבים של מערכת הקבצים חיים ב-`shared/fsStore.js`,
ה-HTTP adapter ב-`shared/routes.js`, וה-`api/_lib/store.js` של כל אפליקציה הוא
ה-store הדק שלה מעליהם.

### הקמה ראשונית

1. להריץ את `deploy/bootstrap.sh` על הדרופלט.
2. ליצור Cloudflare Origin certificate, להתקין אותו על הדרופלט, ולהגדיר SSL
   ל-Full (strict).
3. לכתוב את קובצי הסביבה `/etc/proposal-generator.env` ו-`/etc/proposal-sign.env`.
4. לאמת את הדומיין `boolzai.co.il` ב-[Resend](https://resend.com) (רשומות
   SPF/DKIM הקיימות).
5. להריץ `scripts/deploy.sh`.
6. להצביע את רשומות ה-DNS של `quote` ו-`sign` אל הדרופלט, עם Cloudflare proxy
   דלוק.

נעילת המחולל היא כיום כלל Cloudflare קיים על `quote`, יחד עם `APP_ACCESS_CODE`
שכבר נדרש בכל endpoint שכותב.

### פיתוח מקומי

כל אפליקציה רצה בשני מסופים — השרת האמיתי מצד אחד, ו-Vite עם proxy מצידו השני.
ה-API אמיתי לגמרי, כך שגם ייצוא PDF ו-Word עובדים מקומית בדיוק כמו בפרודקשן.

```bash
# מסוף 1 — API של המחולל (מאזין על :3000)
node --env-file=.env.local server.js

# מסוף 2 — קליינט המחולל (Vite על :5173, מעביר /api ל-:3000)
npm run dev
```

```bash
# מסוף 3 — API של דף החתימה (מאזין על :3001)
cd sign && node --env-file=.env.local server.js

# מסוף 4 — קליינט דף החתימה (Vite על :5174, מעביר /api ל-:3001)
cd sign && npm run dev
```

צרו את `.env.local` שבשורש מתוך [.env.example](.env.example), ואת
`sign/.env.local` מתוך [sign/.env.example](sign/.env.example). בשני הקבצים
הוסיפו `PROPOSALS_DIR` שמצביע לאותה תיקיית scratch, והתעלמו מ-`BLOB_READ_WRITE_TOKEN`
— הוא כבר לא בשימוש. בקובץ שבשורש הגדירו גם `SIGN_BASE_URL=http://localhost:5174`.

### בדיקות

```bash
npm test
```

מכסה את מודל הנתונים המשותף, הוספת עמוד החתימה ל-PDF, ה-file store, הקצאת
מספרי ההצעות, ה-HTTP adapter וההעלאה המקוטעת (chunked upload).

## מבנה הפרויקט

```
proposal-app/
├── index.html
├── vite.config.js
├── package.json
├── server.js               # שרת ה-API (Node http, ללא Vercel)
├── shared/                 # מודל הנתונים המשותף לשני הפרויקטים (ללא תלויות)
│   ├── proposal.js         #   נתיבים, סטטוסים, תוקף, מונה המספרים, מבנה meta.json
│   ├── http.js             #   עזרי בקשה/תשובה
│   ├── fsStore.js          #   הפרימיטיבים של מערכת הקבצים
│   ├── routes.js           #   ה-HTTP adapter המשותף לשתי האפליקציות
│   └── emailTemplate.js    #   מעטפת המייל הממותגת
├── api/                    # פונקציות צד-המוכר (יצירת קישור ושליחתו)
│   └── proposal-id.js      #   הקצאת מספר ההצעה הבא
├── sign/                   # אפליקציה נפרדת — דף החתימה של הלקוח
│   ├── server.js           #   שרת ה-API שלה, על פורט 3001
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
