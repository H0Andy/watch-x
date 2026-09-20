# Contributing to Watch X

Thanks for your interest. Small, focused PRs are easiest to review.

## Dev setup

```bash
npm install
npm run dev
```

Windows SPD helper (optional for memory advanced identity):

```bash
npm run build:spd-helper
```

Tests related to SPD / DRAM DB:

```bash
npm run test:spd
```

## Guidelines

- Prefer measured hardware sources; do **not** invent DRAM die IDs
- Keep Electron main process non-admin; elevation belongs in `spd-helper` only
- Bundle only the **official unmodified** PawnIO installer — do not extract proprietary `.sys` into the tree
- Match existing TypeScript / React style; avoid drive-by refactors

## Pull requests

1. Fork and branch from `main`
2. Describe *why* the change matters
3. Note how you tested (OS + steps)

## Issues

Include OS version, Watch X version / commit, and whether SPD / PawnIO / admin elevation was involved when relevant.
