'use client'

import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs'
import { SessionContextProvider } from '@supabase/auth-helpers-react'
import { useState } from 'react'

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createPagesBrowserClient())

  return (
    <SessionContextProvider supabaseClient={supabase}>
      {children}
    </SessionContextProvider>
  )
}
