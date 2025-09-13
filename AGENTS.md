# Repository Guidelines

## Project Structure & Module Organization
- `app/` (Next.js App Router): routes, layouts, and pages (e.g., `app/admin`, `app/api/.../route.ts`).
- `components/`: reusable React components (PascalCase files, e.g., `AdminBottomNav.tsx`).
- `lib/`: shared utilities and clients (e.g., `supabaseClient.ts`).
- `public/`: static assets (if added). Build output lives in `.next/` (do not commit).
- Root config: `next.config.js`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`.
- Env: `.env.local` for secrets and `NEXT_PUBLIC_*` client-safe variables.

## Build, Test, and Development Commands
- `npm run dev` — start local dev server with HMR.
- `npm run build` — production build (traces, optimizes, emits `.next/`).
- `npm run start` — run the production server locally.
- `npm run lint` — lint TypeScript/React code using ESLint/Next config.

## Coding Style & Naming Conventions
- TypeScript, 2-space indentation, semicolons optional (follow ESLint).
- React components: PascalCase in `components/` (e.g., `AppContainer.tsx`).
- Route segments and folders: lowercase; dynamic routes in brackets (e.g., `app/reserva/[id]/page.tsx`).
- Prefer functional components and hooks; colocate small helpers per file or use `lib/` for shared logic.
- Tailwind for styling in `.tsx`; global styles in `app/globals.css`.

## Testing Guidelines
- No formal test runner is configured yet. For changes, verify via `npm run dev` and linting.
- If adding tests, prefer Jest + @testing-library/react; name files `*.test.tsx` near sources or under `__tests__/`.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Keep commits focused and descriptive; reference issues (e.g., `feat(admin): create alumnos editor #123`).
- PRs: include summary, before/after notes or screenshots, steps to verify, and any schema or config changes.

## Security & Configuration Tips
- Never commit `.env.local` or secrets. Use `NEXT_PUBLIC_*` only for values safe for the client.
- Supabase keys: store in `.env.local`; initialize via `lib/supabaseClient.ts`.
- Validate all input on API routes in `app/api/*/route.ts`.
