# i18n Migration Plan - Preserving Functionality

## Critical Functionality to Preserve

1. ✅ **API Routes** - Excluded from middleware, won't break
2. ⚠️ **Auth Callback** - API route, safe
3. ⚠️ **Email Invitation Links** - Need locale prefix
4. ⚠️ **Auth Redirects** - Need locale-aware redirects
5. ✅ **Schedule Generation** - API route, safe
6. ✅ **Database Operations** - Unchanged

## Step-by-Step Migration (Safe Approach)

### Phase 1: Infrastructure (DONE)
- ✅ next-intl installed
- ✅ Translation files created
- ✅ Middleware configured
- ✅ [locale] layout created

### Phase 2: Move Routes (NEXT)
- Move all routes from `app/` to `app/[locale]/`
- Keep API routes in `app/api/` (they're excluded)

### Phase 3: Fix Critical Auth Paths (IMMEDIATE)
1. Auth callback redirects (3 places)
2. Email invitation links (1 place)
3. Signin/signup redirects (4 places)

### Phase 4: Update Links/Routers (GRADUAL)
- Replace Link imports
- Replace router imports
- Fix window.location redirects

## Files That Need Immediate Fixes

### Critical (Breaks Auth Flow):
1. `app/auth/callback/route.ts` - 3 redirects
2. `app/api/send-team-invitation/route.ts` - email link
3. `app/auth/signin/page.tsx` - 2 redirects
4. `app/auth/signup/page.tsx` - 2 redirects
5. `app/auth/waiting-for-confirmation/page.tsx` - 1 redirect

### Non-Critical (Can be done gradually):
- All other Link/router imports
- Other navigation redirects

