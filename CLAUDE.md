# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start development server on http://localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
```

No test runner is configured yet.

## Stack

- **Next.js 16** with App Router (not Pages Router)
- **React 19** with React Compiler enabled (`reactCompiler: true` in `next.config.ts`)
- **TypeScript**
- **Tailwind CSS v4** — configured via `@import "tailwindcss"` in `globals.css`, theme tokens defined with `@theme inline` (not `tailwind.config.js`)

## Architecture

This is a fresh App Router project. All routes live under `src/app/`. The entry layout at [src/app/layout.tsx](src/app/layout.tsx) loads Geist Sans and Geist Mono via `next/font/google` and sets CSS variables (`--font-geist-sans`, `--font-geist-mono`) consumed by Tailwind's `@theme inline` block in [src/app/globals.css](src/app/globals.css).

**Key Next.js 16 / React 19 notes:**
- Server Components are the default; add `"use client"` only when you need browser APIs, event handlers, or state.
- The React Compiler is active — avoid manually memoizing with `useMemo`/`useCallback` unless you have a measured reason; the compiler handles it.
- Tailwind v4 has no `tailwind.config.js` — extend the theme via `@theme` blocks in CSS files.
- Before implementing a Next.js feature, check `node_modules/next/dist/docs/` for the authoritative v16 API (routing, caching, data fetching, Server Actions, etc. may differ from older docs).

## Custom Skills

| Command | File | Purpose |
|---|---|---|
| `/best-practices` | `.claude/commands/best-practices.md` | Audit code against Next.js 16, React 19, TypeScript, Tailwind v4, and security best practices. Run it on any file or the current context. |

## Workflow Hooks

A `PreToolUse` hook in `.claude/settings.json` pauses before every `Edit` / `Write` / `MultiEdit` tool call and asks for confirmation. This is intentional — press **Enter** to allow, **Ctrl+C** to cancel.
