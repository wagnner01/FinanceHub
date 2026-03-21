# FinanceHub

> A comprehensive personal finance management tool focused on wealth expansion and strategic categorization (OpEx, CapEx, Acumulação).

![Status](https://img.shields.io/badge/status-in%20development-yellow)
![Stack](https://img.shields.io/badge/stack-Vanilla%20JS%20%7C%20HTML5%20%7C%20CSS3-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Quick links

- [LLM context → llm.md](./llm.md)
- [Live app → https://financehub.app](#) *(not deployed yet)*
- [Staging → https://staging.financehub.app](#) *(not deployed yet)*
- [Design file → Figma](#) *(not available yet)*
- [Issue tracker → GitHub Issues](#)

## Tech stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Language | Vanilla JavaScript (ES2022+) | ES Modules, no transpilation |
| Markup | HTML5 | Semantic, accessible |
| Styling | CSS3 | Custom properties, no framework |
| Build tool | [TBD] | Currently none; Vite mapped for future |
| Package manager | npm | — |
| Backend | Supabase | PostgREST API |
| Auth | Supabase Auth | Native integration |
| Database | PostgreSQL | Via Supabase |
| Hosting | [TBD] | Vercel or Netlify planned |

## Prerequisites

Before you begin, make sure you have installed:

- [Node.js](https://nodejs.org/) `v20.x` or higher *(needed for local server/package management)*
- [npm](https://www.npmjs.com/) `v10.x` or higher — comes with Node
- [Git](https://git-scm.com/) `v2.x` or higher
- A modern browser (Chrome 115+, Firefox 115+, Safari 16+)

No framework, no transpiler, no compiler required beyond this.

## Getting started

### 1. Clone the repository

```bash
git clone git@github.com:your-org/FinanceHub.git
cd FinanceHub
```

### 2. Install dependencies

```bash
npm install
```

> If the project has no build tool dependencies yet, skip this step — open index.html directly via a local server (see step 4).

### 3. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_ENV` | Yes | Set to `development` for local |
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Your Supabase public anon key |

> Never commit your `.env` file. It must be in `.gitignore`.

### 4. Start the development server

```bash
npx serve .
```

The app will be available at: `http://localhost:3000`

> Note: ES Modules require a server to bypass CORS policies — opening `file://index.html` directly in your browser won't work perfectly.

## Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | [not configured yet] Start local dev server |
| `npm run build` | [not configured yet] Production build |
| `npm run preview` | [not configured yet] Serve the production build locally |
| `npm run test` | [not configured yet] Run all unit and integration tests |
| `npm run test:e2e` | [not configured yet] Run end-to-end tests |
| `npm run lint` | [not configured yet] Run ESLint |
| `npm run format` | [not configured yet] Run Prettier |

## Project structure

```
project-root/
├── index.html         # App entry point
├── js/
│   ├── app.js         # JS bootstrap / main logic
│   ├── auth.js        # Supabase authentication logic
│   ├── storage.js     # Supabase DB operations
│   ├── utils.js       # Pure utility functions
│   └── *.js           # One file per major component
├── css/
│   └── styles.css     # CSS — base, custom properties, themes
├── extrato.xlsx       # Example import template
├── .env.example       # Required environment variables
├── llm.md             # Full architecture and LLM context ← read this
└── README.md          # This file
```

For full structure with descriptions → see `llm.md § Project Structure`.

## Environment variables

Copy `.env.example` to `.env` and fill in the values below.

| Variable | Required | Local example | Description |
|----------|----------|---------------|-------------|
| `APP_ENV` | Yes | `development` | App environment |
| `SUPABASE_URL` | Yes | `https://xyz.supabase.co` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | `eyJ...` | Supabase public key |

**Rules:**
- Never put secrets in frontend JavaScript — only public keys are safe on the client
- Never commit `.env` — only `.env.example` goes to version control
- Rotate keys immediately if accidentally exposed

## Contributing

### Branch naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/description` | `feat/user-settings-page` |
| Bug fix | `fix/description` | `fix/mobile-nav-overflow` |
| Chore | `chore/description` | `chore/update-dependencies` |

### Commit convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add user settings page
fix: correct mobile nav overflow on iOS
chore: update dependencies
docs: update README setup steps
```

### Pull request rules

- All changes to `main` require a PR — no direct pushes
- PR description must explain what changed and why
- At least one approval required before merging
- CI must pass before merge

## Deployment

### Production

[not configured yet]

**Status:** Not yet configured.

### Staging

[not configured yet]

**Status:** Not yet configured.

### Manual deploy (temporary)

Upload the contents of this repository (omitting `.env` and `.git`) directly to your static hosting provider (e.g., Netlify drop, Vercel CLI).

## Troubleshooting

**ES Module error when opening index.html directly**
Browsers block ES Modules on the `file://` protocol. Always use a local server:
```bash
npx serve .
```

**Environment variable not loading**
Make sure you copied `.env.example` to `.env` (not `.env.example` itself).
Restart the dev server after changing `.env`.

**Port already in use**
Kill the process on the port:
```bash
# Example for port 3000
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

**CSS custom properties not applied**
Check that your `<body>` correctly implements the `data-theme` attribute if expecting a specific theme, and that CSS loads without 404s.

**npm install fails**
Make sure Node.js is v20.x or higher:
```bash
node --version
```
Update if needed: https://nodejs.org/

---

For full architecture, data models, API design, coding conventions, and LLM instructions:
**→ Read [llm.md](./llm.md)**

Last updated: 2026-03-21 · Maintained by wagnner01