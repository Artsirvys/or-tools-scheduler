import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Users, Brain, FileDown, Bell } from "lucide-react"
import { Link } from "@/i18n/routing"
import { getTranslations } from 'next-intl/server'
import { LanguageSwitcher } from "@/components/LanguageSwitcher"

export default async function LandingPage() {
  const t = await getTranslations('landing')
  const tCommon = await getTranslations('common')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="w-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-6">
          <nav className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{tCommon('appName')}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 sm:space-x-2">
              <LanguageSwitcher />
              <Link href="/auth/signin">
                <Button variant="ghost" className="text-sm sm:text-base">{tCommon('signIn')}</Button>
              </Link>
              <Link href="/auth/signup">
                <Button className="text-sm sm:text-base">{tCommon('signUp')}</Button>
              </Link>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">{t('title')}</h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-4 max-w-3xl mx-auto">
          {t('subtitle')}
        </p>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
          {t('description')}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/auth/signup">
            <Button size="lg" className="text-lg px-8 py-3">
              {tCommon('signUp')}
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
          {t('features.title')}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <Users className="h-12 w-12 text-blue-600 mb-4" />
              <CardTitle>{t('features.teamManagement.title')}</CardTitle>
              <CardDescription>
                {t('features.teamManagement.description')}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Calendar className="h-12 w-12 text-green-600 mb-4" />
              <CardTitle>{t('features.customShifts.title')}</CardTitle>
              <CardDescription>
                {t('features.customShifts.description')}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Brain className="h-12 w-12 text-purple-600 mb-4" />
              <CardTitle>{t('features.aiScheduling.title')}</CardTitle>
              <CardDescription>
                {t('features.aiScheduling.description')}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <FileDown className="h-12 w-12 text-orange-600 mb-4" />
              <CardTitle>{t('features.export.title')}</CardTitle>
              <CardDescription>
                {t('features.export.description')}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Bell className="h-12 w-12 text-red-600 mb-4" />
              <CardTitle>{t('features.notifications.title')}</CardTitle>
              <CardDescription>{t('features.notifications.description')}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Additional Info Section */}
      <section className="container mx-auto px-4 py-12 text-center">
        <p className="text-lg text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">
          {t('additionalInfo.line1')}
        </p>
        <p className="text-lg text-gray-700 dark:text-gray-300 max-w-3xl mx-auto mt-2">
          {t('additionalInfo.line2')}
        </p>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center space-x-2 mb-8">
            <Calendar className="h-8 w-8 text-blue-400" />
            <span className="text-2xl font-bold">{tCommon('appName')}</span>
          </div>
          <div className="text-center text-gray-400">
            <p>&copy; {new Date().getFullYear()} {tCommon('appName')}. {t('footer.copyright')}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

