import { NextRequest, NextResponse } from 'next/server'
import * as gpt4oSearchModule from '../gpt4o_search/route'

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
      const requestBody: any = {
        model: 'gpt-4o-search-preview-2025-03-11',
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
        max_tokens: 2000,
        response_format: {
          type: "text"
        },
        web_search_options: {
          user_location: {
            type: "approximate",
            approximate: {
              country: ""
            }
          }
        }
      }
      
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`${aiModel} API error:`, res.status);
      console.error(`Error details:`, errorText);
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

// === 新增：使用OpenAI进行二次搜索 ===
async function searchWithOpenAI(query: string, platform: string, searchResults: any[]): Promise<string> {
  console.log('\n===== OPENAI BACKUP SEARCH =====')
  
  // 第一步: 使用gpt-4o-search-preview-2025-03-11进行网络搜索
  try {
    console.log('Step 1: Searching with gpt-4o-search-preview-2025-03-11...')
    const searchSystemPrompt = `You are a professional social media URL finder specialized in identifying official brand accounts.
You can search the web to find official brand accounts.
Your task is to find potential official account URLs for the specified brand on the specified platform.

Rules for identifying OFFICIAL accounts:
1. Has verification badge or indicators of being official
2. Username/handle matches or relates to the brand name
3. Profile description or content suggests it's an official channel
4. Has significant follower count or engagement
5. Content appears professional and brand-related

Response Rules:
1. Search the web to find likely official accounts
2. Return up to 3 most likely URLs, each on a new line
3. Do not provide any explanations or additional text
4. If you cannot find any official accounts, return an empty string`

    const searchUserPrompt = `Brand: ${query.split(' ')[0]}
Platform: ${platform}

Find the most likely official account URLs for this brand on ${platform}.
Search the web to verify information and check account authenticity.
Return ONLY the URLs (maximum 3), each on a new line, with no explanations.`
    
    const searchRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-search-preview-2025-03-11',
        messages: [
          {
            role: 'system',
            content: searchSystemPrompt
          },
          {
            role: 'user',
            content: searchUserPrompt
          }
        ],
        max_tokens: 2000
      })
    })

    if (!searchRes.ok) {
      const errorText = await searchRes.text();
      console.error('GPT-4o-search-preview API error:', searchRes.status);
      console.error('Error details:', errorText);
      return ''
    }
    
    const searchData = await searchRes.json()
    const miniResults = searchData?.choices?.[0]?.message?.content?.trim() || ''
    
    console.log('URLs found by gpt-4o-search-preview:')
    console.log(miniResults)
    
    // 提取Google搜索结果中的URL
    const googleURLs = searchResults
      .map((item: any) => item.link)
      .filter((url: string) => url.includes(`${platform}.com`))
      .slice(0, 5)  // 最多取5个URL
    
    console.log('URLs from Google search:')
    console.log(googleURLs)
    
    // 合并两种来源的URL
    let allURLs: string[] = []
    
    // 添加GPT-4o-search-preview找到的URL
    if (miniResults && miniResults !== "No URLs found") {
      const miniURLs = miniResults.split('\n').filter((url: string) => url.trim() && url.startsWith('http'))
      allURLs = [...miniURLs]
    }
    
    // 添加Google搜索结果中的URL (确保不重复)
    googleURLs.forEach((url: string) => {
      if (!allURLs.includes(url)) {
        allURLs.push(url)
      }
    })
    
    console.log('Combined URLs for verification:')
    console.log(allURLs)
    
    // 如果没有找到任何URL，返回空字符串
    if (allURLs.length === 0) {
      console.log('No URLs found from either source')
      return ''
    }
    
    // 第二步: 再次使用gpt-4o-search-preview-2025-03-11验证和选择最佳URL
    console.log('Step 2: Verifying URLs with gpt-4o-search-preview-2025-03-11...')
    const verifySystemPrompt = `You are a professional social media URL verification expert.
Your task is to verify which ONE of the provided URLs is most likely to be the official account for the specified brand.

Rules for identifying OFFICIAL accounts (must meet at least 2 of these criteria):
1. Has verification badge or indicators of being official
2. Username/handle matches or relates to the brand name
3. Profile description or content suggests it's an official channel
4. Has significant follower count or engagement
5. Content appears professional and brand-related

Response Rules:
1. Visit each URL and verify its authenticity
2. Search the web for additional information if needed
3. Return ONLY the single most credible URL, with no explanatory text
4. If none of the URLs seem authentic, return an empty string`

    const verifyUserPrompt = `Brand: ${query.split(' ')[0]}
Platform: ${platform}

Analyze these potential URLs and determine which ONE is most likely to be the official account.
Visit each URL to check its authenticity and credentials.
Return ONLY the single most likely official URL or empty string, nothing else.

Potential URLs:
${allURLs.join('\n')}`
    
    const verifyRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-search-preview-2025-03-11',
        messages: [
          {
            role: 'system',
            content: verifySystemPrompt
          },
          {
            role: 'user',
            content: verifyUserPrompt
          }
        ],
        max_tokens: 2000
      })
    })

    if (!verifyRes.ok) {
      const errorText = await verifyRes.text();
      console.error('GPT-4o-search-preview verification API error:', verifyRes.status);
      console.error('Error details:', errorText);
      return ''
    }
    
    const verifyData = await verifyRes.json()
    let finalResult = verifyData?.choices?.[0]?.message?.content?.trim() || ''
    
    // 确保结果只包含URL
    if (finalResult && !finalResult.startsWith('http')) {
      finalResult = ''
    }
    
    console.log('Final verified URL:', finalResult)
    return finalResult
  } catch (e) {
    console.error('OpenAI backup search error:', e)
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

    // ===== 启动两个并行搜索 =====
    console.log('\n===== STARTING PARALLEL SEARCHES =====')
    
    // 1. 启动GPT-4o搜索 (异步)
    console.log('\n----- STARTING GPT-4O-SEARCH -----')
    const miniSearchPromise = searchWithMini(brand, platform)
    
    // 2. 同时启动Google+GPT搜索 (原有逻辑)
    console.log('\n----- STARTING GOOGLE+GPT SEARCH -----')
    
    // 定义所有区域
    const allRegions = ['Global', 'North America', 'Europe', 'Asia-Pacific', 'Latin America', 'Middle East & Africa']
    
    // 外循环：Google搜索区域（只尝试用户区域和Global）
    const searchRegions = []
    
    // 将用户选择的区域放在第一位
    searchRegions.push(region)
    
    // 如果用户没选Global，将Global作为第二选择
    if (region !== 'Global') {
      searchRegions.push('Global')
    }
    
    // 开始Google+GPT搜索
    let url = '';
    let finalSearchResults = [];
    let found = false;
    
    // 创建分析区域顺序，将用户选择的区域放在最前面
    const analysisRegions = [...allRegions]; // 复制数组
    // 如果用户选择的不是Global，则先移除用户区域再将其插入到最前面
    if (region !== 'Global') {
      const index = analysisRegions.indexOf(region);
      if (index > -1) {
        analysisRegions.splice(index, 1);
      }
      analysisRegions.unshift(region);
    }

    // 外循环：Google搜索不同区域
    for (const searchRegion of searchRegions) {
      if (found) break; // 如果已找到URL，跳出循环
      
      console.log(`\n===== GOOGLE SEARCH: Region "${searchRegion}" =====`)
      
      // 执行Google搜索
      const searchResults = await googleSearch(query, searchRegion)
      console.log(`Google search returned ${searchResults.length} results`)
      
      // 保存最后一次搜索结果
      finalSearchResults = searchResults
      
      // 如果没有搜索结果，尝试下一个搜索区域
      if (searchResults.length === 0) {
        console.log('No search results for this region, trying next search region...')
        continue
      }
      
      // 内循环：AI分析不同区域
      for (const analysisRegion of analysisRegions) {
        if (found) break; // 如果已找到URL，跳出循环
        
        console.log(`\n----- AI ANALYSIS: Region "${analysisRegion}" -----`)
        console.log(`Analyzing ${searchResults.length} results from search region "${searchRegion}"`)
        console.log(`Using AI model: ${aiModel}, Analysis region: ${analysisRegion}`)
        
        // 执行AI分析
        url = await extractBestLink(searchResults, query, platform, analysisRegion, aiModel)
        
        // 如果找到URL，标记并跳出循环
        if (url) {
          console.log(`✅ FOUND URL using search region "${searchRegion}" and analysis region "${analysisRegion}": ${url}`)
          found = true
          break
        } else {
          console.log(`No URL found with analysis region "${analysisRegion}", trying next analysis region...`)
        }
      }
    }

    // ===== 等待两个搜索都完成 =====
    console.log('\n===== WAITING FOR ALL SEARCHES TO COMPLETE =====')
    
    // 等待GPT-4o搜索完成
    const miniURLs = await miniSearchPromise
    console.log('GPT-4o search completed')
    
    // 仅使用Google+GPT搜索找到的URL，不从搜索结果中提取额外URL
    const googleURLs = url ? [url] : [];

    console.log('\n===== URL SEARCH RESULTS =====')
    console.log('URL from Google+GPT search:')
    console.log(googleURLs)
    console.log('URLs from GPT-4o search:')
    console.log(miniURLs)

    // 合并两种来源的URL
    let allURLs: string[] = []

    // 添加找到的所有URL (去重)
    const addUniqueURLs = (urls: string[]) => {
      urls.forEach((url: string) => {
        if (url && url.startsWith('http') && !allURLs.includes(url)) {
          allURLs.push(url)
        }
      })
    }

    addUniqueURLs(miniURLs)
    addUniqueURLs(googleURLs)

    console.log('\n===== COMBINED URLS FOR VERIFICATION =====')
    console.log(allURLs)

    // 如果有URL可供验证，执行最终验证
    let finalURL = ''
    if (allURLs.length > 0) {
      console.log('\n===== STARTING FINAL VERIFICATION =====')
      finalURL = await verifyBestURL(brand, platform, allURLs)
      
      if (finalURL) {
        console.log(`✅ FINAL VERIFICATION SUCCESSFUL: ${finalURL}`)
      } else {
        console.log('❌ FINAL VERIFICATION FOUND NO VALID URL')
      }
    } else {
      console.log('❌ NO URLS FOUND FOR VERIFICATION')
      // 没有URL可供验证，直接返回空字符串
      finalURL = ''
    }

    console.log(`\n===== FINAL RESULT =====`)
    console.log(`URL found: ${finalURL ? 'YES' : 'NO'}`)
    console.log(`Final URL: ${finalURL || 'No valid URL found'}`)
    
    return NextResponse.json({ 
      success: true,
      url: finalURL,
      searchResults: finalSearchResults
    })
  } catch (e: any) {
    console.error('❌ API Error:', e)
    let errorMessage = e.message || 'Unknown error';
    
    // 捕获更详细的错误信息
    if (e.response) {
      try {
        const errorData = await e.response.json();
        console.error('API Error Response:', JSON.stringify(errorData, null, 2));
        errorMessage = errorData.error?.message || errorMessage;
      } catch (jsonError) {
        console.error('Error parsing error response:', jsonError);
      }
    }
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage,
      url: ''
    }, { status: 500 })
  }
}

