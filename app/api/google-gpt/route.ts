import { NextRequest, NextResponse } from 'next/server'

// === Environment Variables ===
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID!
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!

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

// === Step 2 - GPT Analysis Function ===
async function extractBestLink(results: any[], query: string, platform: string, region: string): Promise<string> {
  console.log(`Analyzing ${results.length} search results for region: ${region}...`)

  const context = results.map((item, index) => 
    `Result ${index + 1}:\nTitle: ${item.title}\nLink: ${item.link}\nSnippet: ${item.snippet}`
  ).join('\n\n')

  const systemPrompt = region === 'Global' 
    ? `You are a precise and cautious expert at identifying official brand social media accounts.
Your task is to analyze search results and find the main official account with the highest follower count and engagement.
Rules:
1. ONLY return a URL if you are highly confident it is the official account
2. Return an empty string if you have any doubts
3. Do not explain or add any other text
4. Verify the URL matches the platform's official domain pattern
5. Look for:
   - Verification badges
   - High follower counts
   - High engagement rates
   - Official branding and content
   - Global/international content focus`
    : `You are a precise and cautious expert at identifying official brand social media accounts.
Your task is to analyze search results and find the official account that serves the specified region.
Rules:
1. ONLY return a URL if you are highly confident it is the official account
2. Return an empty string if you have any doubts
3. Do not explain or add any other text
4. Verify the URL matches the platform's official domain pattern
5. Look for regional relevance through:
   - Content language matching the region (e.g., Japanese/Korean/Chinese for Asia-Pacific, German/French/Italian for Europe)
   - Content focus on regional events, products, or news
   - Regional audience engagement
   - Regional marketing campaigns
   - Local partnerships and collaborations
6. The account doesn't necessarily need region indicators in its name/URL
7. Prioritize accounts that consistently post content relevant to the target region`

  const userPrompt = region === 'Global'
    ? `Search query: ${query}

Analyze these ${results.length} search results and return ONLY the main official account URL with the highest following and engagement.
If you cannot find a definitive official account, return an empty string.
Do not add any explanations or additional text.

Search Results:
${context}`
    : `Search query: ${query}
Target region: ${region}
Platform: ${platform}

Analyze these ${results.length} search results and find the official account URL that best serves the ${region} region.
Look for accounts with content and language matching the region's audience.
If you cannot find a definitive official account for this region, return an empty string.
Do not add any explanations or additional text.

Search Results:
${context}`

  try {
    console.log('Calling GPT API...')
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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

    if (!res.ok) {
      console.error('OpenAI API error:', res.status)
      return ''
    }

    const data = await res.json()
    const result = data?.choices?.[0]?.message?.content?.trim() || ''
    console.log('GPT result:', result)
    return result
  } catch (e) {
    console.error('GPT API error:', e)
    return ''
  }
}

// === API Route Handler ===
export async function POST(req: NextRequest) {
  try {
    const { brand, platform, region } = await req.json()

    // Check required parameters
    if (!brand || !platform || !region) {
      throw new Error('Missing required parameters')
    }

    // Check environment variables
    if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID || !OPENAI_API_KEY) {
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

    // Step 2: GPT Analysis
    console.log('Starting GPT Analysis...')
    const url = await extractBestLink(searchResults, query, platform, region)

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