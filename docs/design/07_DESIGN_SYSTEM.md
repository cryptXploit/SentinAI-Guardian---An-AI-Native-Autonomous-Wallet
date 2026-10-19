# Phase 4: Design System Specification

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Design Theme:** Institutional Dark Slate Command Center

---

## 1. Color System & Semantic Tokens (`src/app/globals.css`)

SentinAI Guardian uses a high-contrast dark slate color system engineered to prevent visual fatigue and ensure immediate semantic recognition of financial risk states.

| Token Name | CSS Variable | Hex / Value | Usage |
|---|---|---|---|
| **Primary Background** | `--background` | `#0B0F17` | Root canvas and code/address wells |
| **Elevated Surface** | `--surface` | `#111827` | Primary cards, sidebar, and command center containers |
| **Interactive Hover** | `--surface-hover` | `#1E293B` | Button hover states, expandable audit rows |
| **Hairline Border** | `--border` | `#1F2937` | Card boundaries, table dividers |
| **Primary Foreground** | `--foreground` | `#F9FAFB` | Headings, balances, primary labels |
| **Secondary Text** | `--text-secondary` | `#9CA3AF` | Descriptions, metadata labels |
| **Muted Text** | `--text-muted` | `#6B7280` | Captions, non-critical timestamps |
| **Primary Accent (Trust Blue)** | `--accent-blue` | `#3B82F6` | Active navigation, AI intelligence indicators, primary CTAs |
| **Safe / Verified (Emerald)** | `--success` | `#10B981` | Policy `ALLOW`, simulation `PASS`, `CONFIRMED` on-chain state |
| **Warning / Pending (Amber)** | `--warning` | `#F59E0B` | Pending receipts, fallback parser notices, medium exposure warnings |
| **Critical / Blocked (Rose)** | `--danger` | `#EF4444` | Policy `BLOCK`, simulation revert, negation/injection blocks |
| **Simulated Fixture (Purple)** | `purple-500` | `#A855F7` | Non-executable `DEMO / SIMULATED` security fixtures |

---

## 2. Typography & Numeric Hierarchy

1. **Sans-Serif UI Font (`--font-geist-sans` / System UI):**
   - **Page Header (`h1`):** `24px–30px` (`text-2xl sm:text-3xl`), `font-bold`, `tracking-tight`
   - **Section Header (`h2`):** `18px–20px` (`text-lg` / `text-xl`), `font-semibold`
   - **Card Title (`h3` / `h4`):** `14px–16px` (`text-sm` / `text-base`), `font-semibold`
   - **Body / Explanations:** `12px–14px` (`text-xs` / `text-sm`), `leading-relaxed`
2. **Monospace Technical Font (`--font-geist-mono`):**
   - Mandatory for all Ethereum addresses (`0x...`), transaction hashes, Keccak-256 IIP digests, Chain IDs (`11155111`), block numbers, gas limits, and provenance badges.
3. **Tabular Figures (`tabular-nums`):**
   - Applied to all ETH and ERC-20 balance displays, gas fees, and policy limit inputs to ensure vertical decimal alignment.

---

## 3. Component Architecture & States

### 3.1 Provenance & Risk Badges
- **Live AI Badge:** `bg-emerald-500/15 text-emerald-300 border-emerald-500/30` (`GROQ AI · openai/gpt-oss-120b` or `GEMINI AI · gemini-3.8-flash`)
- **Fallback Parser Badge:** `bg-blue-500/15 text-blue-300 border-blue-500/30` (`FALLBACK PARSER`)
- **Simulated Fixture Badge:** `bg-purple-500/20 text-purple-300 border-purple-500/30` (`DEMO / SIMULATED · NON-EXECUTABLE DEMO`)
- **Blocked Proposal Badge:** `bg-red-500/20 text-red-400 border-red-500/30` (`NON-EXECUTABLE PROPOSAL`)

### 3.2 6-Stage Pipeline Stepper States
- **Idle:** `bg-background/60 border-border text-gray-500`
- **Active / Processing:** `bg-accent-blue/15 border-accent-blue text-accent-blue` with animated spinner
- **Passed Gate (`pass`):** `bg-emerald-950/20 border-emerald-500/40 text-emerald-300` with `CheckCircle2` icon
- **Halted / Blocked (`block`):** `bg-red-950/25 border-red-500/50 text-red-300` with `XCircle` icon

---

## 4. Accessibility & Responsive Standards

- **Keyboard Focus Visibility:** Global `:focus-visible` ring (`2px solid #3B82F6`, `outline-offset: 2px`) across all buttons, inputs, and links.
- **Reduced Motion Support:** `@media (prefers-reduced-motion: reduce)` disables pulse and spin animations for motion-sensitive users.
- **Responsive Breakpoints:**
  - **Desktop (`lg` / `1440px`):** Persistent left `Sidebar` (`w-64`) + `TopBar` + 3-column metrics grid + 7-column guided walkthrough bar.
  - **Tablet (`md` / `768px`) & Mobile (`375px`):** Collapses left sidebar into horizontal scrollable `TopBar` quick-jump bar; stacks metric cards and Pre-Execution Review grids cleanly without horizontal overflow.
