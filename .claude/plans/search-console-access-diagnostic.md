# Search Console Access Diagnostic

## Goal

Add an owner-MFA-only, read-only diagnostic action that identifies why Google rejects the configured service account for `https://chonhaviet.com/`, without changing Search Console properties, submitting another sitemap, inspecting URLs, exposing any secret, or guessing from a generic `403` response.

## Why the current behavior is insufficient

The token exchange succeeds, so the deployed private key and service-account identity can obtain an OAuth access token. Sitemap submission then fails with Google’s `User does not have sufficient permission for site 'https://chonhaviet.com/'` response. The current integration maps this correctly to `GOOGLE_AUTH`, but it cannot tell the owner whether:

- the configured service account email differs from the account added in Search Console;
- the exact URL-prefix property `https://chonhaviet.com/` is absent from the account’s Search Console property list;
- access exists only for the domain property (`sc-domain:chonhaviet.com`) or an alternate scheme/host;
- the matching property has a permission level below `siteFullUser`; or
- Google returns an access error while listing properties.

## Implementation

### 1. Server-only Search Console diagnostic

In `src/lib/server/googleSearchConsole.ts`:

- Add the documented Search Console Sites API endpoint: `GET https://www.googleapis.com/webmasters/v3/sites`.
- Reuse the existing service-account token/JWT implementation; do not expose the access token.
- Add strongly typed, minimal site-entry parsing (`siteUrl`, `permissionLevel`).
- Add a server-only diagnostic function which receives only the fixed canonical site configuration and returns a narrow result:
  - configured service-account email (not a secret; returned only through owner-MFA route);
  - exact URL-prefix property match for `https://chonhaviet.com/` and its permission level;
  - domain-property match for `sc-domain:chonhaviet.com` and its permission level;
  - known same-site alternate URL-prefix variants only, if Google returned them (`http`, `www`), not unrelated properties;
  - a deterministic diagnosis code and Vietnamese remediation text.
- Treat `siteOwner` and `siteFullUser` as sufficient. `siteRestrictedUser`, `siteUnverifiedUser`, missing property, and API response errors remain distinct diagnostic states.
- Do not return all Search Console properties, raw Google responses, access tokens, private-key material, or environment values.

### 2. Owner-only API action

In `app/api/admin/search-visibility/route.ts`:

- Add a narrow action: `diagnose_access`.
- Keep the existing `requireOwner()` boundary.
- Invoke the server diagnostic only; it must issue only an authenticated `GET /sites` request to Google and must never invoke sitemap `PUT` or URL Inspection `POST`.
- Return structured result/error fields so the UI can distinguish configuration, token auth, property access, and Google API failures.

### 3. Admin diagnostic UI

In `src/components/admin/tabs/SeoGeoTab.tsx` and the client API wrapper:

- Add a separate button labelled in Vietnamese equivalent to “Chẩn đoán quyền Search Console”.
- Make its read-only behavior explicit: it lists only the configured service account’s matching property permissions; it does not submit sitemap or request indexing.
- Show exact configured service-account email only after successful owner-authorized diagnostic, alongside one of clear result states:
  - exact canonical property has Full/Owner access;
  - exact property missing but domain property exists;
  - exact property exists with insufficient level;
  - no matching `chonhaviet.com` property visible.
- Present specific next action for each result, without showing other unrelated Search Console sites or any secret.

### 4. Test cases

Extend `src/lib/server/googleSearchConsole.test.ts` with mocked Google calls that verify:

1. The diagnostic exchanges a JWT for a token, then makes exactly one `GET` request to the Sites endpoint; no sitemap `PUT` or inspection `POST` occurs.
2. An exact `https://chonhaviet.com/` entry with `siteFullUser` is classified as sufficient.
3. An exact entry with `siteOwner` is sufficient.
4. `siteRestrictedUser` and `siteUnverifiedUser` are classified as insufficient, retaining the actual Google permission level.
5. Only `sc-domain:chonhaviet.com` is classified as domain-only, not mistaken for exact URL-prefix access.
6. `www`, `http`, and unrelated site entries do not satisfy canonical URL-prefix access.
7. No matching entry is classified as missing access.
8. A failed Sites API response becomes a structured diagnostic error without leaking a token, key, or arbitrary Google response data.

Extend `app/api/admin/search-visibility/route.test.ts` to verify:

- owner-MFA enforcement on `diagnose_access`;
- an unsupported action remains rejected;
- the route dispatches the diagnostic action and returns only its narrow result shape;
- the browser cannot submit an arbitrary site URL, service account email, or Google request parameters.

### 5. Validation

- Run focused Search Console client and route tests.
- Run typecheck and full Vitest.
- Run production build if local dependencies allow.
- Run `graphify update .` after source changes.
- Use real Chrome in an owner-MFA production session to verify the diagnostic button, its no-secret UI, and the returned matching-property result. This will be a bounded external read from Google, not a sitemap submission.
- Record the required verify-gate receipt with exactly what real browser pages/actions were checked and any owner-only limitations.

## Security and operational constraints

- No production SQL or migration is needed.
- Do not use the Google Indexing API.
- Do not automatically submit a sitemap after diagnostics.
- Do not put credentials, tokens, key material, raw environment values, or unrelated Search Console properties in browser payloads, logs, test fixtures, or UI.
- The diagnostic can prove the service account Google recognizes and its effective property visibility/role; it cannot make Google grant a role. Any Search Console permission correction remains an owner action.
- A separate explicit owner authorization remains required before the next sitemap submission.
