# Development Security Setup

This document explains the development security measures in place to protect your AISchedulator webapp during development.

## Current Security Implementation

### Basic HTTP Authentication
- **Purpose**: Prevents unauthorized access to your development site
- **Scope**: All routes except static assets (images, CSS, JS)
- **Environment**: Only active in development mode (NODE_ENV !== 'production')

### Security Features
- ✅ Environment variable-based credentials
- ✅ Production mode bypass (no auth required in production)
- ✅ Error handling for invalid credentials
- ✅ Custom realm name for better UX

## Setup Instructions

### 1. Configure Environment Variables

Add these to your `.env.local` file:

```bash
# Development Authentication (only used in development)
DEV_AUTH_USER=your_username_here
DEV_AUTH_PASS=your_strong_password_here
```

### 2. Recommended Strong Password

Use a strong password that includes:
- At least 12 characters
- Mix of uppercase and lowercase letters
- Numbers and special characters
- Not based on common words or patterns

Example: `Dev@iSchedulator2024!`

### 3. Security Best Practices

1. **Never commit credentials to version control**
   - Keep `.env.local` in your `.gitignore`
   - Use different credentials for different environments

2. **Use HTTPS in development**
   - Basic auth sends credentials in base64 (easily decoded)
   - HTTPS encrypts the entire request

3. **Regular credential rotation**
   - Change development credentials periodically
   - Use different credentials for team members

4. **Monitor access logs**
   - Check your development server logs for failed auth attempts
   - Consider implementing rate limiting for production

## How It Works

1. **Development Mode**: Basic auth is required for all routes
2. **Production Mode**: No basic auth (handled by your actual auth system)
3. **Static Assets**: Always accessible (images, CSS, JS files)
4. **Invalid Credentials**: Returns 401 with custom message

## Troubleshooting

### "Unauthorized" Error
- Check your `.env.local` file has the correct credentials
- Ensure you're entering the right username/password
- Verify the environment variables are loaded

### Credentials Not Working
- Restart your development server after changing `.env.local`
- Check for typos in environment variable names
- Ensure no extra spaces in the values

## Production Deployment

When deploying to production:
1. The basic auth middleware is automatically disabled
2. Your actual Supabase authentication will handle user access
3. No additional configuration needed

## Security Assessment

### Strengths
- ✅ Prevents casual access during development
- ✅ Environment variable-based configuration
- ✅ Production mode bypass
- ✅ Simple and reliable

### Limitations
- ⚠️ Basic auth sends credentials in base64 (use HTTPS)
- ⚠️ Single point of access (no user-specific permissions)
- ⚠️ No session management or logout functionality

### Recommendations
- Use HTTPS in development
- Implement proper Supabase authentication for production
- Consider adding rate limiting for production
- Monitor access logs regularly 