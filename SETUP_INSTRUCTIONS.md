# Setup Instructions for Medical Shift Scheduler

## Fixing the Infinite Recursion and Database Errors

### 1. Add SUPABASE_SERVICE_ROLE_KEY to .env.local

You need to add the Supabase service role key to your environment variables. Here's how:

1. **Get your Service Role Key:**
   - Go to your Supabase dashboard: https://supabase.com/dashboard
   - Select your project
   - Go to Settings → API
   - Copy the "service_role" key (NOT the anon key)

2. **Add to .env.local:**
   Create or update your `.env.local` file in the project root with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   OPENAI_API_KEY=your_openai_key
   ESEND_API_KEY=your_esend_key
   FROM_EMAIL=your_email
   ```

### 2. Run Database Migrations

Make sure you've run the AI constraints migrations in your Supabase dashboard:

1. **Run the AI constraints table creation:**
   - Go to your Supabase dashboard → SQL Editor
   - Run the contents of `scripts/005-add-ai-constraints.sql`

2. **Run the RLS policies:**
   - Run the contents of `scripts/006-add-ai-constraints-rls.sql`

### 3. Restart Development Server

After adding the service role key:
```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

### 4. Test the Fix

1. **Test AI Constraints Update:**
   - Go to a team's manage page
   - Try updating AI logic constraints
   - Should work without database errors

2. **Test Schedule Generation:**
   - Go to dashboard
   - Click "Generate AI" on a team card
   - Should generate schedule without infinite recursion

## Troubleshooting

### If you still get errors:

1. **Check environment variables:**
   ```bash
   # In PowerShell, check if the key is loaded:
   echo $env:SUPABASE_SERVICE_ROLE_KEY
   ```

2. **Verify Supabase connection:**
   - Check that your Supabase URL and keys are correct
   - Test the connection in Supabase dashboard

3. **Check RLS policies:**
   - Make sure the AI constraints RLS policies are applied
   - The service role key should bypass RLS, but policies might still cause issues

### Common Issues:

- **"infinite recursion detected"**: Usually means RLS policies are conflicting
- **"Database error"**: Usually means service role key is missing or invalid
- **"500 Internal Server Error"**: Check console logs for specific error messages

## Security Note

The `SUPABASE_SERVICE_ROLE_KEY` should:
- ✅ Only be used in API routes (server-side)
- ✅ Never be exposed in frontend code
- ✅ Never be returned in API responses
- ✅ Be kept secure and not committed to version control

The current implementation ensures the service role key is only used server-side and is not exposed in responses.
