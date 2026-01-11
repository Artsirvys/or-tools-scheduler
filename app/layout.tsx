import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AISchedulator',
  description: 'AI-powered shift scheduling for medical teams',
  generator: 'AISchedulator',
  keywords: 'shift scheduling, medical teams, AI scheduling, healthcare, roster management',
  authors: [{ name: 'AISchedulator' }],
  creator: 'AISchedulator',
  publisher: 'AISchedulator',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'AISchedulator',
    description: 'AI-powered shift scheduling for medical teams',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'AISchedulator',
    description: 'AI-powered shift scheduling for medical teams',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
