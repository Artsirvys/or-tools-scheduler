import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import OpenAI from 'openai'

// Create Supabase service client to bypass RLS policies
let supabaseService: SupabaseClient;

try {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey || serviceRoleKey.includes('eyJ') === false) {
      throw new Error('Invalid service role key format')
    }
    supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        db: {
          schema: 'public'
        }
      }
    )
    console.log('Using service role key for custom constraints operations')
  } else {
    throw new Error('Service role key not configured')
  }
} catch (error) {
  console.error('Error creating Supabase client:', error)
  throw new Error('Failed to create Supabase client')
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return new Response('Team ID is required', { status: 400 })
    }

    console.log('Fetching custom constraints for team:', teamId)

    // Get custom constraints for the team
    const { data, error } = await supabaseService
      .from('custom_constraints')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching custom constraints:', error)
      return new Response(`Database error: ${error.message}`, { status: 500 })
    }

    console.log('Found custom constraints:', data)

    // Return constraints or empty array
    return Response.json(data || [])
  } catch (error) {
    console.error('Error in custom constraints GET:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { teamId, rawText } = await request.json()

    if (!teamId) {
      return new Response('Team ID is required', { status: 400 })
    }

    if (!rawText || !rawText.trim()) {
      return new Response('Raw text is required', { status: 400 })
    }

    console.log('Processing custom constraint for team:', teamId, { rawText })

    // STEP 1: Fetch real shift data from Supabase first
    console.log('Fetching real shift data for AI context...')
    const { data: shifts, error: shiftsError } = await supabaseService
      .from('shifts')
      .select('id, name, start_time, end_time, day_of_week, day_specific_times')
      .eq('team_id', teamId)
      .order('start_time', { ascending: true })

    if (shiftsError) {
      console.error('Error fetching shifts:', shiftsError)
      return new Response(`Failed to fetch shift data: ${shiftsError.message}`, { status: 500 })
    }

    if (!shifts || shifts.length === 0) {
      return new Response('No shifts found for this team. Please create shifts first before adding custom constraints.', { status: 400 })
    }

    console.log('Fetched real shifts for AI context:', shifts)

    // STEP 2: Fetch team members for additional context
    const { data: members, error: membersError } = await supabaseService
      .from('team_members')
      .select(`
        user_id,
        users!inner(
          id,
          first_name,
          last_name,
          role,
          department
        )
      `)
      .eq('team_id', teamId)

    if (membersError) {
      console.error('Error fetching team members:', membersError)
      // Continue without members - shifts are more important for constraints
    }

    console.log('Fetched team members for context:', members)
    if (members && members.length > 0) {
      console.log('Sample member structure:', JSON.stringify(members[0], null, 2))
    }

    // STEP 3: Save the raw text with pending status
    const { data: savedConstraint, error: saveError } = await supabaseService
      .from('custom_constraints')
      .insert({
        team_id: teamId,
        raw_text: rawText.trim(),
        status: 'pending'
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving custom constraint:', saveError)
      return new Response(`Database error: ${saveError.message}`, { status: 500 })
    }

    console.log('Saved raw constraint, now translating with AI using real shift data...')

    // STEP 4: AI translation with real shift data context
    try {
      // Validate that we have the minimum required data
      if (!shifts || shifts.length === 0) {
        throw new Error('No shifts available for constraint translation')
      }
      const shiftsContext = shifts.map(shift => {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const dayInfo = shift.day_of_week !== null ? ` (${dayNames[shift.day_of_week]})` : ''
        const timeInfo = shift.day_specific_times ? ' (day-specific times vary)' : ` (${shift.start_time}-${shift.end_time})`
        return `- ${shift.name}${dayInfo}${timeInfo} [ID: ${shift.id}]`
      }).join('\n')

      const membersContext = members && members.length > 0 ? members.map(member => {
        // Handle different possible data structures from Supabase
        let user = null
        if (member.users) {
          if (Array.isArray(member.users) && member.users.length > 0) {
            user = member.users[0] as Record<string, unknown>
          } else if (typeof member.users === 'object' && !Array.isArray(member.users)) {
            user = member.users as Record<string, unknown>
          }
        }
        
                 if (user && user.first_name && user.last_name) {
           return `- ${user.first_name} ${user.last_name} (${user.role || 'Unknown role'}) [User ID: ${user.id}]`
         }
         return `- Team member (ID: ${member.user_id})`
      }).join('\n') : 'No member data available'

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: `You are a constraint translator for medical shift scheduling using OR-Tools. You will receive human-written constraints and real shift data from a database. Your job is to convert the human constraints into specific, actionable rules that reference the actual shifts.

**REAL SHIFT DATA FROM DATABASE:**
${shiftsContext}

**TEAM CONTEXT:**
Team ID: ${teamId}
This constraint applies to this specific team only.

**TEAM MEMBERS DATA STRUCTURE:**
Each member has: user_id (UUID), users.id (UUID), users.first_name, users.last_name, users.role
When matching names, use users.id as member_id, not user_id or the name itself.
The users.id is globally unique across all teams, but we include team_id for context.

**TEAM MEMBERS LIST:**
${membersContext}

**HUMAN-WRITTEN CONSTRAINT:**
"${rawText.trim()}"

**TASK:**
Based on the real shift data above, translate this human constraint into a specific, actionable constraint that the OR-Tools scheduler can implement. The constraint should reference actual shift names, IDs, and times from the database.

**MONTHLY SHIFT LIMITS:**
When you see phrases like "monthly [shift name] shift limit = X" or "limited to X [shift name] shifts per month", use:
- constraint_type: "member_monthly_shift_limit"
- shift_name: [exact shift name from database]
- max_shifts: X (the limit number)

**VACATION-ADJUSTED MONTHLY CAP (TOTAL SHIFTS):**
When you see constraints about reducing EACH PARTICIPANT'S total monthly shift cap based on vacation day count, use:
- constraint_type: "vacation_adjusted_monthly_cap"
- This is a team-wide rule (do not include member_id)
- Count vacation days from availability entries where status is "vacation"
- Use upper-bound tiers with percentage reduction
- Default tiers:
  - up to 9 vacation days => 25% reduction
  - up to 16 vacation days => 50% reduction
  - up to 28 vacation days => 75% reduction

Example: "Team member 'John': monthly Night Shift limit = 1" should become:
{
  "constraint_type": "member_monthly_shift_limit",
  "parameters": {
    "member_id": "johns-uuid",
    "member_name": "John",
    "shift_name": "Night Shift",
    "max_shifts": 1
  }
}

Example: "If participant has up to 9 vacation days, reduce max days/month by 25%; up to 16 by 50%; up to 28 by 75%" should become:
{
  "constraint_type": "vacation_adjusted_monthly_cap",
  "parameters": {
    "count_status": "vacation",
    "apply_if_vacation_days_at_least": 1,
    "tiers": [
      { "max_vacation_days": 9, "reduction_percent": 25 },
      { "max_vacation_days": 16, "reduction_percent": 50 },
      { "max_vacation_days": 28, "reduction_percent": 75 }
    ]
  }
}

**MEMBER IDENTIFICATION:**
When a member name is mentioned in the constraint, find that member in the team members data and use their actual user ID (not just the name) as member_id. Use the name as member_name for display purposes.

**NAME MATCHING RULES:**
1. Look for EXACT matches first: "John Smith" → find user with first_name="John" AND last_name="Smith"
2. Look for PARTIAL matches: "John" → find user with first_name="John" (ignore last_name)
3. Look for CASE-INSENSITIVE matches: "john" should match "John"
4. If multiple matches found, use the first one
5. If no match found, use "unknown_user" as member_id and include the name in member_name
6. ALWAYS use the actual user.id (UUID) as member_id, never use the name as ID

**REQUIRED OUTPUT FORMAT:**
Return ONLY valid JSON with these EXACT fields. Do not include any text before or after the JSON:

{

{
  "constraint_type": "one of: consecutive_shift_restriction, shift_transition_restriction, workers_per_shift, max_consecutive_days, shift_preference, shift_rotation, workload_distribution, shift_specific_rule, member_shift_restriction, member_monthly_shift_limit, vacation_adjusted_monthly_cap",
  "parameters": {
    // For consecutive_shift_restriction:
    "shift_identifiers": {
      "names": ["Night Shift", "Evening"], // Exact shift names from database
    },
         "max_consecutive": 0, // Maximum consecutive shifts allowed (0 = no consecutive, 1 = max 1 consecutive, etc.)
     
     // SEMANTIC LOGIC FOR max_consecutive:
     // - "No consecutive" = max_consecutive: 0 (0 consecutive allowed)
     // - "No more than 1 consecutive" = max_consecutive: 1 (1 consecutive allowed, not 2)
     // - "No more than 2 consecutive" = max_consecutive: 2 (2 consecutive allowed, not 3)
     // - "Maximum 3 consecutive" = max_consecutive: 3 (3 consecutive allowed)
    
    // For shift_transition_restriction:
    "forbidden_transitions": [
      {
        "from_shift_id": "uuid1", // ID of the shift that cannot be followed
        "from_shift_name": "Night Shift", // Name of the shift that cannot be followed
        "to_shift_id": "uuid2", // ID of the shift that cannot come after
        "to_shift_name": "Day Shift" // Name of the shift that cannot come after
      }
    ],
    
    // For workers_per_shift:
    "shift_id": "uuid", // Specific shift ID
    "shift_name": "Night Shift", // Specific shift name
    "min_workers": 2,
    "max_workers": 3,
    
    // For shift_preference:
    "preferred_shift_ids": ["uuid1", "uuid2"],
    "preferred_shift_names": ["Day Shift", "Morning"],
    "avoided_shift_ids": ["uuid3"],
    "avoided_shift_names": ["Night Shift"],
    
    // For shift_rotation:
    "rotation_shift_ids": ["uuid1", "uuid2", "uuid3"],
    "rotation_shift_names": ["Day", "Evening", "Night"],
    "rotation_pattern": "weekly|monthly|custom",
    
    // For workload_distribution:
    "target_shift_ids": ["uuid1", "uuid2"],
    "target_shift_names": ["Day Shift", "Evening"],
    "distribution_type": "even|weighted|preference_based",
    
    // For member_shift_restriction:
    "member_id": "uuid", // Specific member's user ID
    "member_name": "John Doe", // Member's name
    "allowed_shift_ids": ["uuid1", "uuid2"], // Only these shifts allowed for this member
    "allowed_shift_names": ["Night Shift", "Friday Night"],
    "allowed_days": [5], // Days of week (0=Sunday, 1=Monday, etc.)
    "restriction_type": "exclusive|preferred", // exclusive = only these, preferred = prefer these
    
    // For member_monthly_shift_limit:
    "member_id": "uuid", // Specific member's user ID
    "member_name": "John Doe", // Member's name
    "shift_name": "Night Shift", // Exact shift name from database
    "max_shifts": 1 // Maximum number of this shift type per month

    // For vacation_adjusted_monthly_cap (team-wide total monthly cap adjustment):
    "count_status": "vacation", // availability status used to count vacation days
    "apply_if_vacation_days_at_least": 1, // apply only when member has at least this many vacation days
    "tiers": [
      { "max_vacation_days": 9, "reduction_percent": 25 },
      { "max_vacation_days": 16, "reduction_percent": 50 },
      { "max_vacation_days": 28, "reduction_percent": 75 }
    ]
  },
     "description": "Human-readable description of the constraint",
   "priority": "high|medium|low",
   "team_id": "${teamId}", // Team this constraint applies to
   "applies_to_shifts": ["uuid1", "uuid2"], // All shift IDs this constraint affects
   "applies_to_shift_names": ["Night Shift", "Evening"] // All shift names this constraint affects
}

**CRITICAL**: Return ONLY the JSON object above, no additional text, explanations, or markdown formatting.

**IMPORTANT RULES:**
1. Use ONLY the actual shift IDs and names from the database
2. Make the constraint specific and actionable
3. If the human constraint mentions "night shifts" but there's no shift named "Night Shift", identify the closest match (e.g., shifts ending after 22:00)
4. If the constraint can't be implemented with the available shifts, explain why in the description
5. Return ONLY valid JSON, no additional text or explanation
6. For member constraints, use the actual user ID from the team members data, not just the name

**EXAMPLES:**
- Human: "No consecutive night shifts" → constraint_type: "consecutive_shift_restriction" with shift_identifiers: {"names": ["Night Shift"]}, applies_to_shifts: ["8feaf948-1b3e-4238-af56-34429f252a80"], max_consecutive: 0
- Human: "No more than 1 consecutive night shift" → constraint_type: "consecutive_shift_restriction" with shift_identifiers: {"names": ["Night Shift"]}, applies_to_shifts: ["8feaf948-1b3e-4238-af56-34429f252a80"], max_consecutive: 1 (1 consecutive allowed, not 2)
- Human: "Maximum 2 night shifts in a row" → constraint_type: "consecutive_shift_restriction" with shift_identifiers: {"names": ["Night Shift"]}, applies_to_shifts: ["8feaf948-1b3e-4238-af56-34429f252a80"], max_consecutive: 2 (2 consecutive allowed, not 3)
- Human: "Maximum 3 night shifts in a row" → constraint_type: "consecutive_shift_restriction" with shift_identifiers: {"names": ["Night Shift"]}, applies_to_shifts: ["8feaf948-1b3e-4238-af56-34429f252a80"], max_consecutive: 3 (3 consecutive allowed)
- Human: "No day shift assignments on the next day right after night shift for the same worker" → constraint_type: "shift_transition_restriction" with forbidden_transitions: [{"from_shift_id": "8feaf948-1b3e-4238-af56-34429f252a80", "from_shift_name": "Night Shift", "to_shift_id": "203bd551-6c83-4f57-bf30-b7235103e696", "to_shift_name": "Day Shift"}]
- Human: "Member 'Erika' only Friday night shifts" → constraint_type: "member_shift_restriction" with member_id: "550e8400-e29b-41d4-a716-446655440000", member_name: "Erika", allowed_days: [5], restriction_type: "exclusive"
- Human: "John prefers day shifts" → constraint_type: "member_shift_restriction" with member_id: "550e8400-e29b-41d4-a716-446655440001", member_name: "John", restriction_type: "preferred"
- Human: "Need 3 people on busy shifts" → constraint_type: "workers_per_shift" with specific busy shift IDs
- Human: "Prefer day shifts over night shifts" → constraint_type: "shift_preference" with specific day/night shift IDs
- Human: "Vacation-adjusted monthly cap: up to 9 vacation days => -25%; up to 16 => -50%; up to 28 => -75%" → constraint_type: "vacation_adjusted_monthly_cap" with the tier structure shown above

**CRITICAL SEMANTIC LOGIC FOR max_consecutive:**
The max_consecutive value represents the MAXIMUM number of consecutive shifts ALLOWED.

- Human: "No consecutive" → max_consecutive: 0 (0 consecutive allowed)
- Human: "No more than 1 consecutive" → max_consecutive: 1 (1 consecutive allowed) 
- Human: "Maximum 2 consecutive" → max_consecutive: 2 (2 consecutive allowed)
- Human: "Maximum 3 consecutive" → max_consecutive: 3 (3 consecutive allowed)
- Human: "Maximum 4 consecutive" → max_consecutive: 4 (4 consecutive allowed)

**FORMULA:** If human says "Maximum X consecutive", then max_consecutive = X
**FORMULA:** If human says "No more than X consecutive", then max_consecutive = X
**FORMULA:** If human says "No consecutive", then max_consecutive = 0

**IMPORTANT**: max_consecutive applies ONLY to the specific shifts identified by applies_to_shifts and shift_identifiers.names, not to all shifts.
**IMPORTANT**: ALWAYS include applies_to_shifts with the exact shift IDs from the database for reliable constraint application.
**IMPORTANT**: For shift_transition_restriction, use forbidden_transitions with exact shift IDs from the database.
**IMPORTANT**: For member constraints, use member_shift_restriction and include member_id/member_name.
**IMPORTANT**: When a member name is mentioned (e.g., "Erika", "John"), find their actual user ID from the team members data and use that as member_id. Use the name as member_name for display.
**IMPORTANT**: For team-wide vacation-based reduction of max monthly shifts, use vacation_adjusted_monthly_cap (not member_monthly_shift_limit).
**CRITICAL**: member_id must be the actual UUID from users.id, NEVER use the person's name as the ID.
**CRITICAL**: Use shift IDs (applies_to_shifts) as the primary method for identifying shifts, with exact names as fallback.
**CRITICAL**: For "A after B" patterns, use shift_transition_restriction, not consecutive_shift_restriction.`
        }],
        temperature: 0,
        max_tokens: 1000
      })

      const aiContent = aiResponse.choices[0].message.content
      if (!aiContent) {
        throw new Error('No response from AI')
      }

             // Parse AI response
       let aiTranslation
       try {
         console.log('Raw AI response:', aiContent)
         
         // Extract JSON from markdown if present
         let jsonContent = aiContent.trim()
         if (jsonContent.includes('```json')) {
           const jsonMatch = jsonContent.match(/```json\s*([\s\S]*?)\s*```/)
           if (jsonMatch && jsonMatch[1]) {
             jsonContent = jsonMatch[1].trim()
           }
         } else if (jsonContent.includes('```')) {
           const codeMatch = jsonContent.match(/```\s*([\s\S]*?)\s*```/)
           if (codeMatch && codeMatch[1]) {
             jsonContent = codeMatch[1].trim()
           }
         }
         
         console.log('Extracted JSON content:', jsonContent)
         
         // Validate JSON structure before parsing
         if (!jsonContent.startsWith('{') || !jsonContent.endsWith('}')) {
           throw new Error('AI response is not valid JSON object format')
         }
         
         aiTranslation = JSON.parse(jsonContent)
         
         // Validate required fields
         if (!aiTranslation.constraint_type) {
           throw new Error('AI response missing required field: constraint_type')
         }
         
         console.log('AI translation successful with real shift data:', aiTranslation)
       } catch (parseError) {
         console.error('Failed to parse AI response:', parseError)
         console.error('Raw AI content that failed to parse:', aiContent)
         // Save with error status
         await supabaseService
           .from('custom_constraints')
           .update({
             status: 'error',
             ai_translation: { 
               error: 'Failed to parse AI response',
               raw_ai_response: aiContent,
               parse_error: parseError instanceof Error ? parseError.message : 'Unknown parse error'
             }
           })
           .eq('id', savedConstraint.id)
         
         return new Response('Failed to parse AI translation', { status: 500 })
       }

      // STEP 5: Update the constraint with AI translation
      const { error: updateError } = await supabaseService
        .from('custom_constraints')
        .update({
          ai_translation: aiTranslation,
          status: 'translated'
        })
        .eq('id', savedConstraint.id)

      if (updateError) {
        console.error('Error updating constraint with AI translation:', updateError)
        return new Response(`Database error: ${updateError.message}`, { status: 500 })
      }

      console.log('Successfully processed custom constraint with AI translation using real shift data')

      return Response.json({ 
        message: 'Custom constraint processed successfully with real shift data',
        constraint: {
          ...savedConstraint,
          ai_translation: aiTranslation,
          status: 'translated'
        }
      })

    } catch (aiError) {
      console.error('AI translation failed:', aiError)
      
      // Update status to indicate AI failure but still save the raw constraint
      await supabaseService
        .from('custom_constraints')
        .update({
          status: 'error',
          ai_translation: { 
            error: 'AI translation failed',
            details: aiError instanceof Error ? aiError.message : 'Unknown error',
            fallback_message: 'Constraint saved but AI translation failed. You can still use this constraint manually.'
          }
        })
        .eq('id', savedConstraint.id)

      // Return success but with warning - the constraint is saved, just not AI-translated
      return Response.json({ 
        message: 'Custom constraint saved but AI translation failed',
        constraint: {
          ...savedConstraint,
          status: 'error',
          ai_translation: { 
            error: 'AI translation failed',
            details: aiError instanceof Error ? aiError.message : 'Unknown error'
          }
        },
        warning: 'The constraint was saved but could not be automatically translated by AI. You may need to review it manually.'
      })
    }

  } catch (error) {
    console.error('Error in custom constraints POST:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
