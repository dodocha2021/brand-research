import { NextRequest, NextResponse } from 'next/server'

// === Environment Variables ===
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID!
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY!

// === Region Mapping ===
const REGION_CODES: { [key: string]: string[] } = {
  'North America': ['US', 'CA'],
  'Europe': ['GB', 'DE', 'FR', 'IT', 'ES', 'NL'],
  'Asia-Pacific': ['JP', 'KR', 'CN', 'SG', 'AU', 'IN'],
  'Latin America': ['BR', 'MX', 'AR', 'CO', 'CL'],
  'Middle East & Africa': ['AE', 'SA', 'ZA', 'EG', 'IL'],
  'Global': []
}

// === Step 1 - Google Search Function ===
async function googleSearch(query: string, region: string): Promise<any[]> {
  console.log('\n=== Google Search Parameters ===')
  console.log('Query:', query)
  console.log('Region:', region)
  
  const url = "https://www.googleapis.com/customsearch/v1"
  const params = new URLSearchParams({
    key: GOOGLE_API_KEY,
    cx: SEARCH_ENGINE_ID,
    q: query,
    num: '10',
    safe: 'off'
  })

  // 区域限制
  if (region !== 'Global' && REGION_CODES[region]) {
    const countryCodes = REGION_CODES[region].map(code => `country${code}`).join('|')
    params.append('cr', countryCodes)
    console.log('Region Filter:', countryCodes)
  }

  const fullUrl = `${url}?${params}`
  console.log('Full API URL:', fullUrl)

  try {
    const res = await fetch(fullUrl)
    if (!res.ok) {
      const errorText = await res.text()
      console.error('Google API Response:', errorText)
      throw new Error(`Google API error: ${res.status}`)
    }
    const json = await res.json()
    
    console.log('\n=== Search Results ===')
    if (json.items && json.items.length > 0) {
      json.items.forEach((item: any, index: number) => {
        console.log(`\nResult ${index + 1}:`)
        console.log('Title:', item.title)
        console.log('URL:', item.link)
        console.log('Snippet:', item.snippet)
        console.log('---')
      })
    } else {
      console.log('No results found')
      console.log('Full API response:', JSON.stringify(json, null, 2))
    }
    
    return json.items || []
  } catch (e) {
    console.error('Google Search error:', e)
    return []
  }
}

// === Step 2 - AI Analysis Function ===
async function extractBestLink(results: any[], query: string, platform: string, region: string, aiModel: string): Promise<string> {
  console.log(`Analyzing ${results.length} search results for region: ${region}...`)

  const context = results.map((item, index) => 
    `Result ${index + 1}:\nTitle: ${item.title}\nLink: ${item.link}\nSnippet: ${item.snippet}`
  ).join('\n\n')

  const systemPrompt = `You are a URL extractor specialized in identifying brand social media accounts.
Rules for identifying OFFICIAL accounts (must meet at least 2 of these criteria):
1. Has verification badge or indicators of being official
2. Username/handle matches or relates to the brand name
3. Profile description or content suggests it's an official channel
4. Has significant follower count or engagement
5. Content appears professional and brand-related

Response Rules:
1. If you find an account matching multiple criteria above, return its URL
2. If completely uncertain about authenticity, return empty string
3. If multiple accounts found, prefer the one with more verification signals
4. Return ONLY the URL or empty string, no other text`

  const userPrompt = `Brand: ${query.split(' ')[0]}
Platform: ${platform}
Region: ${region}

Analyze these search results and return the most likely official account URL.
If you cannot determine authenticity with reasonable confidence, return an empty string.
ONLY return the URL or empty string, nothing else.

Search Results:
${context}`

  try {
    console.log(`Calling ${aiModel} API...`)
    let res;
    let data;

    if (aiModel === 'claude') {
      // Claude API调用
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-7-sonnet-20250219',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: systemPrompt + '\n\n' + userPrompt
            }
          ]
        })
      })
    } else {
      // GPT API调用
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature: 0.1
        })
      })
    }

    if (!res.ok) {
      console.error(`${aiModel} API error:`, res.status)
      return ''
    }

    data = await res.json()
    let result = aiModel === 'claude' ? data.content[0].text.trim() : data?.choices?.[0]?.message?.content?.trim() || ''
    
    // 确保结果只包含URL或空字符串
    if (result && !result.startsWith('http')) {
      result = ''
    }
    
    console.log(`${aiModel} result:`, result)
    return result
  } catch (e) {
    console.error(`${aiModel} API error:`, e)
    return ''
  }
}

// === API Route Handler ===
export async function POST(req: NextRequest) {
  try {
    // aiModel 默认值为 'gpt'
    const { brand, platform, region, aiModel = 'gpt' } = await req.json()

    // Check required parameters
    if (!brand || !platform || !region) {
      throw new Error('Missing required parameters')
    }

    // Check environment variables
    if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID || !OPENAI_API_KEY || !CLAUDE_API_KEY) {
      throw new Error('Missing required environment variables')
    }

    // 添加域名映射
    const domain = platform === 'twitter' ? '(twitter.com OR x.com)' : `${platform}.com`

    // 构建搜索查询，移除查询字符串中的地区信息
    const query = `${brand} official ${platform} site:${domain}`
    console.log('Search query:', query)

    // Step 1: Google Search
    console.log('Starting Google Search...')
    const searchResults = await googleSearch(query, region)
    console.log('Search results count:', searchResults.length)

    // Step 2: AI Analysis
    console.log('Starting AI Analysis...')
    const url = await extractBestLink(searchResults, query, platform, region, aiModel)

    console.log('✅ Process completed. URL:', url)
    return NextResponse.json({ 
      success: true,
      url,
      searchResults
    })
  } catch (e: any) {
    console.error('❌ API Error:', e)
    return NextResponse.json({ 
      success: false, 
      error: e.message || 'Unknown error',
      url: ''
    }, { status: 500 })
  }
}