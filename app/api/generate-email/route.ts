import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const { template, model, data } = await req.json()
    const headersList = headers()
    const protocol = headersList.get('x-forwarded-proto') || 'http'
    const host = headersList.get('host') || 'localhost:3000'
    const baseUrl = `${protocol}://${host}`

    // 替换模板中的变量
    let processedTemplate = template
      .replace('{{targetBrandName}}', data.targetBrandName)
      .replace('{{contactName}}', data.contactName || '')

    // 添加 JSON 数据到模板
    processedTemplate = `${processedTemplate}\n\nJSON Data:\n${JSON.stringify(data.jsonData, null, 2)}`

    if (model === 'claude-3-sonnet-20240229') {
      const response = await fetch(`${baseUrl}/api/anthropic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: processedTemplate
          }]
        })
      })

      const data = await response.json()
      return NextResponse.json({ content: data.choices[0].message.content })

    } else if (model === 'gpt-4') {
      const response = await fetch(`${baseUrl}/api/openai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4',
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: processedTemplate
          }]
        })
      })

      const data = await response.json()
      return NextResponse.json({ content: data.choices[0].message.content })
    }

    return NextResponse.json(
      { error: 'Invalid model specified' },
      { status: 400 }
    )

  } catch (error) {
    console.error('Email generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate email' },
      { status: 500 }
    )
  }
} 