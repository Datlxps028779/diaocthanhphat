# Staff portal, listing prices & pre-approval review plan

## Scope confirmed
- Preserve the already-completed cookie consent UI as-is; include it in the later verification/commit scope, but do not redesign it.
- Fix the staff access route so an actual `staff` account reaches `/noi-bo`; unauthenticated and unauthorized direct requests remain indistinguishable from missing private routes.
- Make the sale-price UX consistent in every listing-entry surface: explicit `Triệu` / `Tỷ`, digit grouping while typing, and numeric conversion that retains the selected unit.
- Add a safe pre-approval review workflow where staff/admin can inspect every submitted field and image, edit the pending source record, then approve it using the existing atomic approval RPC.

## Root causes and architecture decisions

### `/noi-bo` 404
The route itself exists at `app/noi-bo/[[...seg]]/page.tsx`, but private middleware deliberately returns 404 unless `is_admin_or_staff()` passes. The immediate staff login defect is `UserAuthModal`: it treats `staff` and `admin` identically and redirects both to owner-only `/quantrihethong`. Staff then correctly fails that owner-MFA gate and sees 404.

**Decision:** keep the existing fail-closed middleware/server guards; add a pure role-to-private-destination helper and route exact `staff` to `/noi-bo`, exact `admin` to `/quantrihethong`. Add unit coverage. Do not turn `/noi-bo` into a public login page.

### Price values
The database stores `price` plus `price_unit` (typically `tỷ` or `triệu`) and the current public approval conversion copies both fields. The user posting form already offers the two sale units, but inputs are `type=number`, no thousands separators are shown, and parsing/preview/calculation are repeated ad hoc. The admin property form is a second authoring surface and needs the same UX.

**Decision:** introduce a small pure `listingPrice` utility to:
- sanitize a formatted typed value into a canonical numeric string (support existing decimals),
- format the display value using Vietnamese grouping without altering the stored unit,
- parse finite positive values for validation/payloads, and
- format a `value + unit` consistently for previews and loan calculations.

Use `type=text`, `inputMode=decimal`, and formatting at the controlled-input boundary for sale price and loan support in `PostListingPage` and the admin property editor. Keep database representation and property filters unchanged; no data migration is needed. Rental remains `triệu/tháng` and should use the same grouping utility for rental monthly value where present.

### Safe staff/admin review edits before approval
`UserListingsApprovalTab` currently shows only thumbnail/summary and calls approval directly. `approve_user_listing()` already locks the listing and atomically maps `user_listings` to `properties`; therefore a review must edit the pending `user_listings` source, never create/update a public property directly.

Direct team `UPDATE` RLS is broad and would permit lifecycle/identity fields, while the lifecycle audit only records status/expiry changes. The review feature must not rely on that bypass.

**Decision:** add a migration with a pending-only, `SECURITY DEFINER` RPC (`admin_edit_pending_user_listing`) that locks the row, checks `is_admin_or_staff()`, whitelists editorial fields, validates types/media invariants, and rejects modifications to ownership/lifecycle fields (`user_id`, `status`, `property_id`, rejection/expiry/audit columns). It writes an immutable `admin_edited` lifecycle event with a non-sensitive changed-field summary. Browser roles retain no direct audit writes.

Add dedicated review-media Storage access for team users constrained to `listing-review/<listing-id>/...` where the listing is pending. Staff must not use the existing owner-only `public-media` upload path and must not impersonate the listing owner in `user_media`. Removing/reordering an image only changes listing references; it does not physically delete shared Storage objects.

## Implementation sequence

1. **Staff redirect and regression tests**
   - Update `src/lib/authGuard.ts` with a pure role→private-path helper.
   - Update `src/components/UserAuthModal.tsx` to route `staff` to `/noi-bo`, `admin` to `/quantrihethong`, and retain ordinary-user flow.
   - Extend `src/lib/authGuard.test.ts` for staff, admin, user, null, and unknown roles.
   - Retain `middleware.ts`, `app/noi-bo/[[...seg]]/page.tsx`, and `AdminClient` privacy behavior. Before runtime testing, confirm the target environment has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, because their absence intentionally yields 404 for private routes.

