"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"
import Link from "next/link"

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <AlertCircle className="h-12 w-12 text-red-500" />
          </div>
          <CardTitle className="text-2xl text-red-600">Authentication Error</CardTitle>
          <CardDescription>
            There was an error confirming your email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 text-center">
            The email confirmation link may have expired or been used already. 
            Please try signing up again or contact support if the problem persists.
          </p>
          <div className="flex flex-col space-y-2">
            <Link href="/auth/signup">
              <Button className="w-full">Try Again</Button>
            </Link>
            <Link href="/auth/signin">
              <Button variant="outline" className="w-full">Sign In</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
