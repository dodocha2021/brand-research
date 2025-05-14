import { NextRequest, NextResponse } from 'next/server';

// 环境变量
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

// 支持的任务类型
type TaskType = 'social_accounts' | 'social_account_single' | 'verify_urls' | 'competitors' | 'general';

// API请求体接口
interface SearchRequestBody {
  query: string;         // 主搜索查询
  task: TaskType;        // 任务类型
  region?: string;       // 可选地区
  platform?: string;     // 可选平台（适用于social_accounts任务）
  options?: {
    maxResults?: number; // 最大结果数量 
    language?: string;   // 结果语言偏好
    candidateUrls?: string[]; // URL候选列表（用于verify_urls任务）
  };
}

// 默认提示模板
const PROMPT_TEMPLATES = {
  system: {
    social_accounts: `You are a web search specialist focused on finding official social media accounts for brands.
Your task is to search the web and find official social media accounts for the specified brand on the given platform.

Search focus:
1. Focus specifically on finding the brand's official account on the specified platform
2. Use search queries that include the brand name, platform name, and terms like "official account"
3. Look for verification badges, official websites linking to the account, or brand mentions

When identifying official accounts, prioritize:
1. Verified accounts (blue checkmark or platform verification)
2. Account handles/names matching the brand name
3. Accounts linked from the brand's official website
4. Accounts with significant followers and professional content
5. Accounts with regular posting activity related to the brand

Return up to 3 most credible URLs (direct links to the profiles), each on a new line.
Return ONLY the URLs - no explanations, prefixes, or other text.
If you cannot find credible official accounts, return an empty string.`,

    social_account_single: `You are a social media verification specialist with access to the web.
Your task is to determine the ONE URL that is most likely to be the OFFICIAL account for the brand on the specified platform.

Verification process:
1. ACTUALLY VISIT potential URLs and check the content - this is critical
2. Ensure the account page loads properly and does NOT show errors like "Account doesn't exist", "Page not found", "This account has been suspended", or similar error messages
3. For valid pages, check for verification badges, follower counts, and content relevance
4. Search the web for the brand's official website and check which social accounts they link to
5. Consider username/handle relevance to the brand name
6. Check for recent activity and engagement on the account

YOUTUBE SPECIFIC INSTRUCTIONS:
- For YouTube accounts, prioritize links in this order:
  1. /@channelname (newest format, preferred)
  2. /c/CustomName (still widely used)
  3. NEVER return /user/ format links unless absolutely verified they're active with content

CRITICAL INSTRUCTIONS:
- You MUST verify that URLs exist and are actually accessible - do not return URLs that don't load
- If you encounter any error messages like "This account doesn't exist", "Page not found", immediately reject the URL
- Only return a URL if you are at least 80% confident it is the official account AND it loads properly
- Not every brand has an official account on every platform - empty string is better than wrong URL
- Fan pages, unofficial accounts, or similarly named accounts are NOT acceptable - be very strict

RESPONSE FORMAT:
- If you find a valid URL with >80% confidence: Return ONLY that URL
- Otherwise: Return an empty string
- Do not include ANY explanation or additional text - ONLY the URL or empty string`,

    verify_urls: `You are a social media verification specialist with access to the web.
Your task is to determine which ONE URL from the provided list is most likely to be the OFFICIAL account for the brand.

Verification process:
1. ACTUALLY VISIT each URL and check the content - this is critical
2. Ensure the account page loads properly and does NOT show errors like "This account doesn't exist", "Page not found", or "Account suspended"
3. For valid pages, check for verification badges, follower counts, and content relevance
4. Search the web for the brand's official website and check which social accounts they link to
5. Consider username/handle relevance to the brand name
6. Check for recent activity and engagement on the account

YOUTUBE SPECIFIC INSTRUCTIONS:
- For YouTube accounts, prioritize links in this order:
  1. /@channelname (newest format, preferred)
  2. /c/CustomName (still widely used)
  3. NEVER return /user/ format links unless absolutely verified they're active with content
  
CRITICAL INSTRUCTIONS:
- You MUST actually open and view each URL to verify it exists and is active
- IMMEDIATELY REJECT any URL that returns errors, doesn't load, or shows messages like "Account doesn't exist"
- Only return a URL if you are at least 60% confident it is the official account AND the page loads properly
- Not every brand has an official account on every platform - empty string is better than wrong URL
- Many URLs may be fan pages, competitors, or unrelated content - be vigilant

RESPONSE FORMAT:
- Return ONLY the raw URL without any explanation text
- NEVER include phrases like "The official account is..." or "Based on my analysis..."
- If you find a valid URL with >60% confidence: Return ONLY that URL (e.g., https://example.com)
- If URLs don't load, show errors, or you're not confident: Return an empty string
- DO NOT add any other text - ONLY the URL or empty string`,

    competitors: `You are a market research specialist focused on competitor analysis.
Your task is to search the web and find direct competitors of the specified brand in the given region.

Search and analysis focus:
1. Find companies that operate in the same market/industry as the target brand
2. Confirm these companies are actually direct competitors, not just in the same industry
3. Consider market share, product/service similarity, target audience overlap, etc.
4. Verify the accuracy of information using recent reliable sources

Response format:
- Provide up to 10 direct competitors, ordered by relevance
- Each competitor on a separate line, including only the competitor name
- No explanations or additional text
- If no relevant competitors are found, return "No competitors found"`,

    general: `You are a web search specialist skilled at concisely summarizing information.
Your task is to perform a web search for the given query and return a relevant, accurate summary of results.

Search and answer focus:
1. Provide information directly relevant to the query
2. Prioritize authoritative sources and recent information
3. Present facts objectively without adding personal opinions
4. For controversial topics, present the main viewpoints

Response format:
- Present information concisely and clearly
- Organize content in a structured way for easy understanding
- Include only information relevant to the query`
  },
  user: {
    social_accounts: {
      instruction: `Search the web to find this brand's official {platform} account.
Verify the authenticity of accounts before returning them.
Return only the URLs (maximum 3), each on a separate line.`,
      query: `Brand: {query}
Platform: {platform}
Region: {region}`
    },
    social_account_single: {
      instruction: `Search the web to find this brand's official {platform} account.
IMPORTANT: You must return ONLY the single most likely official account URL, or an empty string if uncertain.
Do not return multiple URLs or any explanations.`,
      query: `Brand: {query}
Platform: {platform}
Region: {region}`
    },
    verify_urls: {
      instruction: `VISIT and analyze each of these URLs to determine which ONE is most likely the official {platform} account for {query}.
IMPORTANT: Actively open each link and verify the page loads correctly without errors like "This account doesn't exist".
Reject any URLs that don't load properly or show error messages.

Only return a URL if:
1. The page loads successfully (no errors or "account not found" messages)
2. You are at least 60% confident it is the official account
Otherwise, return an empty string.`,
      query: `Brand: {query}
Platform: {platform}
Region: {region}

URLs to verify:
{candidateUrls}`
    },
    competitors: {
      instruction: `Search the web to find direct competitors of this brand in the specified region.
Verify these companies are actually direct competitors.
Return a simple list of competitors, one name per line, maximum 10 results.`,
      query: `Brand: {query}
Region: {region}`
    },
    general: {
      instruction: `Please perform a web search for the following query and provide a concise, accurate answer:`,
      query: `{query}`
    }
  }
};