2. **Centralize listing price input/formatting**
   - Add `src/lib/listingPrice.ts` and `src/lib/listingPrice.test.ts` for grouping/sanitization/parsing/cross-unit display behavior, including commas, spaces, decimal input, invalid input, zero, and unit preservation.
   - Update `src/screens/PostListingPage.tsx` to use the utility for sale price, sale loan support, rental monthly price, validation, payload conversion, review text, AI context, and preview inputs.
   - Update `src/lib/listingForm.ts` and its tests so persisted numeric values round-trip into the formatted editable values safely.
   - Update `src/components/admin/tabs/PropertiesTab.tsx` to use the same formatted controlled price/loan inputs and unit selector. This is required because admins are also accounts that enter listing values.
   - Do not change existing stored records, property-to-price filtering, or the atomic approval column mapping; price stays a numeric value expressed in its explicit selected unit.

3. **Database/RLS and audit migration for review edits**
   - Create an additive migration after the latest applied listing lifecycle migrations plus a companion read-only dry-run/verification SQL file. Do not apply production SQL.
   - Create `admin_edit_pending_user_listing(p_listing_id uuid, p_patch jsonb)` with `SECURITY DEFINER`, `SET search_path = public, pg_temp`, team authorization, `FOR UPDATE`, pending-only enforcement, explicit content field whitelist, and typed validation.
   - Enforce `images` deduplication/limit and a cover invariant (cover must be null or present in the gallery; normalize gallery-only submissions so the first gallery image becomes cover).
   - Extend the lifecycle-event constraint/type and trigger for `admin_edited`, recording actor id/role and changed-column names plus image-count/cover-change indicators—not raw description or phone data.
   - Prefer completing the boundary: add similarly narrow RPCs for reject, bulk reject, and expiry management, then remove the broad browser `UPDATE` policy. If that expansion proves too large after the schema audit, retain current lifecycle calls temporarily but add a protective trigger that blocks protected-column changes outside the whitelist; document that reduced hardening explicitly.
   - Add narrowly-scoped `public-media` Storage policies for team review uploads only under `listing-review/<pending-listing-id>/...`; do not add broad staff Storage writes.

4. **Review editor UI and API integration**
   - Add `adminGetUserListing(id)` and `adminEditPendingUserListing(id, patch)` to `src/lib/api/userListings.ts`; have the UI use only the RPC for saving editorial edits.
   - Expand `src/components/admin/tabs/UserListingsApprovalTab.tsx` with an **Xem & chỉnh trước duyệt** action/modal. It loads the full record and presents every submitter-controlled field, complete gallery, description, contact, location/specification, SEO/FAQ, and a public-page-equivalent preview.
   - Reuse form conversion, rich text editor, taxonomy selectors, `ImageUpload`, and `ImageUrlInput` where they are compatible. Add/reorder/remove/select-cover controls. New staff uploads use the restricted review-media namespace.
   - Disable direct/bulk approval while an item is in edit mode; save, reload, then call the existing atomic `approveUserListing` RPC. Preserve rejected/expired restoration behavior separately from pending review.
   - Update lifecycle labels/types and the existing history modal to show the non-sensitive review-edit event.

5. **Test and verify**
   - Unit-test exact staff destination, price parsing/formatting/round-trips, API RPC request/response validation, and review editor field-to-patch conversion.
   - Add SQL dry-run assertions for: non-team denial; pending-only edits; protected-field rejection; actor/audit metadata; image invariant; review-media path restriction; and approval mapping of edited title/images into the property while preserving reapproval identity.
   - Run targeted Vitest, full typecheck, full Vitest, and production build.
   - Use real Chrome against a clean production build: signed-out private route remains 404; actual staff sign-in reaches `/noi-bo`; ordinary user cannot enter; price grouping and unit selection work in the user and admin authoring surfaces; staff opens a pending listing, changes content and gallery, sees preview, saves, approves, and the public property reflects the approved edited content. Explicitly state any account-dependent checks that cannot run.
   - Run `graphify update .` after source edits, then record verification using the mandated verify gate. Ask for a separate push authorization only after verification and after showing the exact changed scope.

## Production prerequisites
- Verify which P3A–P3D, lifecycle-audit, and public-media migrations are actually applied before the new migration is offered.
- Production SQL is for the user to run. After they confirm execution, perform read-only DB verification before treating the migration as live.
- A genuine staff test account (`profiles.role = 'staff'`) is required for end-to-end `/noi-bo` and restricted upload verification; a normal admin account is not automatically eligible unless it is the configured MFA owner.
