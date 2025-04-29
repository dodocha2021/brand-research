// app/api/openai/route.ts
import { NextRequest, NextResponse } from 'next/server'

type Message = {
  role: string
  content: string
  model?: string
  [key: string]: any
}

type ModelConfig = {
  max_tokens?: number
}

type ModelConfigs = {
  [key: string]: ModelConfig
}

const MODEL_CONFIGS: ModelConfigs = {
  'gpt-4o': {
    max_tokens: 2048
  },
  'gpt-4o-mini-search-preview': {
    max_tokens: 2000
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API Key not configured' }, { status: 500 })
  }

  try {
    const { messages, model = 'gpt-4o' }: { messages: Message[], model?: string } = await req.json()
    
    const modelConfig = MODEL_CONFIGS[model] || MODEL_CONFIGS['gpt-4o']
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: messages.map(({ model: _, ...msg }) => msg),
        ...modelConfig
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('OpenAI API error response:', error)
      throw new Error(error.error?.message || 'OpenAI API request failed')
    }

    const data = await response.json()
    if (!data.choices?.[0]?.message) {
      console.error('Unexpected OpenAI response:', data)
      throw new Error('Invalid response from OpenAI')
    }

    return NextResponse.json({
      choices: [{
        message: {
          content: data.choices[0].message.content
        }
      }]
    })
  } catch (error) {
    console.error('OpenAI API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate content' },
      { status: 500 }
    )
  }
}