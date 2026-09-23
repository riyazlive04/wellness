# White-Labeling — How It's Implemented

White-labeling in NUSI follows a clean **entitlement → flag → effective-resolution → consumers** pattern. A workspace's stored preference is *never trusted on its own*; it's always re-checked against the workspace's live plan/add-on entitlement, so branding can never leak past a downgrade.

---

## 1. Entitlement — *who is allowed* to white-label

A workspace earns white-label two ways, resolved together:

- **By plan** — `backend/src/common/plan-capabilities.ts`
  ```ts
  export const WHITE_LABEL_PLANS = ['scale_pro', 'elite']; // 'elite' = legacy, grandfathered
  export function canWhiteLabel(plan?: string | null): boolean {
    return !!plan && WHITE_LABEL_PLANS.includes(plan.toLowerCase());
  }
  ```
- **By add-on** — `backend/src/billing/addons.ts`
  A recurring **`white_label`** add-on (₹2,999/mo) sold to the **Growth** plan, tracked in `workspace_addons`.

The **single source of truth** combines both — `backend/src/billing/workspace-addons.ts`:
```ts
workspaceCanWhiteLabel(prisma, workspaceId, plan)
  = canWhiteLabel(plan)               // plan includes it (Scale Pro / legacy Elite)
 || activeAddons.has('white_label');  // OR the Growth add-on is active
```
> Everything that gates on white-label calls **`workspaceCanWhiteLabel()`**, never the plan-only `canWhiteLabel()`.

---

## 2. The flag — *the owner's choice*

A boolean column **`workspaces.white_label`**, toggled by the owner in **Settings → Branding**:

- Web: `frontend/src/modules/workspace/settings/sections/BrandingSection.tsx`
- Mobile: `src/app/(owner)/more/settings.tsx`

Enabling it is **gated server-side** — `backend/src/workspaces/workspaces.controller.ts`:
```ts
if (dto.white_label === true && !(await workspaceCanWhiteLabel(this.prisma, ws.id, ws.plan))) {
  throw new ForbiddenException(
    'White-label branding is included with Scale Pro, or available as an add-on on Growth. Upgrade or add it to enable.',
  );
}
```

---

## 3. Effective resolution — *downgrade-safe* (the key design point)

The stored flag is **never trusted raw**. On every read, the effective value is recomputed:

```ts
effective_white_label = stored_flag && workspaceCanWhiteLabel(...)
```

- Owner-facing: `backend/src/workspaces/workspaces.controller.ts` (~L117)
- Client-facing brand payload: `backend/src/clients/clients.service.ts` (~L915)

So if a workspace **downgrades or cancels the add-on**, white-label silently switches off even though the DB flag stays `true`. No stale branding survives a plan change.

---

## 4. The brand payload — *what gets shipped to clients*

`backend/src/clients/clients.service.ts` (~L909) returns the full brand for a client's workspace:

```
name, display_name, logo_url, tagline, brand_color, brand_accent, white_label
(+ legal_name, pdf_contact_line, pdf_footer_note for documents)
```

Key nuance: **colors and logo are always returned** (they tint the UI regardless). `white_label` only controls the **attribution + platform-logo fallback**.

---

## 5. Consumers — *where it actually changes behavior*

| Surface | File | Effect when `white_label` is true |
|---|---|---|
| **PDF exports** (meal plans, reports, invoices) | `frontend/src/modules/workspace/pdf/pdfBrand.ts` | Drops the **"Powered by NUSI"** footer; uses the workspace logo instead of the platform mark |
| **Client portal footer** | `frontend/src/components/AppFooter.tsx` | `showPoweredBy={false}` — hides platform attribution |
| **Client portal theme** | `frontend/src/modules/client/ClientLayout.tsx` | Brand colors tint accents / highlights |
| **Mobile app** | `src/app/(owner)/more/settings.tsx`, `src/lib/clients-api.ts` | Same gate on the toggle; client app pulls brand via `/api/v1/me/nutritionist` |

Colors/logo apply even **without** white-label — the flag specifically toggles the *platform attribution*.

---

## The flow in one line

```
plan / add-on ─▶ workspaceCanWhiteLabel() ─▶ gates the toggle ─▶ workspaces.white_label
       └───────────────────────────────────▶ AND'd on every read ─▶ brand payload
                                                                        └▶ PDFs / portal footer / colors
                                                                            hide "Powered by NUSI" + swap logo
```

---

## Sibling add-ons (same entitlement pattern)

White-label is one of a set of premium branding add-ons resolved the same way — see `backend/src/billing/addons.ts`:

- **`custom_domain`** — serve the client portal on the practice's own domain
- **`whatsapp_api`** — branded WhatsApp Business messaging

---

## Quick reference — key files

| Concern | File |
|---|---|
| Plan capability | `backend/src/common/plan-capabilities.ts` |
| Add-on catalog | `backend/src/billing/addons.ts` |
| Effective entitlement check | `backend/src/billing/workspace-addons.ts` |
| Enable gate + owner read | `backend/src/workspaces/workspaces.controller.ts` |
| Update DTO (`white_label`) | `backend/src/workspaces/dto/update-workspace.dto.ts` |
| Client brand payload | `backend/src/clients/clients.service.ts` |
| Branding settings (web) | `frontend/src/modules/workspace/settings/sections/BrandingSection.tsx` |
| Frontend plan mirror | `frontend/src/lib/planCapabilities.ts` |
| PDF branding consumer | `frontend/src/modules/workspace/pdf/pdfBrand.ts` |
| Portal footer consumer | `frontend/src/components/AppFooter.tsx` |
