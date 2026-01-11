import { defineRouting } from 'next-intl/routing'
import { createNavigation } from 'next-intl/navigation'

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ['en', 'lt', 'pl', 'it', 'de'],

  // Used when no locale matches
  defaultLocale: 'en',

  // The `pathnames` object holds pairs of internal and external pathnames.
  // This allows you to have different paths for different locales.
  // If you omit a locale, the external pathname will be the same as the internal one.
  // pathnames: {
  //   '/': '/',
  //   '/dashboard': '/dashboard'
  // }
})

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)

