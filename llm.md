*Last updated: 2026-03-21 by Antigravity AI*

This document serves as the **mandatory first read** and **primary project context** for any language model working inside this codebase. It allows the model to understand the project, make correct architectural decisions, follow conventions, and avoid common mistakes.

# 1. Project Overview
- **Project Name:** FinanceHub
- **Business Purpose:** A comprehensive personal finance management tool that goes beyond standard tracking. It categorizes spending into strategic buckets (OpEx - Maintenance of Life, CapEx - Projects and Business, Acumulação - Asset Acquisition) to provide a clear financial overview focused on wealth expansion instead of simple budgeting.
- **Target Audience:** Individuals seeking total control over their personal finances, aiming to clearly visualize the breakdown between "burned" money (OpEx) and "invested" money (CapEx/Acumulação).
- **Current Status:** Greenfield / Early stage. Currently migrating data operations from `localStorage` to Supabase (Database + Auth).
- **Production URL & Environments:**
  - Production: `https://financehub.app` (TBD)
  - Staging: `https://staging.financehub.app` (TBD)
  - Development: `http://localhost:5173`
- **Repository:** Main branch is `main`.
- **High-level Roadmap:**
  - *Phase 1:* Basic CRUD functionality, authentication via Supabase, dark/light theme, customized category grouping (OpEx, CapEx, Acumulação).
  - *Phase 2:* Credit card invoice management, data import features, dashboard charts visualization.
  - *Phase 3:* Subscriptions (Stripe), goal setting functionalities (expense reduction, income increase).

# 2. Architecture Overview

### Diagram
```text
[User Browser]
      │
      ├─ [UI Layer: HTML / CSS]
      │
      ├─ [Logic Layer: Vanilla JS Modules]
      │    ├─ app.js (Entry/Bootstrapper)
      │    ├─ auth.js (Authentication State)
      │    ├─ dashboard.js, expenses.js, etc. (Page & Component Logic)
      │    └─ storage.js (Supabase Client Abstraction)
      │
[Supabase Platform]
      ├─ [Supabase Auth] (JWT / Sessions)
      └─ [PostgreSQL DB] (pgREST API)
```

- **Architecture Type:** Single Page Application (SPA) - currently rendered mainly through static HTML with dynamic DOM manipulation using JS.
- **Reason:** Ensures rapid development and keeps the bundle lightweight without the overhead of heavy frameworks like React at this stage. It also provides a seamless experience for the user.
- **Separation of Responsibilities:**
  - **HTML (`index.html`):** Semantic structure of the application.
  - **CSS (`css/styles.css`):** Global styles, theme tokens (Dark/Light), component-specific styles using BEM-lite.
  - **JS Core (`js/`):** View logic, data binding, and API calls via Supabase Client (`storage.js`).
- **Data Flow:** User action → DOM Event Listener → Validation → `storage.js` call → Supabase generic API Response → Local state update → DOM Re-render.
- **Migration Path:** The stack is intentionally vanilla right now. If the UI complexity scales dramatically, a migration to React/Vite is planned for Phase 2 or 3.

# 3. Tech Stack

| Layer | Technology | Version | Reason |
|-------|------------|---------|--------|
| Language | Vanilla JavaScript | ES2022+ | No build step, fast start, low overhead |
| Markup | HTML5 | — | Semantic, accessible |
| Styling | CSS3 | — | Custom properties for theming, no framework |
| Module system | ES Modules (ESM) | native | Native browser support |
| Package manager | npm | `latest` | Standard ecosystem tooling |
| Build tool | None (TBD Vite) | — | Currently raw files, Vite planned for production |
| Backend / API | Supabase (PostgREST) | `v2` | Instant API, rapid prototyping, built-in real-time |
| Database | PostgreSQL | 15+ | Powered by Supabase, robust relational modeling |
| Auth | Supabase Auth | `v2` | Native integration with DB and Row Level Security |
| Hosting | Vercel / Netlify | TBD | Fast static delivery |
| CI/CD | GitHub Actions | TBD | Standard, free tier |
| Monitoring | TBD | — | PostHog or Sentry planned for Phase 2 |
| Testing | TBD | — | Jest or Vitest mapped for unit testing |

# 4. Project Structure

```
financehub-root/
├── index.html              # App entry point — root HTML shell containing all tab structures
├── css/
│   └── styles.css          # All CSS styling, custom properties (CSS variables), and dark/light themes
├── js/
│   ├── app.js              # JS entry point — bootstraps the app, navigation handling
│   ├── auth.js             # Supabase Authentication logic, login/signup handlers
│   ├── creditcard.js       # Credit card management, invoice parsing
│   ├── dashboard.js        # Main charting and overview metrics logic
│   ├── expenses.js         # Expense tracking (fixed/variable)
│   ├── import.js           # Excel/CSV statement importing logic
│   ├── income.js           # Income tracking operations
│   ├── investments.js      # Investment portfolio tracking
│   ├── settings.js         # App configuration, custom categories, theme toggle
│   ├── storage.js          # Main wrapper for Supabase database CRUD operations
│   └── utils.js            # Pure utility functions (formatting, date parsing)
├── extrato.xlsx            # Mock/Template sheet for import testing
├── .env.example            # Required environment variables stub
├── llm.md                  # This file — always up to date
└── README.md               # Human onboarding
```

