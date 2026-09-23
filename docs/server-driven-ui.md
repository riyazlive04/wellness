# Server-driven UI

The client mobile app's **Today**, **More**, **tab bar** and **onboarding** screens are
composed from a JSON tree the server sends, so a practice can change what its clients see
without an app release.

Written for engineers working on any of the three codebases this spans.

---

## The shape of it

```
backend/src/sdui/        the schema, the validator, the defaults, the API
mobile/src/lib/sdui/     the schema mirror, binding resolution, the bundle cache
mobile/src/components/sdui/   the renderer and the native block registry
frontend/src/modules/workspace/appLayout/   the authoring UI
supabase/migrations/20260923120000_workspace_ui_layouts.sql
```

`backend/src/sdui/sdui.types.ts` is the **contract**. Change it there first, bump
`SCHEMA_VERSION`, then mirror it into `mobile/src/lib/sdui/types.ts`.

---

## Read path

```
device → GET /api/v1/me/ui
           ↓
  client → workspace → published rows (workspace_ui_layouts)
           ↓  gaps filled from sdui.defaults.ts
           ↓  re-validated (rows outlive the code that wrote them)
           ↓  pruneForFeatures() drops plan-gated branches
           ↓  ETag = hash(schema, DEFAULTS_VERSION, plan, published revisions)
         bundle { home, more, tabs, onboarding }
```

All four screens travel together. Fetching them separately would race four round-trips
before a cold launch could draw the tab bar, and would let a device end up with a home
screen from one revision and a tab bar from the next.

On device, `SduiProvider` resolves in this order, and every stage after the first is
optional:

1. **Compiled-in defaults** — so there is never a frame with no layout.
2. **Cached bundle** (AsyncStorage) — painted before the network answers, so a customised
   app does not visibly rearrange itself a second after launch.
