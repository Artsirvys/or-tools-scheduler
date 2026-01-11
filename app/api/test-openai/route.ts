import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const testSchema = z.object({
  message: z.string()
})

export async function GET() {
  try {
    console.log('Testing OpenAI API key...')
    
    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'OpenAI API key not found in environment variables'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log('OpenAI API key found, testing connection...')

    // Test with a simpler model first
    const result = await generateObject({
      model: openai('gpt-3.5-turbo'), // Use cheaper model for testing
      schema: testSchema,
      prompt: 'Respond with a simple test message.'
    })

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'OpenAI API key is working',
      response: result.object.message,
      model: 'gpt-3.5-turbo'
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('OpenAI test failed:', error)
    
    // Provide more detailed error information
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
      if (errorMessage.includes('401')) {
        errorMessage = 'Invalid OpenAI API key - please check your API key'
      } else if (errorMessage.includes('429')) {
        errorMessage = 'OpenAI API rate limit exceeded'
      } else if (errorMessage.includes('500')) {
        errorMessage = 'OpenAI API server error'
      } else if (errorMessage.includes('organization')) {
        errorMessage = 'OpenAI organization verification required - please verify your organization in OpenAI platform'
      }
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage,
      details: error instanceof Error ? error.stack : 'No stack trace available'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
} 