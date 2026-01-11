"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

interface FeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [question1, setQuestion1] = useState("")
  const [question2, setQuestion2] = useState("")
  const [canContact, setCanContact] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const handleSubmit = async () => {
    if (!question1.trim() || !question2.trim()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Combine both answers into a single message
      const message = `What confused you or didn't work as expected?\n${question1.trim()}\n\nWhat feature would save you the most time?\n${question2.trim()}`

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          canContact,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit feedback')
      }

      setSubmitSuccess(true)
      
      // Reset form
      setQuestion1("")
      setQuestion2("")
      setCanContact(false)

      // Close dialog after 2 seconds
      setTimeout(() => {
        setSubmitSuccess(false)
        onOpenChange(false)
      }, 2000)
    } catch (error) {
      console.error('Error submitting feedback:', error)
      alert('Failed to submit feedback. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setQuestion1("")
      setQuestion2("")
      setCanContact(false)
      setSubmitSuccess(false)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Send Feedback ❤️</DialogTitle>
          <DialogDescription className="text-base pt-2">
            Your time matters. We are here to make scheduling effortless — and your feedback helps us improve faster. Thank you for helping us build a tool that truly supports your team.
          </DialogDescription>
        </DialogHeader>

        {submitSuccess ? (
          <div className="py-8 text-center">
            <p className="text-lg font-medium text-green-600 dark:text-green-400">
              Thank you for your feedback! ❤️
            </p>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="question1">
                What confused you or did not work as expected?
              </Label>
              <Textarea
                id="question1"
                placeholder="Share your thoughts..."
                value={question1}
                onChange={(e) => setQuestion1(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="question2">
                What feature would save you the most time?
              </Label>
              <Textarea
                id="question2"
                placeholder="Share your ideas..."
                value={question2}
                onChange={(e) => setQuestion2(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="canContact"
                checked={canContact}
                onCheckedChange={(checked) => setCanContact(checked === true)}
              />
              <Label
                htmlFor="canContact"
                className="text-sm font-normal cursor-pointer"
              >
                Can we contact you if we need more details?
              </Label>
            </div>
          </div>
        )}

        <DialogFooter>
          {!submitSuccess && (
            <Button
              onClick={handleSubmit}
              disabled={!question1.trim() || !question2.trim() || isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