# 5. Data Models

All models are synced with Supabase PostgreSQL tables. Row Level Security (RLS) policies mandate that every row contains the `user_id`.

```json
// Example — User Profile
{
  "id": "uuid-v4",
  "email": "user@example.com",
  "plan": "free | pro",
  "theme": "dark | light",
  "created_at": "ISO 8601"
}

// Example — Transaction (Income or Expense)
{
  "id": "uuid-v4",
  "user_id": "uuid-v4", // FK to auth.users
  "type": "income | expense",
  "amount": 1250.00,
  "date": "YYYY-MM-DD",
  "description": "Supermarket",
  "category": "Alimentação",
  "group": "OpEx | CapEx | Acumulação", // Core business grouping
  "payment_method": "credit_card | pix | debit",
  "status": "paid | pending",
  "created_at": "ISO 8601"
}

// Example — Credit Card
{
  "id": "uuid-v4",
  "user_id": "uuid-v4",
  "name": "Nubank Ultravioleta",
  "limit": 10000.00,
  "closing_day": 5,
  "due_day": 12,
  "created_at": "ISO 8601"
}
```

# 6. API Design
- **API Style:** BaaS via Supabase client (PostgREST underneath).
- **Base URL:** Defined via `SUPABASE_URL` env variable.
- **Auth Pattern:** Managed by the `@supabase/supabase-js` client using local storage session persistence (JWT Bearer tokens sent under the hood).
- **Responses/Errors:** Wrapped by `storage.js` to normalize returns for the UI components.
- **Pagination / Limits:** Handled via `.range()` or `.limit()` within `storage.js` queries.

```js
// Standard wrapper response pattern in storage.js
try {
  const { data, error } = await supabase.from('transactions').select('*');
  if (error) throw error;
  return data;
} catch (error) {
  console.error('[Supabase Error]:', error.message);
  showToast(error.message, 'error'); // centralized toast display
  return null;
}
```

# 7. Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `APP_ENV` | Yes | Current environment | `development` / `production` |
| `SUPABASE_URL` | Yes | Project URL | `https://xyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes | Public anon key | `eyJ...` |

> **Rules:**
> - **Never hardcode** any of these values in source files (`.js` files). Use a bundler replacement or load them dynamically if moving to Vite.
> - Client-side JS can only access the **anon key**. Never place the `service_role` key in this project.
> - Ensure GitHub Actions holds the production secrets.

# 8. Development Workflow

```bash
# 1. Clone the repo
git clone [repo-url] && cd FinanceHub

# 2. Setup environment variables
cp .env.example .env
# Open .env and insert your local/development Supabase URL and Anon Key

# 3. Run a local server (if using simple http server or Vite)
# (Assuming `npx serve .` or Live Server extension for raw HTML/JS)
npx serve .
# Application is live at http://localhost:3000
```

**Git Flow:**
- Main branch: `main` (always deployable)
- Feature branches: `feat/short-description`
- Bug fixes: `fix/schema-update`
- Commit convention: Conventional Commits (`feat: add opex categories`, `fix: supabase auth session persistence`).

# 9. Coding Conventions

#### File and Folder Naming
- All JS files: `kebab-case.js` (e.g. `storage.js`, `creditcard.js`).
- Assets: lowercase and hyphenated.

#### JavaScript
- **ES Modules preferred:** Even in vanilla JS, use `<script type="module">` if imports are adopted, or keep files carefully scoped if using globals loaded simply via script tags.
- **Async/Await:** All Supabase calls must use `async/await`. Avoid `.then()` chains.
- **Early Returns:** Check for errors first to avoid deep nesting.
- **Query Selectors:** Use `const el = document.getElementById('some-id')` or `document.querySelector('.class')`. Do not spam innerHTML updates unless safe (no user content).
  
```js
// ✅ Correct
export async function getExpenses() {
  const { data, error } = await supabase.from('transactions').select('*');
  if (error) {
    console.error(error);
    return null;
  }
  return data;
}

// ❌ Wrong
function getExpenses() {
  supabase.from('transactions').select('*').then(function(res) {
    // ... no early return, callback hell
  });
}
```

#### HTML
- **Semantic HTML:** `<header>`, `<main>`, `<section>`, `<footer>`.
- **Modals & Dialogs:** Should trigger cleanly via JS classes (e.g., adding `.active` to a `.modal` element).
- **IDs & Classes:** IDs for unique sections (e.g., `#dashboard-tab`), Classes for recurring styles (`.card`, `.btn`).

