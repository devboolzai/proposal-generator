# Migrating the proposal generator from Vercel to a self-hosted VPS

**Date:** 2026-09-24
**Status:** Approved design, ready for implementation planning

## Why

The system runs today as two Vercel projects backed by Vercel Blob. The
motivation for moving is **control**: owning the whole stack, with no platform
limits and no third party holding signed client contracts.

That motivation decides the central question. Vercel Blob would keep working
from a VPS with only its token, but keeping it would leave the data with the
vendor we are leaving. So the storage layer moves too, and this is a migration
of both compute and state.

## What exists now

One repository, two independently deployed applications:

| App | Root | Hostname | Audience |
|---|---|---|---|
| `proposal-generator` | `.` | `quote.boolzai.co.il` | Internal (salespeople) |
| `proposal-sign` | `sign/` | `sign.boolzai.co.il` | Clients |

They are separate deployments for one reason: a client must never receive a URL
that also serves the generator's code. That boundary is a requirement, not an
implementation detail, and the target architecture preserves it.

There is no database. All state is Vercel Blob:

- `proposals/<token>/meta.json` — the record
- `proposals/<token>/original.pdf` — the proposal as sent
- `proposals/<token>/signed.pdf` — the counter-signed copy
- `proposals/<token>/proposal.docx` — the editable archive copy
- `counters/proposal-id.json` — the running proposal number, from 50001

The two apps are coupled only by that shared store. Email is Resend, which is
provider-agnostic and unaffected by this work.

Both hostnames sit behind Cloudflare (proxied), which fronts Vercel today.
`quote.boolzai.co.il` returns 403 from Cloudflare itself, so the generator is
gated at the edge — that gate is independent of the origin and survives the
move.

## Target

### Host

DigitalOcean droplet, `46.101.139.175`, Ubuntu 24.04 LTS, 1 vCPU / 1GB RAM /
24GB disk, fra1. Bare at the time of writing: no Node, no web server, no Docker.

Docker is deliberately not used. At this size it buys isolation we do not need
and costs memory we would rather give to the applications.

### Processes and users

Two system users in a shared group:

- `proposal-gen` — runs the generator on `127.0.0.1:3000`
- `proposal-sign` — runs the signing app on `127.0.0.1:3001`
- both in group `proposals`

Neither binds a public interface; nginx is the only public listener.

Separate users are worth the three extra lines: the signing app is the
internet-facing one, and a compromise there must not be able to rewrite the
generator's code.

### Filesystem

```
/srv/proposal-generator/releases/<timestamp>/   code, current -> latest
/srv/proposal-sign/releases/<timestamp>/
/var/lib/proposals/                             the data store
/etc/proposal-generator.env                     secrets, 0600
/etc/proposal-sign.env                          secrets, 0600
```

`/var/lib/proposals/` is owned `root:proposals`, mode `2770`. The setgid bit
makes files created by either app group-readable by the other, which is what
lets them share a store the way they shared a Blob store. **This directory is
the replacement for the shared Blob store and is the only coupling between the
two applications.**

Blob pathnames map into it verbatim — `proposals/abc/meta.json` becomes
`/var/lib/proposals/proposals/abc/meta.json`. No translation layer, and the
migration is a straight copy.

## Code changes

### Storage (`api/_lib/store.js` and its twin in `sign/`)

The module keeps its exact exported surface: `readMeta`, `writeMeta`,
`readBytes`, `writePdf`, `blobExists`, `listProposals`, `findByProposalId`,
`supersedeOthers`, `readCounter`, `writeCounter`. Only the internals change from
`@vercel/blob` to `node:fs/promises`. No caller changes.

The two copies stay separate files, as today, and `shared/` stays free of npm
dependencies, so each app remains independently deployable.

Two properties improve rather than merely port:

**Atomic writes.** Every write goes to a temp file in the same directory and is
then `rename()`d into place. Today a crash mid-`put` can leave a truncated
`meta.json`; afterwards it cannot.

**A correct counter.** The README documents that two simultaneous allocations
receive the same proposal number, because Blob offers no compare-and-swap. A
single process holding an in-process mutex plus an `O_EXCL` lockfile closes
this. Gaps in the sequence remain — they are intended and documented — but the
collision does not.