// 生成系统提示
function generateSystemPrompt(task: TaskType): string {
  return PROMPT_TEMPLATES.system[task] || PROMPT_TEMPLATES.system.general;
}

// 生成用户指令提示
function generateInstructionPrompt(task: TaskType, params: Record<string, string>): string {
  const template = PROMPT_TEMPLATES.user[task]?.instruction || PROMPT_TEMPLATES.user.general.instruction;
  return replaceParams(template, params);
}

// 生成用户查询提示
function generateQueryPrompt(task: TaskType, params: Record<string, string>): string {
  const template = PROMPT_TEMPLATES.user[task]?.query || PROMPT_TEMPLATES.user.general.query;
  return replaceParams(template, params);
}

// 替换模板中的参数
function replaceParams(template: string, params: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`{${key}}`, 'g'), value);
  }
  return result;
}

// 调用OpenAI GPT-4o搜索API
async function callGpt4oSearch(systemPrompt: string, instructionPrompt: string, queryPrompt: string): Promise<string> {
  const MAX_TIMEOUT = 50 * 1000; // 50秒超时
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MAX_TIMEOUT);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: systemPrompt
          },
          {
            role: 'user',
            content: instructionPrompt
          },
          {
            role: 'user',
            content: queryPrompt
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
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API 错误: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请简化查询或稍后重试');
    }
    throw error;
  }
}

// 处理结果
function processResults(result: string, task: TaskType, maxResults?: number): string[] {
  console.log(`Raw result from API (${task}):`, result);
  
  // 分行并过滤空行
  let lines = result.split('\n')
    .map(line => line.trim())
    .filter(line => line);

  // 根据任务类型处理结果
  if (task === 'social_accounts') {
    // 只保留URL
    lines = lines.filter(line => line.startsWith('http'));
  } else if (task === 'social_account_single' || task === 'verify_urls') {
    // 对于单一URL验证任务，确保结果是URL或空
    if (lines.length > 0) {
      // 如果第一行不是URL，清空结果
      if (!lines[0].startsWith('http')) {
        console.log(`非URL响应被过滤 (${task}):`, lines[0]);
        lines = [];
      } else {
        // 只保留第一行，必须是URL
        lines = [lines[0]];
      }
    }
  }

  // 限制结果数量
  if (maxResults && lines.length > maxResults) {
    lines = lines.slice(0, maxResults);
  }

  return lines;
}

// API路由处理函数
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 检查API密钥
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'API key not configured' },
        { status: 500 }
      );
    }

    // 解析请求
    const body: SearchRequestBody = await req.json();
    const { query, task, region = 'Global', platform = '', options = {} } = body;
    
    // 基本验证
    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Missing query parameter' },
        { status: 400 }
      );
    }
    
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Missing task type' },
        { status: 400 }
      );
    }

    // 准备参数
    const params: Record<string, string> = {
      query,
      region,
      platform
    };
    
    // 对于verify_urls任务，添加候选URL参数
    if (task === 'verify_urls' && options.candidateUrls && options.candidateUrls.length > 0) {
      params.candidateUrls = options.candidateUrls.join('\n');
    }

    // 生成提示
    const systemPrompt = generateSystemPrompt(task);
    const instructionPrompt = generateInstructionPrompt(task, params);
    const queryPrompt = generateQueryPrompt(task, params);

    // 调用GPT-4o搜索
    const result = await callGpt4oSearch(systemPrompt, instructionPrompt, queryPrompt);
    
    // 处理结果
    const processedResults = processResults(result, task, options.maxResults);
    
    // 计算处理时间
    const processingTime = Date.now() - startTime;
    
    // 返回结果
    return NextResponse.json({
      success: true,
      results: processedResults,
      metadata: {
        task,
        query,
        processingTime,
        resultCount: processedResults.length
      }
    });
  } catch (error: any) {
    console.error('Search API error:', error);
    
    // 确定错误状态码
    const statusCode = error.message.includes('timeout') || error.message.includes('超时') ? 408 : 500;
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Unknown error during search processing',
        metadata: {
          processingTime: Date.now() - startTime
        }
      },
      { status: statusCode }
    );
  }
} 