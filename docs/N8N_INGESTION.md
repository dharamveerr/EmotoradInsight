# N8N → EmotoradInsight data ingestion

Pulls rows from the source `chat_log_variable` Postgres table and feeds them
into a client's dashboard. One N8N workflow per scheduled sync, looped over
clients.

## How a client is linked
Add the client in-app (Settings ⚙ → **Add Client**, super admin only) with:
- **Display name** — shown in UI
- **subdomain** — optional label
- **org_id**, **client_id** — the EXTERNAL identifiers used in `chat_log_variable`

The app matches incoming data on `(org_id, client_id)`. No data flows until a
client with those values exists.

## Endpoints (auth: header `x-n8n-secret` == env `N8N_WEBHOOK_SECRET`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/sync/cursor?org_id=&client_id=` | returns `{ cursor }` = last synced `created_at` (epoch on first run) |
| POST | `/api/webhook/n8n` | body `{ org_id, client_id, rows[], dryRun? }` → maps + upserts events, advances cursor |

`dryRun: true` parses and echoes a 5-event sample without writing — use it to
verify mapping against real rows.

## N8N workflow

```
Schedule (e.g. every 5 min)
  → Set: org_id, client_id   (per client; or loop a list)
  → HTTP Request (GET cursor)
       URL: https://<app>/api/sync/cursor?org_id={{org_id}}&client_id={{client_id}}
       Header: x-n8n-secret: <secret>
  → Postgres (Execute Query)
       SELECT * FROM chat_log_variable
       WHERE org_id = '{{org_id}}'
         AND client_id = '{{client_id}}'
         AND created_at > '{{ $json.cursor }}'
       ORDER BY created_at ASC
       LIMIT 500
  → HTTP Request (POST rows)
       URL: https://<app>/api/webhook/n8n
       Header: x-n8n-secret: <secret>
       Body (JSON): { "org_id":"{{org_id}}", "client_id":"{{client_id}}",
                      "rows": {{ $items("Postgres").map(i=>i.json) }} }
  → (optional) IF rows.length == 500 → loop again (more to drain)
```

Cursor + idempotent upsert (unique `source_id`) mean over-fetching is safe —
duplicate rows are ignored.

## Mapping (lib/n8n-mapping.ts)
`chat_log_variable` rows → `events`. Each event groups variable-rows sharing
(user, journey, step, timestamp); variables collapse into `metadata` with the
`@` prefix enforced.

Column names are auto-detected from candidate lists (e.g. user from
`user_id|phone|session_id|...`). **Tune `FIELDS` in `lib/n8n-mapping.ts` once
the exact `chat_log_variable` schema is confirmed** — run a `dryRun` POST with
real rows and check the echoed sample.

## Funnels
For a client's dashboard to show funnels, build + publish a tree whose journey
and step **names match the journey/step strings in that client's data**. The
Variables panel auto-surfaces incoming `@` variables (scoped to the client).