`listProposals()` keeps its current design, which reads every record rather than
trusting an index, precisely because the signing app writes `meta.json` without
the generator's knowledge. That reasoning is unchanged and still correct. It
simply becomes a `readdir` plus local reads instead of a paginated network
listing, and the note about adding a TTL cache stops being relevant.

`PRIVATE`, `META_PUT_OPTIONS`, `PDF_PUT_OPTIONS`, `DOCX_PUT_OPTIONS` and
`COUNTER_PUT_OPTIONS` in `shared/proposal.js` lose their meaning on a
filesystem and are removed along with the code that spread them.
`DOCX_CONTENT_TYPE` is still needed for HTTP responses and stays. Privacy is now
a filesystem property: nothing under `/var/lib/proposals/` is reachable except
through a handler that checked the token.

### HTTP runtime

A small adapter (`server.js` per app, roughly 30 lines) reads `api/*.js` at boot
and mounts each module as a route, mapping `api/proposal-create.js` to
`/api/proposal-create`, and skipping `_lib/` and `*.test.js`. Handlers keep
`export default async function handler(req, res)` exactly as written.

`shared/http.js` needs one change. `readBody` currently depends on Vercel having
parsed the JSON body; the adapter parses it instead and `readBody` keeps
normalising both shapes. `originOf()` already reads `x-forwarded-proto` and
`x-forwarded-host`, which nginx sets, and needs no change.

### Upload flow

`api/blob-upload.js` is deleted, along with `@vercel/blob` and
`@vercel/blob/client` in both apps. The `handleUpload` token exchange, its
dual-caller branch, and the `onUploadCompleted`-never-fires-locally workaround
all disappear.

The three-step create → upload → ready shape is kept, so
`src/share/createSignLink.js` changes only in its middle step.

The current client passes `multipart: true` deliberately: a 30MB page-per-JPEG
raster is often uploaded over a salesperson's phone tethering, and multipart
splits it into parallel parts and retries only the ones that fail. A single
`POST` would be a real regression on exactly the connection this system is used
on. The replacement therefore chunks explicitly:

- `POST /api/proposal-upload?token=<t>&kind=pdf|docx&offset=<n>` appends a chunk
  to a staging file at that byte offset
- the client sends 5MB chunks and retries a failed chunk on its own
- writing at an explicit offset makes a retried chunk idempotent
- the final chunk carries `&final=1`, which fsyncs and `rename()`s the staging
  file into place

Guards carry over unchanged: `APP_ACCESS_CODE` on every write, 30MB for PDFs,
10MB for Word files, enforced in the handler and again by nginx. The existing
rule that an upload is refused once the record has left `pending` is preserved.

### Local development

`vercel dev` is no longer needed. `npm run dev` proxies `/api` to the local
Node server through Vite's `server.proxy`, so the full flow — including
proposal-number allocation, and therefore PDF and Word export — finally works
locally. The README section describing two `vercel dev` terminals is rewritten.

### Dependency cleanup

`vite`, `@vitejs/plugin-react`, `react` and `react-dom` currently sit in
`dependencies` in the root `package.json`, so a production install pulls the
whole build toolchain onto the server. Build-only packages move to
`devDependencies` so `npm ci --omit=dev` installs only what runs.

## Serving

### nginx

One server block per hostname.

`quote.boolzai.co.il`:
- root `/srv/proposal-generator/current/dist`, `try_files $uri /index.html`
- `/api/` proxied to `127.0.0.1:3000`

`sign.boolzai.co.il`:
- root `/srv/proposal-sign/current/dist`, `try_files $uri /index.html`
  (its routes are `/s/<token>`, matched client-side by one regex in `main.jsx`)
- `/api/` proxied to `127.0.0.1:3001`

Shared settings:
- `client_max_body_size 40m`
- `proxy_set_header X-Forwarded-Proto https` and `X-Forwarded-Host $host`,
  which is what `originOf()` reads
- `set_real_ip_from` the Cloudflare ranges with `real_ip_header CF-Connecting-IP`

That last line is not cosmetic. Without it every request appears to originate
from Cloudflare, making logs and any future rate limiting useless.

Static files are served by nginx directly; Node never serves an asset.

### TLS and firewall

A Cloudflare Origin CA certificate (15-year, no renewal job, no certbot), with
the zone set to **Full (strict)**.

`ufw` allows 22, and 80/443 **only from Cloudflare's published ranges**. The
origin is then unreachable except through Cloudflare. This is what keeps the
existing edge protection on `quote.boolzai.co.il` meaningful: without it,
anyone who learns the droplet's IP walks straight past that gate.

