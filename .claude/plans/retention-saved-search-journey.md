# Retention Phase — Honest Saved-Search Journey

## Objective

Improve return-path UX for browsing users without claiming that a notification was sent when the current system only saves search criteria and exposes an alert preference. The focus is the existing Listing → Account saved-search journey, not a new outbound messaging system.

## Evidence from the current implementation

- Listings auto-save meaningful filters only for signed-in users through `autoSaveSearch()`.
- The existing green notice says users can enable alerts in Account, but it has no direct action and can be shown repeatedly after every successful update.
- Saved searches already have `alert_enabled` and `cadence`, but their own API comments state delivery is merely a foundation; no verified matching-and-delivery pipeline should be implied.
- The Account hub already supports `?tab=saved` client-side and contains the actual saved-search controls.
- Discovery rails are already present on home/detail/listings, but the result page does not include a recently-viewed continuation module after the main grid.

## Implementation

### 1. Direct, honest saved-search CTA

On ListingsPage, replace the passive auto-save confirmation with a state-specific journey:

- Signed-in save succeeds: show “Đã lưu tiêu chí tìm kiếm” with a direct link to `/tai-khoan?tab=saved` labeled “Quản lý cảnh báo”.
- Copy explains that alerts are a preference to configure there; it must not say a notification will definitely be sent.
- Preserve dismissal and existing analytics; add an explicit CTA click event.
- Dedupe notice by saved-search id/signature per visit so an unchanged auto-save update does not repeatedly interrupt browsing.

### 2. Account deep-link and saved-search readiness

- Ensure `/tai-khoan?tab=saved` opens the saved tab reliably after Next routing/hydration.
- In the saved-search tab, distinguish:
  - search is saved;
  - alert preference enabled/disabled;
  - delivery is not yet represented as a sent notification unless a future verified delivery subsystem records it.
- Keep RLS/user ownership behavior unchanged.

### 3. Continue-browsing support in listing results

- Add `RecentlyViewed` after the listings continuation / ForYou modules, rendering only when actual local history exists.
- Keep the current property id out of scope (list page has none) and retain user data only in local storage.
- Track its view/click under existing discovery telemetry with no raw listing or personal data payload.

### 4. Tests and verification

- Extend pure journey logic tests for notice/CTA state and de-duplication.
- Add focused UI/unit coverage if existing test conventions allow it.
- Run full test suite, typecheck, production build, graphify update, and real Chrome checks on a public listing route. Admin/account authenticated journey is explicitly noted if unavailable.

## Non-goals

- No email, Zalo, push notification, or Edge-function sending.
- No claim of “new matching listing was sent.”
- No DB migration or production SQL.
- No Search Console or Google API operation.
