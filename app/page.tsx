import { redirect } from 'next/navigation'
import { routing } from '@/i18n/routing'

// This page only renders when the user visits the root path
// It redirects to the default locale
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`)
}
