# CARAIT Clinic SEO patch — 20 October 2026

Scope: **frontend SEO only**. Source basis: `AllCodes(20261020-083053).txt`.

## Apply

Copy the contents of this package **over the matching relative paths** in the `Sanjuan1290/Capstone` repository root. This includes one existing file `client/index.html`, one existing file `client/src/components/layouts/Layout.jsx`, and four new files. Review changes, then commit and push to `main` to trigger the Cloudflare Pages deployment (root directory `client`). Nothing needs changing in Render, TiDB, Resend, or Cloudflare environment variables.

## Public pages

- The homepage title and description now describe the real clinic, not the internal management system.
- The homepage includes Google-readable `MedicalClinic` structured data sourced from the public clinic contact/office-hours data in the user's landing page response. Verify the street address, phone, hours, and Facebook URL remain current.
- Canonical URLs and appropriate metadata update when React Router navigates between `/`, `/news`, `/privacy-policy`, and `/terms`.
- Published news *detail* pages have a generic article title initially; consider separate per-article metadata when needed later.
- Internal routes receive `noindex` via rendered meta tags and Pages static `_headers` rules. These rules are NOT access control; keep authentication enforced in your backend.
- `client/public/sitemap.xml` lists homepage and News & Offers (detailed dynamic article URLs are not generated).
- `client/public/robots.txt` permits the public pages and references the sitemap. Do NOT disallow protected routes in robots.txt if relying on `noindex` headers; crawlers must be able to fetch the URL to see noindex.
- `carait-clinic.pages.dev` responses get `noindex` where Pages static header rules apply, preventing duplicate canonical hosting. If redirecting the pages.dev alias later, verify it separately.

## After deploying

1. Confirm `https://caraitclinic.com/robots.txt` and `https://caraitclinic.com/sitemap.xml` return their actual text/XML, not HTML.
2. On homepage, check page title, description, canonical, `application/ld+json` using browser DevTools. Confirm `/news` sets its own canonical and title.
3. Open `https://search.google.com/search-console` → Sitemaps → enter `sitemap.xml` → Submit.
4. Test the homepage in Google URL Inspection and request indexing again after this update. Inspect an internal login page to verify `noindex` header; do not rely on robots.txt alone.
5. Validate the homepage's structured data using Google's Rich Results Test: https://search.google.com/test/rich-results.

Notes: The website is a React SPA and Google's live URL Inspection shows its content renders successfully. New build files are not guaranteed to rank or appear in search immediately. No backend API, database, or private data changes are included.

