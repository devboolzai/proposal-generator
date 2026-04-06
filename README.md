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

## מבנה הפרויקט

```
proposal-app/
├── index.html              # Entry point
├── vite.config.js          # Vite config
├── package.json
└── src/
    ├── main.jsx            # React mount
    ├── App.jsx             # App wrapper
    ├── ProposalGenerator.jsx  # UI הראשי - כל הטפסים והתצוגה
    └── exportDocx.js       # ייצוא Word עם docx-js
```

## פיצ'רים

- **9 סוגי שירותים מוכנים** מבוססים על ההצעות שלך
- **תמחור דינמי** — שורות, סוגים, סיכום
- **הערות סטנדרטיות** עם toggle להפעלה/כיבוי
- **נספח א'** — טופס הזמנת שירותים + הרשאת אשראי
- **ייצוא Word** — קובץ .docx מוכן עם RTL, טבלאות, bullets
- **תצוגה מקדימה** לפני הורדה
