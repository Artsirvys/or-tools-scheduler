# Email Notification Setup

This document explains how to set up email notifications for shift change requests in the AISchedulator.

## Overview

The shift change functionality includes email notifications that are sent to participants when someone requests to swap shifts with them. The system is designed to work with multiple email providers.

## Current Implementation

The email system is implemented using:
- **API Route**: `/app/api/send-email/route.ts`
- **Email Service**: Resend (recommended) or any other email service
- **Integration**: Called from the shift change page when a request is submitted

## Setup Instructions

### Option 1: Resend (Recommended)

1. **Sign up for Resend**:
   - Go to [resend.com](https://resend.com)
   - Create a free account (100 emails/day free tier)
   - Verify your domain or use the provided test domain

2. **Get API Key**:
   - In your Resend dashboard, go to API Keys
   - Create a new API key
   - Copy the API key

3. **Configure Environment Variables**:
   Add to your `.env.local` file:
   ```bash
   RESEND_API_KEY=your_resend_api_key_here
   ```

4. **Update Sender Email** (Optional):
   In `/app/api/send-email/route.ts`, update the `from` email address:
   ```typescript
   from: 'your-verified-domain@yourdomain.com'
   ```

### Option 2: Other Email Services

You can easily integrate other email services by modifying the `/app/api/send-email/route.ts` file:

#### SendGrid
```typescript
// Install: npm install @sendgrid/mail
import sgMail from '@sendgrid/mail'
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const msg = {
  to: to,
  from: 'noreply@yourdomain.com',
  subject: subject,
  html: html,
}
await sgMail.send(msg)
```

#### Mailgun
```typescript
// Install: npm install mailgun.js
import formData from 'form-data'
import Mailgun from 'mailgun.js'

const mailgun = new Mailgun(formData)
const client = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY })

const messageData = {
  from: 'noreply@yourdomain.com',
  to: to,
  subject: subject,
  html: html,
}

await client.messages.create('yourdomain.com', messageData)
```

#### AWS SES
```typescript
// Install: npm install @aws-sdk/client-ses
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const ses = new SESClient({ region: 'us-east-1' })
const command = new SendEmailCommand({
  Source: 'noreply@yourdomain.com',
  Destination: { ToAddresses: [to] },
  Message: {
    Subject: { Data: subject },
    Body: { Html: { Data: html } },
  },
})

await ses.send(command)
```

## Email Templates

The current email template includes:
- Greeting with recipient's name
- Details of the shift swap request
- Original and requested shift information
- Reason for the change (if provided)
- Call to action to log into the system

### Customizing Email Templates

To customize the email template, modify the `sendEmailNotification` function in `/app/participant/shift-change/page.tsx`:

```typescript
const emailData = {
  to: targetUser.email,
  subject: 'Shift Change Request',
  html: `
    <h2>Shift Change Request</h2>
    <p>Hello ${targetUser.first_name},</p>
    <p>${requester?.first_name} ${requester?.last_name} has requested to swap shifts with you:</p>
    <ul>
      <li><strong>Their shift:</strong> ${selectedShiftData.shift.name} on ${format(new Date(selectedShiftData.date), 'MMM dd, yyyy')}</li>
      <li><strong>Your shift:</strong> ${targetShiftData.name} on ${format(targetDate!, 'MMM dd, yyyy')}</li>
    </ul>
    ${message ? `<p><strong>Reason:</strong> ${message}</p>` : ''}
    <p>Please log into the system to accept or decline this request.</p>
    <p>Best regards,<br>AISchedulator</p>
  `
}
```

## Testing

### Without Email Service
If no email service is configured, the system will log the email content to the console instead of sending it. This is useful for development and testing.

### With Email Service
1. Set up your email service (e.g., Resend)
2. Configure the environment variables
3. Submit a shift change request
4. Check the recipient's email inbox

## Troubleshooting

### Common Issues

1. **"Failed to send email" error**:
   - Check your API key is correct
   - Verify your domain is properly configured
   - Check the email service's dashboard for error logs

2. **Emails not being sent**:
   - Ensure the environment variable is set correctly
   - Check the browser console for API errors
   - Verify the email address format

3. **Spam folder issues**:
   - Configure SPF, DKIM, and DMARC records for your domain
   - Use a verified domain as the sender address
   - Avoid spam trigger words in subject lines

### Debug Mode

To enable debug logging, add this to your environment variables:
```bash
DEBUG_EMAILS=true
```

Then modify the API route to include more detailed logging.

## Security Considerations

1. **API Key Security**: Never commit API keys to version control
2. **Email Validation**: Validate email addresses before sending
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Domain Verification**: Always use verified domains for sending emails

## Future Enhancements

Potential improvements to the email system:
- Email templates with HTML/CSS styling
- Email preferences per user
- Email digests for multiple notifications
- SMS notifications as an alternative
- Email tracking and analytics 