Cloudflare's own 100MB request ceiling is comfortably above our 30MB cap.

### systemd

Two units, `Restart=always`, `EnvironmentFile=` pointing at the 0600 env files,
and standard hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`,
`ReadWritePaths=/var/lib/proposals`.

A 1GB swap file is added with `vm.swappiness=10`. At 1GB RAM this is insurance
rather than a necessity, and it absorbs the one predictable spike: `pdf-lib`
appending a signature page to a 30MB raster. `MemoryHigh` is set to throttle
rather than `MemoryMax` to kill, so a spike slows down instead of dropping a
client's signature.

## Deployment

A script, not a platform:

1. `npm run build` locally for both apps
2. rsync into `/srv/<app>/releases/<timestamp>/`
3. `npm ci --omit=dev` on the server
4. flip the `current` symlink
5. `systemctl restart`
6. prune to the last 3 releases

Building locally keeps the build off a 1 vCPU box. Keeping three releases makes
rollback a symlink flip and a restart.

## Data migration

Everything moves: every proposal and, above all, the counter.

A one-off script run locally with `BLOB_READ_WRITE_TOKEN`:

1. `list()` the entire store, paging to the end
2. download each blob into a staging tree mirroring its pathname exactly
3. verify object count and per-object byte size against the listing
4. rsync the staging tree into `/var/lib/proposals/`
5. `chown -R root:proposals` and re-apply `2770`

Because this is an internal tool used by a handful of people, the cutover takes
a **freeze window** — "create no proposals for the next 30 minutes" — rather
than delta-sync machinery built for a single event.

**The cutover gate is `counters/proposal-id.json`.** It must be present and
parse before the host takes any traffic. If it is missing, the system reseeds at
50001 and issues numbers that are already printed on documents sitting with
clients. This is the one irreversible failure in the whole migration, and it is
checked explicitly rather than assumed.

Order of operations:

1. Provision and deploy to the droplet; verify over the raw IP with a `Host`
   header, before any DNS change
2. Announce the freeze
3. Run the migration; verify counts and the counter
4. Repoint both Cloudflare records to `46.101.139.175`, keep the proxy on
5. Verify: an existing signing link still resolves, the archive lists what it
   listed before, the counter issues the expected next number
6. Lift the freeze

Rollback is a DNS field. The Vercel projects stay deployed and the Blob store
stays untouched for several weeks; nothing is deleted until the VPS has been
carrying real traffic long enough to trust.

## Backups

Vercel Blob is replicated. A single droplet is not. After this migration
`/var/lib/proposals/` is the **only copy of every signed contract**, and that is
the real cost of self-hosting.

Therefore, treated as part of the migration and not as follow-up work:

- nightly snapshot of `/var/lib/proposals/`, pushed **off-box** (restic or
  rclone, destination to be chosen)
- retention long enough to survive a corruption discovered late, not just a
  disk lost yesterday
- a restore actually performed once, before the Vercel projects are torn down

A backup that stays on the droplet is not a backup; it dies with the disk. A
backup never restored is not known to be a backup.

Disk pressure is no longer an immediate concern at 22GB free — several hundred
proposals at the 30MB ceiling — but a disk-usage alert is included so the
ceiling is discovered early rather than by a failed write.

## Out of scope

- Any change to the proposal document, its layout, or the wizard UI
- Replacing Resend
- Introducing a database; the filesystem model is sufficient and is what the
  current design already assumes
- CI/CD; deployment is a script run by hand, which suits the team size

## Open item

The off-box backup destination is not yet chosen. It must be settled before the
Vercel projects are decommissioned, but it does not block implementation.

## Success criteria

1. Both hostnames serve from the droplet, with valid TLS, behind Cloudflare.
2. A signing link created before the migration still opens and can be signed.
3. A proposal created after the migration receives the next number in sequence,
   with no repeat of a previously issued number.
4. The archive lists the same proposals it listed on Vercel, and downloads of
   the PDF, signed PDF and Word file all work.
5. A 30MB PDF uploads successfully over a throttled connection, with a
   deliberately failed chunk retried rather than restarting the upload.
6. `@vercel/blob` appears nowhere in either app.
7. An off-box backup has been taken and a restore from it verified.
8. The origin refuses connections that do not arrive through Cloudflare.
