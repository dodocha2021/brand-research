import { NextRequest, NextResponse } from 'next/server';

// Define supported platform types
type PlatformType = 'youtube' | 'linkedin' | 'instagram' | 'tiktok' | 'twitter';

// Define API request body interface
interface RequestBody {
  brand: string;
  region: string;
  platform: PlatformType;
}

const PLATFORM_PROMPTS: Record<PlatformType, string> = {
  youtube: `Please Find me the Right Youtube account for the following brand: {{Competitor}}. Make sure the social media account you find is the right one, it should be an established account with a large following. A good place to start is looking at the obvious URLs, for example for the brand Powerade, first look at youtube.com/powerade. From there a general search, for example do a search for 'powerade beverage youtube'. Output a final list of all the potentially viable social media accounts you found in URL form. DO NOT MAKE UP SOCIAL MEDIA ACCOUNTS. Make sure each URL is a full URL and not a truncated link. Make sure each URL is in the proper format (examples: https://www.youtube.com/@joerogan, https://www.youtube.com/channel/UCRHa2-Ajldj8yVUBcwtn_VQ). Lastly MAKE SURE TO VERIFY that the URL(s) you output correspond to the URLs where you found the information.`,
  
  linkedin: `Please Find me the Right LinkedIn account for the following brand: {{Competitor}}. Make sure the social media account you find is the right one, it should be an established account with a large following. A good place to start is looking at the obvious URLs, for example for the brand Powerade, first look at linkedin.com/company/powerade. From there a general search, for example do a search for 'powerade beverage linkedin'. Output a final list of all the potentially viable social media accounts you found in URL form. DO NOT MAKE UP SOCIAL MEDIA ACCOUNTS. Make sure each URL is a full URL and not a truncated link. Make sure each URL is in the proper format (example: https://www.linkedin.com/company/coca-cola/). Lastly MAKE SURE TO VERIFY that the URL(s) you output correspond to the URLs where you found the information.`,
  
  instagram: `Please Find me the Right Instagram account for the following brand: {{Competitor}}. Make sure the social media account you find is the right one, it should be an established account with a large following. A good place to start is looking at the obvious URLs, for example for the brand Powerade, first look at instagram.com/powerade. From there a general search, for example do a search for 'powerade beverage instagram'. Output a final list of all the potentially viable social media accounts you found in URL form. DO NOT MAKE UP SOCIAL MEDIA ACCOUNTS. Make sure each URL is a full URL and not a truncated link. Make sure each URL is in the proper format (example: https://www.instagram.com/cocacola/). Lastly MAKE SURE TO VERIFY that the URL(s) you output correspond to the URLs where you found the information.`,
  
  tiktok: `Please Find me the Right TikTok account for the following brand: {{Competitor}}. Make sure the social media account you find is the right one, it should be an established account with a large following. A good place to start is looking at the obvious URLs, for example for the brand Powerade, first look at tiktok.com/@powerade. From there a general search, for example do a search for 'powerade beverage tiktok'. Output a final list of all the potentially viable social media accounts you found in URL form. DO NOT MAKE UP SOCIAL MEDIA ACCOUNTS. Make sure each URL is a full URL and not a truncated link. Make sure each URL is in the proper format (example: https://www.tiktok.com/@cocacola). Lastly MAKE SURE TO VERIFY that the URL(s) you output correspond to the URLs where you found the information.`,
  
  twitter: `Please Find me the Right Twitter account for the following brand: {{Competitor}}. Make sure the social media account you find is the right one, it should be an established account with a large following. A good place to start is looking at the obvious URLs, for example for the brand Powerade, first look at twitter.com/powerade. From there a general search, for example do a search for 'powerade beverage twitter'. Output a final list of all the potentially viable social media accounts you found in URL form. DO NOT MAKE UP SOCIAL MEDIA ACCOUNTS. Make sure each URL is a full URL and not a truncated link. Make sure each URL is in the proper format (example: https://twitter.com/CocaCola). Lastly MAKE SURE TO VERIFY that the URL(s) you output correspond to the URLs where you found the information.`
};

const ANTHROPIC_VERIFY_PROMPTS: Record<PlatformType, string> = {
  youtube: `Analyze the following content and extract the most accurate YouTube URL link, which should be the official YouTube channel for the given brand in the specified region. Your answer should only contain a single URL, formatted as "https://www.youtube.com/@username" or "https://www.youtube.com/channel/channel_id". Do not add any explanations or other content, only return the single URL string. If no clear official account is found, return "NO_URL_FOUND".

Remember:
- Return only one most accurate official URL
- Return only complete URLs (no truncation)
- Do not create or guess URLs
- Do not add extra text, periods, quotes, etc.
- Ensure the returned URL matches the brand name and is the official account for that region`,

  linkedin: `Analyze the following content and extract the most accurate LinkedIn URL link, which should be the official LinkedIn page for the given brand in the specified region. Your answer should only contain a single URL, formatted as "https://www.linkedin.com/company/company-name/". Do not add any explanations or other content, only return the single URL string. If no clear official account is found, return "NO_URL_FOUND".

Remember:
- Return only one most accurate official URL
- Return only complete URLs (no truncation)
- Do not create or guess URLs
- Do not add extra text, periods, quotes, etc.
- Ensure the returned URL matches the brand name and is the official account for that region`,

  instagram: `Analyze the following content and extract the most accurate Instagram URL link, which should be the official Instagram account for the given brand in the specified region. Your answer should only contain a single URL, formatted as "https://www.instagram.com/username/". Do not add any explanations or other content, only return the single URL string. If no clear official account is found, return "NO_URL_FOUND".

Remember:
- Return only one most accurate official URL
- Return only complete URLs (no truncation)
- Do not create or guess URLs
- Do not add extra text, periods, quotes, etc.
- Ensure the returned URL matches the brand name and is the official account for that region`,

  tiktok: `Analyze the following content and extract the most accurate TikTok URL link, which should be the official TikTok account for the given brand in the specified region. Your answer should only contain a single URL, formatted as "https://www.tiktok.com/@username". Do not add any explanations or other content, only return the single URL string. If no clear official account is found, return "NO_URL_FOUND".

Remember:
- Return only one most accurate official URL
- Return only complete URLs (no truncation)
- Do not create or guess URLs
- Do not add extra text, periods, quotes, etc.
- Ensure the returned URL matches the brand name and is the official account for that region`,

  twitter: `Analyze the following content and extract the most accurate Twitter URL link, which should be the official Twitter account for the given brand in the specified region. Your answer should only contain a single URL, formatted as "https://twitter.com/username". Do not add any explanations or other content, only return the single URL string. If no clear official account is found, return "NO_URL_FOUND".

Remember:
- Return only one most accurate official URL
- Return only complete URLs (no truncation)
- Do not create or guess URLs
- Do not add extra text, periods, quotes, etc.
- Ensure the returned URL matches the brand name and is the official account for that region`
};

