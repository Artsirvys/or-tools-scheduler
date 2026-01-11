import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const intlMiddleware = createMiddleware(routing)

export async function middleware(req: NextRequest) {
  // First, handle i18n routing
  const response = intlMiddleware(req)

  // Extract locale from pathname
  const pathname = req.nextUrl.pathname
  const localeMatch = pathname.match(/^\/(en|lt|pl|it|de)(\/|$)/)
  const locale = localeMatch ? localeMatch[1] : routing.defaultLocale
  const pathnameWithoutLocale = localeMatch 
    ? pathname.replace(`/${locale}`, '') || '/'
    : pathname

  // Create Supabase client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value, options }) => req.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  // Protect dashboard routes
  if (pathnameWithoutLocale.startsWith('/dashboard') || 
      pathnameWithoutLocale.startsWith('/participant')) {
    if (!session) {
      const signInPath = `/${locale}/auth/signin`
      return NextResponse.redirect(new URL(signInPath, req.url))
    }
  }

  return response
}

export const config = {
  // Match all pathnames except for
  // - … if they start with `/api`, `/_next` or `/_vercel`
  // - … the ones containing a dot (e.g. `favicon.ico`)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
}
