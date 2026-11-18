# Design language: "Ledger"

The hub should feel like a precise, well-kept book of account, not a generic admin template. Every visual choice below serves that idea. Rules are enforced by convention, so read this before adding UI.

## Principles

1. **Figures first.** Money is the product. Figures are set in Geist Mono with tabular digits (`.num`), large on ink panels, never in a decorative face.
2. **One accent.** Analiva cyan (`--brand`) is the only accent, in light and dark. Status colours (positive, warn, danger) carry meaning only.
3. **Hierarchy through surfaces, not boxes.** Three surfaces, used deliberately:
   - **Ink** (`.ink`, `<InkPanel>`): deep navy with cyan light, grain and faint ruled lines. Reserved for the most important figures on a page (dashboard hero, client figures, portal figures) and the sidebar.
   - **Panel** (`<Card>`): the default container, white or near-black, with a hairline border and an inner top highlight.
   - **Paper** (`.paper`): ruled lines with a cyan margin rule, for financial statements and anything meant to be printed.
4. **Texture carries meaning.** Ledger rules appear on paper statements, ink panels and empty states (the "blank page" of a book), nowhere else. A fixed grain layer at 2% gives the canvas tooth without touching scrolling content.
5. **Motion is motivated.** Each animation answers "what does this tell the user?":
   - Route reveal (stagger of `[data-reveal]`): hierarchy, header first, then figures, then detail.
   - Count-up on figures: these numbers were just calculated.
   - Progress bar: a navigation is in flight.
   - Spotlight and edge light on panels: this surface is interactive.
   - Magnetic primary buttons: the main action on the page.
   - Preloader: first load only.
   All motion stops under `prefers-reduced-motion`.
6. **No template tells.** No em-dashes in copy, no icon-in-a-square headers, no rows of identical cards where one figure matters more, no gradient text, no emoji.

## Tokens

Defined in `apps/web/src/app/globals.css` as CSS variables and mapped into Tailwind with `@theme inline`.

| Token | Use |
| --- | --- |
| `--canvas`, `--panel`, `--panel-2`, `--subtle` | Page, panels, table headers, quiet fills |
| `--ink`, `--ink-2`, `--muted`, `--faint` | Text, from primary to captions (all pass WCAG AA) |
| `--line`, `--line-strong` | Hairlines and hover borders |
| `--brand`, `--brand-strong`, `--brand-deep`, `--brand-text`, `--brand-soft` | The cyan accent |
| `--ink-950`, `--ink-900`, `--ink-800` | Ink surfaces |
| `--rule`, `--margin-rule` | Ledger lines and the paper margin |
| `--hl` | Inner top highlight on panels (lighter in light mode) |

Dark mode follows the system setting and redefines every token; nothing is light-only.

## Type

- **Geist** for everything, tightened tracking on headings (`.font-display`, -0.025em).
- **Geist Mono** for figures, codes, dates in tables and keyboard hints.
- Headings: page 28px, ink hero 34px, panel 14px semibold. Body 14px; guide text 15px at 68 characters per line.

## Components (`apps/web/src/components`)

| Component | Notes |
| --- | --- |
| `ui.tsx` | Button (primary is magnetic with a sheen), Card, StatCard, InkPanel, Figure, Badge, Tabs, Empty, Notice, Field, Toggle |
| `crm/data-table.tsx` | The CRM table: pre-populated, instant narrowing, smart search, facets, sort, highlight, server fallback for older records |
| `charts.tsx` | Recharts wrappers in the token palette |
| `motion/motion-layer.tsx` | All app-wide motion in one client island (GSAP) |
| `motion/count-up.tsx` | Figure count-up that keeps SA number formatting |
| `skeletons.tsx` | Loading shapes that match the page |
| `help/*` | Help centre and guide renderer |

## Icons

Phosphor only (`@phosphor-icons/react`, `/dist/ssr` in server components). Regular weight for navigation, `duotone` for panel titles, `fill` for the active navigation item.
