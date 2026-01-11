import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { to, subject, html } = await request.json()

    // Check if we have Resend API key configured
    const resendApiKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.FROM_EMAIL || 'noreply@aischedulator.com'

    if (!resendApiKey) {
      // If no email service is configured, just log the email
      console.log('Email notification would be sent:', {
        to,
        subject,
        html: html.substring(0, 200) + '...', // Truncate for logging
        from: fromEmail
      })

      return NextResponse.json({ 
        success: true, 
        message: 'Email logged (no email service configured)' 
      })
    }

    // Use Resend to send the email
    const emailData = {
      from: fromEmail,
      to: [to],
      subject,
      html,
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Resend API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      
      return NextResponse.json(
        { 
          success: false, 
          message: `Failed to send email via Resend: ${response.status} ${response.statusText}`,
          error: errorText
        },
        { status: 500 }
      )
    }

    const result = await response.json()
    console.log('Email sent successfully via Resend:', result.id)

    return NextResponse.json({ 
      success: true, 
      message: 'Email notification sent successfully',
      emailId: result.id
    })
  } catch (error) {
    console.error('Error sending email:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to send email',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 