3. **Server bundle** — adopted silently on a cold start. Mid-session it waits behind the
   banner; see ["Update available"](#update-available) below.

A device with no network, a corrupt cache, or a server that predates the migration still
gets a complete app. It just gets the stock one.

---

## Write path

```
editor → POST .../ui-layouts/:screen/validate   (dry run, per-node errors)
       → POST .../ui-layouts/:screen/draft      (stored; NOT live)
       → POST .../ui-layouts/:screen/publish    (live + history row)
```

`draft` and `published` are separate columns. Without the split, a half-finished edit is on
every client's phone the moment it is typed.

Publishing appends to `workspace_ui_layout_versions`. A bad layout is discovered by support
ticket, and the only acceptable answer is "restore the previous one now".

Rollback (`POST .../restore`) loads a past revision into the **draft**, not straight to
published — so it gets a fresh revision number and its own history row, rather than making
the revision counter jump backwards and confuse every cached client.

---

## What a layout can and cannot do

The validator (`sdui.validator.ts`) fails **closed**. It runs at write time so the editor
gets path-addressed errors, and again at read time on everything loaded from the database.

A published layout **can** reorder, relabel, hide, group and conditionally show blocks.

It **cannot**:

| | Why |
|---|---|
| Use an unknown node type or prop | Closed allowlist in `sdui.registry.ts` |
| Navigate off the route allowlist | `ROUTES`, with `*` matching exactly one segment |
| Open a non-`https` link | No http downgrade, no custom-scheme app bouncing |
| Name a URL to fetch | Layouts name a `source`; the client maps it to a fixed fetcher |
| Reference a binding the screen didn't declare | Scope-checked at authoring time |
| Write an onboarding key the submit DTO drops | `ONBOARDING_FIELD_KEYS` mirrors `CompleteOnboardingDto` |
| Remove the home tab, or exceed 6 tabs | `REQUIRED_TABS`; a phone has nowhere to put a 7th |
| Exceed 400 nodes / 14 levels / 128KB | Bounds the render thread on mid-range Android |
| Carry `__proto__` in a `native` prop bag | Reserved keys rejected before serialisation |

There is deliberately **no** `eval`, no `new Function`, and no JSON-to-JS expression
compiler anywhere in the pipeline. A layout comes off the network; the moment it can
express computation it is remote code execution wearing a schema.

### Plan gating is resolved server-side

A `{ op: 'feature', feature: 'community' }` guard is evaluated by `pruneForFeatures()` and
the losing branch is **cut from the payload**. Evaluating it on device would ship the
layout of a paid feature to a workspace that has not bought it — the tree itself leaks the
roadmap, and a patched client would happily render the row.

---

## `native` blocks: the escape hatch

`mobile/src/components/sdui/natives.tsx` registers components compiled into the app that a
layout may place **by name** (`home.habitTiles`, `more.profileHeader`, …).

This is why the schema stays small. The score hero has a running clock, the habit tiles do
optimistic writes, the mood tile expands into a picker. Expressing those in a layout tree
would mean inventing state, effects and event wiring in the schema — which is how an SDUI
system stops being a layout format and becomes a bad programming language.

The server decides **whether and where** they appear. That is the part a practice wants.

Adding one means two edits that must agree:

1. `NATIVE_COMPONENTS` in `backend/src/sdui/sdui.registry.ts`
2. `NATIVE_BLOCKS` in `mobile/src/components/sdui/natives.tsx`

A name the build doesn't know renders nothing — which is what lets an older binary survive
a layout referencing a block it has never heard of.

---

## `when` vs `cond`

Two different things, deliberately named differently:

- **`when`** (any node) — a *visibility guard*. False ⇒ the node is not rendered.
- **`cond`** (`if` node only) — the *branch selector*. False ⇒ the `else` branch renders.

They were originally both called `when`, which silently swallowed every `else` branch: the
generic visibility check ran first and dropped the whole `if` node before the branch logic
could run. If you are adding a node type with its own condition, do not reuse `when`.

---

## The editor is catalog-driven

`GET .../ui-layouts/catalog` returns `NODE_SPECS` — every node, its props, each prop's
kind, enum values and bounds. The web editor builds its palette and its property forms
from that response.

So: **a node type added on the backend appears in the editor with no frontend deploy**, and
the editor cannot offer a prop the validator would reject. A hand-written validator and a
hand-written editor form drift the moment someone adds a prop, and the drift shows up as a
layout an author can build but the server refuses.

---

## Adding a node type

1. Add the variant to `UiNode` in `backend/src/sdui/sdui.types.ts`.
2. Add its entry to `NODE_SPECS` in `sdui.registry.ts` (this is what the validator *and*
   the editor read).
3. Add a `case` to the switch in `mobile/src/components/sdui/renderer.tsx`.
4. Mirror the type into `mobile/src/lib/sdui/types.ts`.
5. Add a validator test for anything it makes newly possible.

Old app builds render an unknown type as nothing, so step 3 can ship a release behind the
others without breaking anyone.

---

## Operational notes

- **Cache busting.** The bundle's ETag is a hash of its *inputs* — schema version,
  `DEFAULTS_VERSION`, the workspace plan, and each published screen's `published_revision` —
  not of the rendered payload. That is what makes `/me/ui/revision` safe to poll: it answers
  from two indexed reads instead of building and hashing the bundle it describes. If you
  edit `sdui.defaults.ts`, **bump `DEFAULTS_VERSION`**, or devices will keep their cached
  copy of the old defaults. `sdui.service.spec.ts` pins the invariant that both endpoints
  agree.
- **Sign-out clears the cached bundle.** The next account on the device may belong to a
  different practice; inheriting the previous one's tab bar would leak its configuration.
- **Hidden tabs stay routable.** `_layout.tsx` declares every tab route, hiding the ones the
  layout omits with `href: null`. Deep links and push notifications target those paths, and
  a notification that opens a dead route is worse than a tab someone wanted hidden.
- **Render failures are isolated per section.** A bad node loses its own card, not the
  screen — the layout is remote, so a screen-level crash would recur on every visit with no
  way for the user to escape it.
- **Permission.** Authoring is gated on `settings.manage`, the same permission as branding,
  so an owner can delegate it without also handing over billing. Publishing is audited
  separately (`workspace.ui_layout.publish`).

## "Update available"

A publish does **not** rearrange the screen under whoever is using it.

`SduiProvider` pins the layout it is rendering in state rather than reading straight from
the query cache. A newer revision is detected but not adopted:

```
cold start          → adopt silently (cached paint, then the first server answer)
mid-session publish → detected → banner → client taps → applyUpdate()
```

Detection is `GET /me/ui/revision`, polled every 5 minutes and again on every foreground
(via an `AppState` listener in the provider). Only the hash crosses the wire; the full
bundle is fetched when the client accepts.

`UpdateBanner` renders the offer — bottom of the screen so it does not fight
`ConnectionBanner` for the top edge, and only inside `(tabs)`, since mid-onboarding is
precisely when you must not swap the flow someone is halfway through.

### One banner, two kinds of update

`UpdateBanner` is mounted once and handles both waiting updates, because two independent
banners would eventually both be true and stack on each other:

| Condition | Offer | Action |
|---|---|---|
| `Updates.useUpdates().isUpdatePending` | "A new version is ready — tap to restart" | `Updates.reloadAsync()` |
| `useSdui().updateAvailable` | "Your app has been updated — tap to refresh" | `applyUpdate()` |

The app build wins when both are true: it is the bigger change, and restarting refetches
the layout anyway, which clears the other for free.

The OTA half closes a real gap. [`ota.ts`](../mobile/src/lib/ota.ts) downloads a new bundle
in the background and deliberately does **not** reload — applying mid-session is jarring —
but until now that meant the new build was invisible and landed whenever the user next
happened to cold-start, possibly days later. The banner makes it their choice.

> **Note:** `query-client.ts` claims refetch-on-resume is "wired via AppState in the root
> layout". It is not — the only `AppState` listener there calls `syncNotificationsNow()`.
> The SDUI provider therefore wires its own listener rather than relying on that. Worth
> fixing app-wide via React Query's `focusManager`, but it is a broader behaviour change
> than SDUI should make on its own.

## How a change reaches a client

The app ships through **Google Play**. That decides which channels are available:

| What changed | Channel | Needs a Play release? |
|---|---|---|
| A layout (editor → Publish) | SDUI bundle over the API | No — it is data |
| App JS/TS (including all of the SDUI code) | expo-updates OTA, `ota-server/publish-ota.sh` | No |
| Native code, deps, or permissions | Play release | Yes |

Play permits interpreted code (JavaScript) loaded at runtime, which is what the OTA channel
is, so both of the first two rows are policy-safe.

### The sideload path was removed

The app used to self-update by downloading an APK and launching Android's package
installer, declaring `REQUEST_INSTALL_PACKAGES`. That predates the Play listing and is
gone, for two reasons:

- **It could not have worked.** Play App Signing re-signs the app with a key we do not
  hold, so a self-hosted APK has a different signature and Android refuses the install —
  after the user waits through the whole download.
- **It is against policy.** Play's Device and Network Abuse policy forbids an app
  distributed on Play from updating itself by any other mechanism, and
  `REQUEST_INSTALL_PACKAGES` is a restricted permission granted only to apps whose core
  purpose is installing apps.

Deleted: `lib/update-installer.ts`, `components/update-prompt.tsx`, `hooks/use-app-update.ts`,
`lib/updates.ts`, the `expo-intent-launcher` dependency, `EXPO_PUBLIC_UPDATE_MANIFEST_URL`,
and the permission from both `app.json` and `AndroidManifest.xml`. What survives is
`lib/app-version.ts`, for display only.

**Removing a permission is a native change, so it requires a new Play build — it cannot
ship over OTA.**

## Tests

```
backend:  npm test           45 tests — validator, feature pruning, ETag contract
mobile:   npm test           40 tests — binding resolution, conditions, path safety
```

The two that matter most, if you are deciding what not to break:

- `sdui.service.spec.ts` pins the **ETag contract**. `GET /me/ui` and `GET /me/ui/revision`
  compute the same hash by different routes. If they diverge, the "update available" banner
  applies the update, re-polls, sees a difference and offers it again — forever.
- `bindings.spec.ts` pins the **path walk**. A layout is remote input choosing which
  property gets read; without own-property checks, `{{home.constructor.prototype}}` turns a
  template resolver into a read primitive on JavaScript's object graph.

### A note on the mobile jest setup

`jest-expo@57.0.5` declares a peer on `@react-native/jest-preset@^0.86.3`, but Expo SDK 57
pins `react-native@0.86.0`, whose own peer is an exact `0.86.0`. Plain `npm install` fails
on that. Rather than bumping React Native away from the version Expo pins, or turning off
peer checking project-wide with `legacy-peer-deps`, `package.json` carries a scoped
override:

```json
"overrides": { "jest-expo": { "@react-native/jest-preset": "0.86.0" } }
```

The package involved is test-only and cannot reach the app bundle. Revisit when jest-expo
widens its range.
