# GTM Site-Speed Auditor

A **Next.js 13 + Tailwind** web app that performs Google Tag Manager (GTM) performance audits for a list of URLs **using Lighthouse in headless Chrome**. The UI colour-codes metrics, exports results to CSV, and provides aggregated summaries.

![Screenshot](docs/screenshot.png)

---

## Table of Contents
1. Features
2. Tech Stack
3. Quick Start
4. Project Structure
5. Configuration
6. Contributing
7. For AI Agents & CI
8. License

---

## 1  Features
• Paste multiple URLs; audits run sequentially with progress bar & ETA  
• Runs a real Lighthouse audit in headless Chrome for each URL  
• Good / Warning / Critical thresholds with legend  
• CSV export & summary dashboard  
• Fully typed (TypeScript) and accessible (Radix + shadcn/ui)

---

## 2  Tech Stack
| Layer            | Library / Tool                        |
|------------------|---------------------------------------|
| Front-end UI     | React 18 / Next.js 13 (App Router)     |
| Styling          | Tailwind CSS, shadcn/ui, Radix UI      |
| Icons            | lucide-react                           |
| State & Forms    | React Hook Form, Zod (optional)        |
| API              | Next.js Route Handlers (`app/api/*`) + Lighthouse + chrome-launcher |
| Utilities        | clsx + tailwind-merge, date-fns        |
| Tooling          | ESLint, Prettier, TypeScript           |

---

## 3  Quick Start

### Prerequisites
* **Node.js ≥ 20**
* **Google Chrome (stable) installed locally** – `chrome-launcher` will auto-detect the binary.


```bash
# 1. Install dependencies
npm ci          # or pnpm install / yarn

# 2. Run in dev mode
npm run dev     # http://localhost:3000
#   If audits fail, make sure Chrome is installed and not blocked by sandbox flags.

# 3. Production build & start
npm run build
npm start
```

---

## 4  Project Structure
```
gtm-site-speed/
├─ app/                # Next.js pages & API routes
│  ├─ page.tsx         # Main GTMPerformanceAuditor UI
│  └─ api/audit/route.ts   # Serverless endpoint (simulated metrics)
├─ components/
│  └─ ui/*             # Reusable shadcn + Radix UI wrappers
├─ hooks/              # Custom React hooks
├─ lib/                # Utility helpers (e.g. cn())
├─ public/             # Static assets (add screenshots here)
├─ tailwind.config.ts  # Tailwind theme (CSS variables)
├─ next.config.js
│  └─ api/audit/route.ts   # Serverless endpoint (real Lighthouse audit)
└─ ...
```

---

## 5  Configuration

| Setting | File | Description |
|---------|------|-------------|
| Performance thresholds | `app/page.tsx` → `getPerformanceStatus()` | Tweak warning / critical cut-offs |
| Lighthouse flags | `app/api/audit/route.ts` | Edit `chromeFlags` array if Chrome fails to launch (e.g. replace `--headless=new` with `--headless`) |
| Tailwind theme colours | `tailwind.config.ts` | Uses CSS variables for easy theming |
| Environment variables | `.env.local` (none required by default) |

---

## 6  Contributing

1. **Branch naming**  
   `feat/feature-name`, `fix/bug-name`, `chore/task-name`

2. **Coding style**  
   • Run `npm run lint` and fix all issues.  
   • Keep components small & typed.  
   • Prefer utility-first Tailwind classes; use `cn()` to merge.

3. **Commit messages (Conventional Commits)**
```
feat: add CSV export button
fix(api): handle invalid URL error
```

4. **Pull Request checklist**
- [ ] Lint passes (`npm run lint`)
- [ ] App builds (`npm run build`)
- [ ] Added/updated tests if needed
- [ ] Updated docs / README if behaviour changes

5. **Good first issues**
   • Replace synthetic API with real Lighthouse CI call  
   • Add dark-mode toggle in `layout.tsx`  
   • Write unit tests for `calculateSummary()`

---

## 7  Troubleshooting
Common issues and fixes are documented in [`error-log.md`](./error-log.md).

---

## 8  For AI Agents & CI

Automated tools can safely contribute by running:

```bash
npm run lint          # ESLint + TypeScript
npm test              # Jest (if/when added)
npm run build         # Build verification
```

Rules:
* **Do not** commit generated `.next/` files.  
* Preserve formatting (`prettier --write .`).  
* Touch only necessary files; keep PRs focused.

---

## 9  License
MIT © 2025 Rajeev Gill