export async function POST(req: NextRequest) {
  console.log('==== perplexity_url API called ====');
  try {
    // 1. Get data from the request
    const requestData = await req.json() as RequestBody;
    console.log('Request received:', requestData);
    
    const { brand, region, platform } = requestData;
    
    if (!brand || !region || !platform) {
      console.log('Missing required parameters:', { brand, region, platform });
      return NextResponse.json(
        { error: 'Missing required parameters: brand, region, platform' },
        { status: 400 }
      );
    }
    
    // Use type guard to validate if platform is a supported type
    if (!isPlatformSupported(platform)) {
      console.log('Unsupported platform:', platform);
      return NextResponse.json(
        { error: `Unsupported platform: ${platform}` },
        { status: 400 }
      );
    }
    
    // 2. Build Perplexity request
    console.log('Building Perplexity request for:', { brand, region, platform });
    const perplexityPrompt = PLATFORM_PROMPTS[platform].replace('{{Competitor}}', brand);
    
    const perplexityBody = {
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content: "Be precise and concise."
        },
        {
          role: "user",
          content: perplexityPrompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.2,
      top_p: 0.9,
      frequency_penalty: 0.5,
      presence_penalty: 0,
      stream: false
    };
    
    // 3. Call internal Perplexity API endpoint
    console.log('Calling Perplexity API...');
    const perplexityUrl = new URL('/api/perplexity', req.url).toString();
    console.log('Perplexity URL:', perplexityUrl);
    
    const perplexityResponse = await fetch(perplexityUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(perplexityBody)
    });
    
    console.log('Perplexity API response status:', perplexityResponse.status);
    const perplexityData = await perplexityResponse.json();
    
    if (!perplexityResponse.ok) {
      console.error('Perplexity API call failed:', perplexityData);
      return NextResponse.json(
        { error: 'Perplexity API call failed', details: perplexityData },
        { status: perplexityResponse.status }
      );
    }
    
    // 4. Get Perplexity result
    const perplexityContent = perplexityData.choices?.[0]?.message?.content;
    console.log('Perplexity content received:', 
      perplexityContent ? `${perplexityContent.substring(0, 100)}...` : 'No content');
    
    if (!perplexityContent) {
      console.error('Perplexity did not return valid content');
      return NextResponse.json(
        { error: 'Perplexity did not return valid content' },
        { status: 500 }
      );
    }
    
    // 5. Build Anthropic request
    console.log('Building Anthropic request...');
    const anthropicPrompt = ANTHROPIC_VERIFY_PROMPTS[platform];
    const anthropicMessages = [
      {
        role: "user",
        content: `Brand: ${brand}\nRegion: ${region}\nPlatform: ${platform}\n\nPerplexity Result:\n${perplexityContent}\n\n${anthropicPrompt}`
      }
    ];
    
    // 6. Call internal Anthropic API endpoint
    console.log('Calling Anthropic API...');
    const anthropicUrl = new URL('/api/anthropic', req.url).toString();
    console.log('Anthropic URL:', anthropicUrl);
    
    const anthropicResponse = await fetch(anthropicUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: anthropicMessages
      })
    });
    
    console.log('Anthropic API response status:', anthropicResponse.status);
    const anthropicData = await anthropicResponse.json();
    
    if (!anthropicResponse.ok) {
      console.error('Anthropic API call failed:', anthropicData);
      return NextResponse.json(
        { error: 'Anthropic API call failed', details: anthropicData },
        { status: anthropicResponse.status }
      );
    }
    
    // 7. Get final URL result
    const finalUrl = anthropicData.choices?.[0]?.message?.content?.trim() || 'NO_URL_FOUND';
    console.log('Final URL extracted:', finalUrl);
    
    // 8. Return the final result
    console.log('==== perplexity_url API completed successfully ====');
    return NextResponse.json({ 
      url: finalUrl, 
      platform, 
      brand, 
      region,
      perplexityContent
    });
    
  } catch (error: unknown) {
    console.error('Error processing URL request:', error);
    return NextResponse.json(
      { error: 'Error processing request', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Type guard function to validate if platform is a supported type
function isPlatformSupported(platform: string): platform is PlatformType {
  return Object.keys(PLATFORM_PROMPTS).includes(platform as PlatformType);
} 