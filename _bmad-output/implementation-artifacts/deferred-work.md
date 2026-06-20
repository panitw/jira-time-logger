## Deferred from: code review of 1-1-project-scaffold-and-oauth-connect (2026-06-20)

- shadcn/ui only shipped `Button` (10 primitives deferred) — acknowledged in dev notes; add via `pnpm dlx shadcn@latest add` when needed.
- Design tokens in CSS `@theme` vs `tailwind.config.ts` — Tailwind v4 CSS-first pattern, functionally equivalent.
- Disconnect clears tokens instead of no-op stub — dev convenience, documented in completion notes.
- Atlassian client ID committed to repo — PKCE makes client_id public; story already addresses this.
- `parseError` stores `issue: unknown` — API design choice; consumers narrow via runtime checks.
- `jsdom` environment set globally in Vitest — performance optimization, not a bug.
- `postinstall: "wxt prepare"` may fail in CI — no CI configured yet; address when CI is set up.