"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, AlertTriangle, CheckCircle, Calendar } from "lucide-react"
import Link from "next/link"

interface TrialInfo {
  trial_id: string
  plan_id: string
  plan_name: string
  plan_display_name: string
  trial_start: string
  trial_end: string
  days_remaining: number
  schedule_generations_used: number
  max_schedule_generations: number
  status: string
}

interface TrialStatusIndicatorProps {
  userId: string
}

export default function TrialStatusIndicator({ userId }: TrialStatusIndicatorProps) {
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTrialInfo = async () => {
      try {
        const response = await fetch(`/api/trial-info?userId=${userId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.trialInfo) {
            setTrialInfo(data.trialInfo)
          }
        }
      } catch (error) {
        console.error('Error fetching trial info:', error)
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchTrialInfo()
    } else {
      setLoading(false)
    }
  }, [userId])

  if (loading) {
    return null
  }

  if (!trialInfo) {
    return null
  }

  const getStatusColor = () => {
    if (trialInfo.days_remaining <= 0) {
      return "bg-red-500"
    } else if (trialInfo.days_remaining <= 3) {
      return "bg-orange-500"
    } else if (trialInfo.days_remaining <= 7) {
      return "bg-yellow-500"
    } else {
      return "bg-blue-500"
    }
  }

  const getStatusIcon = () => {
    if (trialInfo.days_remaining <= 0) {
      return <AlertTriangle className="h-4 w-4" />
    } else if (trialInfo.days_remaining <= 3) {
      return <AlertTriangle className="h-4 w-4" />
    } else {
      return <Clock className="h-4 w-4" />
    }
  }

  const getStatusText = () => {
    if (trialInfo.days_remaining <= 0) {
      return "Trial Expired"
    } else if (trialInfo.days_remaining === 1) {
      return "1 day left"
    } else {
      return `${trialInfo.days_remaining} days left`
    }
  }

  const getScheduleUsageColor = () => {
    const usage = trialInfo.schedule_generations_used / trialInfo.max_schedule_generations
    if (usage >= 1) {
      return "text-red-600"
    } else if (usage >= 0.8) {
      return "text-orange-600"
    } else {
      return "text-green-600"
    }
  }

  return (
    <Card className="mb-6 border-l-4 border-l-blue-500 bg-blue-50/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getStatusIcon()}
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900">
                  {trialInfo.plan_display_name} Trial
                </span>
                <Badge className={`${getStatusColor()} text-white`}>
                  {getStatusText()}
                </Badge>
              </div>
              <div className="text-sm text-gray-600 mt-1">
                <div className="flex items-center space-x-4">
                  <span className="flex items-center space-x-1">
                    <Calendar className="h-3 w-3" />
                    <span>Trial ends: {new Date(trialInfo.trial_end).toLocaleDateString()}</span>
                  </span>
                  <span className={`flex items-center space-x-1 ${getScheduleUsageColor()}`}>
                    <CheckCircle className="h-3 w-3" />
                    <span>
                      {trialInfo.schedule_generations_used}/{trialInfo.max_schedule_generations} schedules generated
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {trialInfo.days_remaining > 0 ? (
              <Link href="/subscribe">
                <Button size="sm" variant="outline">
                  Upgrade Now
                </Button>
              </Link>
            ) : (
              <Link href="/subscribe">
                <Button size="sm" className={trialInfo.plan_name === 'free' ? "bg-blue-600 hover:bg-blue-700" : "bg-red-600 hover:bg-red-700"}>
                  {trialInfo.plan_name === 'free' ? 'Upgrade Now' : 'Subscribe Now'}
                </Button>
              </Link>
            )}
          </div>
        </div>
        
        {trialInfo.days_remaining <= 3 && trialInfo.days_remaining > 0 && (
          <div className="mt-3 p-3 bg-orange-100 border border-orange-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <span className="text-sm text-orange-800 font-medium">
                Your trial is ending soon! Upgrade now to continue using all features.
              </span>
            </div>
          </div>
        )}

        {trialInfo.days_remaining <= 0 && (
          <div className="mt-3 p-3 bg-red-100 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-800 font-medium">
                {trialInfo.plan_name === 'free' 
                  ? "Your free trial has ended. You can continue using the free plan with limited features."
                  : "Your trial has expired. Subscribe now to continue using all features."
                }
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
