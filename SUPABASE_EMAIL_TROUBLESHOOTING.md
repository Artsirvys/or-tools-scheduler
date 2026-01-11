# Supabase Email Confirmation Troubleshooting

## Step 1: Check Supabase Dashboard Settings

### Authentication → Settings → Email
1. **Enable email confirmations**: Should be ON
2. **Site URL**: Must match your domain
   - Development: `http://localhost:3000`
   - Production: `https://yourdomain.com`
3. **Redirect URLs**: Should include your callback URL
   - Add: `http://localhost:3000/auth/callback` (for development)
   - Add: `https://yourdomain.com/auth/callback` (for production)

### Authentication → URL Configuration
1. **Site URL**: Must be exactly correct
2. **Redirect URLs**: Add your callback route

## Step 2: Check Email Provider Settings

### If using Supabase's default email:
- Check if you've hit the email rate limit (3 emails/hour on free tier)
- Verify your project isn't suspended

### If using custom SMTP:
- Check SMTP credentials
- Verify sender email is verified
- Check SMTP server status

## Step 3: Test Email Configuration

### Option A: Test with Supabase CLI
```bash
supabase auth test-email --email your-test@email.com
```

### Option B: Check Supabase Logs
1. Go to Dashboard → Logs
2. Filter by "auth" 
3. Look for email-related errors

## Step 4: Quick Fixes to Try

### Fix 1: Reset Email Settings
1. Turn OFF email confirmations
2. Save settings
3. Turn ON email confirmations
4. Save settings again

### Fix 2: Update Site URL
1. Set Site URL to: `http://localhost:3000` (for development)
2. Add Redirect URL: `http://localhost:3000/auth/callback`

### Fix 3: Check Rate Limits
- If you've sent more than 3 emails in the last hour, wait
- Or upgrade to a paid plan for higher limits

## Step 5: Alternative Solutions

### Option A: Use Custom Email Provider
1. Set up SendGrid, Mailgun, or similar
2. Configure in Supabase → Authentication → Settings → SMTP

### Option B: Temporary Workaround
1. Disable email confirmation temporarily
2. Users can sign up immediately without email verification
3. Re-enable once issue is resolved

## Step 6: Verify Environment Variables

Make sure these are correct in your `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Common Issues and Solutions

### Issue: "Error sending confirmation email"
- **Cause**: Supabase email service down or misconfigured
- **Solution**: Check email settings, try custom SMTP

### Issue: 500 Internal Server Error
- **Cause**: Supabase backend issue or rate limiting
- **Solution**: Check logs, wait for rate limit reset, contact support

### Issue: Email not received
- **Cause**: Email going to spam, wrong email address
- **Solution**: Check spam folder, verify email address

## Emergency Workaround

If nothing works, temporarily disable email confirmation:

1. Go to Supabase Dashboard → Authentication → Settings
2. Turn OFF "Enable email confirmations"
3. Save settings
4. Users can now sign up immediately without email verification
5. Re-enable once the issue is resolved