// === 独立的GPT-4o搜索函数 ===
async function searchWithMini(brand: string, platform: string): Promise<string[]> {
  console.log('Starting GPT-4o search via API function...')
  
  try {
    // 直接调用集成API的处理函数而不是通过HTTP请求
    const requestBody = {
      query: brand,
      task: 'social_accounts' as const,
      platform,
      region: 'Global',
      options: {
        maxResults: 3
      }
    };
    
    // 构造一个简化的NextRequest对象
    const mockRequest = {
      json: async () => requestBody
    } as NextRequest;

    // 直接调用gpt4o_search的POST函数
    const response = await gpt4oSearchModule.POST(mockRequest);
    
    // 解析JSON响应
    const responseData = await response.json();
    
    if (!responseData.success) {
      console.error('GPT-4o search API returned error:', responseData.error);
      return []
    }
    
    const urls = responseData.results || [];
    
    console.log('URLs found by GPT-4o-search:');
    console.log(urls);
    
    return urls;
  } catch (e) {
    console.error('GPT-4o search error:', e);
    return []
  }
}

// === 最终URL验证函数 ===
async function verifyBestURL(brand: string, platform: string, urls: string[]): Promise<string> {
  console.log('Verifying best URL via API function...');
  
  // 如果没有URL可供验证，直接返回空字符串
  if (!urls || urls.length === 0) {
    console.log('No URLs to verify');
    return '';
  }
  
  try {
    // 直接调用集成API的处理函数而不是通过HTTP请求
    const requestBody = {
      query: brand,
      task: 'verify_urls' as const, // 使用专门的URL验证任务
      platform,
      region: 'Global',
      options: {
        candidateUrls: urls // 传递候选URL列表给API
      }
    };
    
    // 构造一个简化的NextRequest对象
    const mockRequest = {
      json: async () => requestBody
    } as NextRequest;

    // 直接调用gpt4o_search的POST函数
    const response = await gpt4oSearchModule.POST(mockRequest);
    
    // 解析JSON响应
    const responseData = await response.json();
    
    if (!responseData.success) {
      console.error('URL verification API returned error:', responseData.error);
      return '';
    }
    
    // 应该只有一个或零个结果
    const finalResult = responseData.results && responseData.results.length > 0 ? 
      responseData.results[0] : '';
    
    console.log('Verification result from API:', finalResult);
    return finalResult;
  } catch (e) {
    console.error('URL verification error:', e);
    return '';
  }
}