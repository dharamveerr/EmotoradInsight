@AGENTS.md

# EmotoradInsight — WhatsApp Chatbot Analytics Dashboard

## Project Overview
Premium analytics dashboard for Emotorad's WhatsApp chatbot. Shows journey funnels, session replay, heatmaps, drop-off analysis, and MIS reports from real chatbot event data.

## Tech Stack
- **Framework**: Next.js 16 (App Router) with TypeScript
- **Styling**: Tailwind CSS v4 + custom glassmorphic design
- **Charts**: Recharts
- **Database**: SQLite via better-sqlite3 (`data/insights.db`)
- **Auth**: Custom JWT using jose library (NOT NextAuth)
- **Data Fetching**: SWR with 30s auto-refresh

## Credentials
- Username: `admin` | Password: `emotorad2024`
- Config: `.env.local`

## Data Sources
Real data from Emotorad WhatsApp chatbot exports stored in:
```
data/source/data_apr30_may16.xlsx   ← Apr 30 – May 16, 2026
data/source/data_may16_may31.xlsx   ← May 16 – May 31, 2026
```
**Never delete these files.** They are the canonical source for reseeding.

## Journeys (exact names — do NOT rename)
| Display Name | DB Key |
|---|---|
| Explore EM Products | `explore_products` |
| Register Warranty | `register_warranty` |
| Contact Customer Support | `customer_support` |
| Track Your Order | `track_order` |
| Find Shop/Service Centre | `find_shop` |

## Journey Steps (real names from chatbot flow)
```
Explore EM Products:      Explore EM Products → Product Selected → Price Filter Set
Register Warranty:        Register Warranty → Frame Number Entered → Warranty Checked → Warranty Registered
Contact Customer Support: Contact Customer Support → Issue Type Selected → Issue Details Provided → Ticket Created
Track Your Order:         Track Your Order → Order ID Entered → Order Found → Order Status Viewed
Find Shop/Service Centre: Find Shop/Service Centre → Location Entered → Shops Displayed
```

## Key Variables per Journey
- **Explore EM Products**: `@user_name`, `@product`, `@price`, `@min_price`, `@max_price`, `@carousel_choosen`, `@url1-3`
- **Register Warranty**: `@frame_number`, `@warrantyStatus`, `@message`, `@purchase_date`
- **Contact Customer Support**: `@support`, `@contact`, `@issue`, `@model_name`, `@km_driven`, `@customer_email_id`, `@generatedTicketNumber`
- **Track Your Order**: `@order_id`, `@orderStatus`, `@customerName`, `@productName`, `@docketNumber`
- **Find Shop/Service Centre**: `@address`, `@dealership_name`, `@dealer_phone_number`, `@google_maps_link`

## userId Convention
**Phone Number** is the primary identifier (e.g. `917499288082`), NOT `user_0001` style IDs.

## Reseeding
```bash
python3 scripts/seed-real-data.py
```
This merges both xlsx files, clears old events, and inserts fresh data with full metadata.

## Key Files
```
app/(dashboard)/page.tsx              ← Overview KPIs + date range
app/(dashboard)/product-insights/    ← Journey analytics
app/(dashboard)/journeys/            ← Funnel visualization
app/(dashboard)/heatmap/             ← Time-of-day activity grid
app/(dashboard)/dropoff/             ← Drop-off rate per step
app/(dashboard)/sessions/            ← Session replay + CSV download
app/api/insights/route.ts            ← All analytics queries
app/api/sessions/route.ts            ← Session list + detail + CSV export
components/SelectGlass.tsx           ← Custom dropdown (portal-based, always opens below)
components/Sidebar.tsx               ← Collapsible nav
components/Topbar.tsx                ← Sticky header with theme toggle
lib/types.ts                         ← Journey types, JOURNEY_LABELS, JOURNEY_STEPS
```

## CSS Conventions
- `.glass` — glassmorphic card (dark: rgba white/4, light: white)
- `.select-glass` — unified dropdown button style
- `.skeleton` — loading shimmer
- Theme toggle: `html.light` class on `<html>` for light mode
- Tailwind v4: use CSS attribute selectors `[class~="..."]` instead of escaped slash classes

## Important Rules
- Use **exact journey names** from the table above — never rename
- `SelectGlass` component for all dropdowns — never native `<select>` for journey pickers
- All metadata stored as JSON in `events.metadata` column
- Session detail modal shows variables per step filtered by `HIDDEN_VARS` set