#### CSS
- **CSS Custom Properties:** Used extensively in `:root` inside `styles.css`.
- **Theming:** controlled via `data-theme="dark"` or a `.dark-theme` class on the `<body>`.
- **No `!important`:** Specificity matters. Use BEM-like structures to avoid conflicts.

```css
/* ✅ Correct */
:root {
  --bg-color: #ffffff;
  --text-color: #333333;
}
[data-theme="dark"] {
  --bg-color: #1a1a1a;
  --text-color: #f5f5f5;
}

/* ❌ Wrong */
.card { background-color: #1a1a1a !important; }
```

#### Error Handling
- Use a dedicated toast component (e.g., `utils.showToast(message, type)`) to display errors. Never use `alert()`.
- Wrap Supabase mutations in `try/catch`.

#### Comments
- JSDoc docstrings for critical utilities. Explain *why*, not *what*.

# 10. Key Business Rules
- **Category Grouping:** The core differentiator. Transactions must strictly fit into:
  - **OpEx (Maintenance of life):** Essential survival expenses, housing, utilities. "Burned" money.
  - **CapEx (Projects/Business):** Investments in oneself or business expansion.
  - **Acumulação (Asset Acquisition):** Stocks, Real Estate, Emergency funds. "Saved/Invested" money.
- **RLS Enforced:** The UI must handle `null` returns gracefully if a user accesses data they don't own, redirecting to a login or error state.
- **Income Control:** Tracked in a dedicated "Receitas" tab, similar logic to expenses but contributing positively to the balance.
- **Credit Card Tracking:** Summaries must deduct fixed payments immediately or amortize over time depending on the user selection.

# 11. External Integrations

| Service | Purpose | Status |
|---------|---------|--------|
| Supabase | Database (Postgres) + Auth (JWT) | **Active** (migrating to) |
| Stripe | Subscription monetization (Pro tier) | Planned - Phase 3 |

# 12. Testing Strategy
- *Currently none.* Testing frameworks (Jest/Vitest) expected to be added in Phase 2 for utility logic validation, specifically formatting, chart calculations, and date wrangling inside `utils.js` and `dashboard.js`.

# 13. Performance & Scalability
- **Vanilla JS advantage:** Zero bundle overhead.
- **Dom Updates:** Avoid rebuilding the entire table on single line-item deletions. Remove the Node manually or adopt simple reactive techniques.
- **Supabase limits:** Batch large operations (e.g., CSV imports) rather than firing 500 individual `INSERT` statements simultaneously.

# 14. Security
- **Auth:** Supabase native authentication (`auth.js`).
- **No Local Storage secrets:** Aside from Supabase Session JWT naturally handled by the SDK, avoid storing sensitive financial data in `localStorage`.
- **XSS Prevention:** When interpolating `transaction.description` (user input) into HTML, strictly use `textContent` instead of `innerHTML`.

```js
// ✅ Correct
const title = document.createElement('h3');
title.textContent = user.input; // Safe

// ❌ Wrong
element.innerHTML = `<h3>${user.input}</h3>`; // XSS Risk
```

# 15. Known Issues & Technical Debt

| Issue | Area | Severity | Notes |
|-------|------|----------|-------|
| Globals / Module scoping | `js/` codebase | Medium | Many script tags might lead to global pollution; needs an ESM refactor or bundler. |
| State Management | UI | Medium | DOM is heavily relied upon for state truth. A centralized local state (store) would reduce bugs during updates. |
| Hardcoded CSS | `styles.css`| Low | Over 22k bytes; needs splitting per-component eventually. |

# 16. LLM-Specific Instructions

**Before making any change:**
- Read `index.html` structure and the specific `js/[file].js` you are editing.
- Confirm understanding of the current Supabase integration state (do not revert to `localStorage`).

**You must ALWAYS:**
- Use `data-*` attributes for DOM targeting hooks where reasonable.
- Enforce the OpEx/CapEx/Acumulação grouping logic in any dashboard or expense tracking modification.
- Wrap side-effects (`supabase.from()`) in try/catch and use UI error reporting.
- Implement HTML rendering using `document.createElement()` and `textContent` for user inputs.

**You must NEVER:**
- Use `var`.
- Use `innerHTML` for displaying user descriptions or arbitrary financial names.
- Attempt to install heavy frameworks (React, Vue) — respect the greenfield Vanilla JS boundary unless explicitly requested by the user.
- Recommend standardizing all files if the user only asked for a quick method fix. Keep scope aligned.

---
### 🏁 Onboarding Checklist (For LLMs and Devs)
- [ ] Read this `llm.md` fully.
- [ ] Understand the 3 pillar groupings (OpEx, CapEx, Acumulação).
- [ ] Review `js/storage.js` to see how Supabase is currently wrapped.
- [ ] Review `css/styles.css` to grasp the custom properties (variables) available for styling.
- [ ] Check `.env.example` configurations.
