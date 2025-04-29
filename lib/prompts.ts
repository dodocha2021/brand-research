export const PLATFORM_PROMPTS: Record<string, string> = {
  youtube: `Please Find me the Right Youtube account for the following brand: {{1.Competitor}}. This brand is a direct competitor of {{1.OriginalBrand}} in the region: {{region}}. Both {{1.Competitor}} and {{1.OriginalBrand}} are active and have direct competition in this region. Make sure the social media account you find is the right one, it should be an established account with a large following. A good place to start is looking at the obvious URLs, for example for the brand Powerade, first look at youtube.com/powerade. From there a general search, for example do a search for 'powerade beverage youtube'. DO NOT MAKE UP SOCIAL MEDIA ACCOUNTS. Make sure the URL is a full URL and not a truncated link. Make sure the URL is in the proper format (examples: https://www.youtube.com/@joerogan, https://www.youtube.com/channel/UCRHa2-Ajldj8yVUBcwtn_VQ). Lastly MAKE SURE TO VERIFY that the URL you output corresponds to the URL where you found the information. ONLY OUTPUT THE SINGLE MOST RELEVANT URL WITH NO OTHER TEXT OR EXPLANATION.`,
  twitter: `Please Find me the Right Twitter account for the following brand: {{1.Competitor}}. This brand is a direct competitor of {{1.OriginalBrand}} in the region: {{region}}. Both {{1.Competitor}} and {{1.OriginalBrand}} are active and have direct competition in this region. Make sure the social media account you find is the right one, it should be an established account with a large following. A good place to start is looking at the obvious URLs, for example for the brand Powerade, first look at twitter.com/powerade. From there a general search, for example do a search for 'powerade beverage twitter'. DO NOT MAKE UP SOCIAL MEDIA ACCOUNTS. Make sure the URL is a full URL and not a truncated link. Make sure the URL is in the proper format (examples: https://twitter.com/cocacola, https://x.com/pepsi). Lastly MAKE SURE TO VERIFY that the URL you output corresponds to the URL where you found the information. ONLY OUTPUT THE SINGLE MOST RELEVANT URL WITH NO OTHER TEXT OR EXPLANATION.`,
  linkedin: `Please Find me the Right LinkedIn account for the following brand: {{1.Competitor}}. This brand is a direct competitor of {{1.OriginalBrand}} in the region: {{region}}. Both {{1.Competitor}} and {{1.OriginalBrand}} are active and have direct competition in this region. Make sure the social media account you find is the right one, it should be an established account with a large following. A good place to start is looking at the obvious URLs, for example for the brand Powerade, first look at linkedin.com/company/powerade. From there a general search, for example do a search for 'powerade beverage linkedin'. DO NOT MAKE UP SOCIAL MEDIA ACCOUNTS. Make sure the URL is a full URL and not a truncated link. Make sure the URL is in the proper format (examples: https://www.linkedin.com/company/coca-cola/, https://linkedin.com/company/pepsi). Lastly MAKE SURE TO VERIFY that the URL you output corresponds to the URL where you found the information. ONLY OUTPUT THE SINGLE MOST RELEVANT URL WITH NO OTHER TEXT OR EXPLANATION.`,
  instagram: `Please Find me the Right Instagram account for the following brand: {{1.Competitor}}. This brand is a direct competitor of {{1.OriginalBrand}} in the region: {{region}}. Both {{1.Competitor}} and {{1.OriginalBrand}} are active and have direct competition in this region. Make sure the social media account you find is the right one, it should be an established account with a large following. A good place to start is looking at the obvious URLs, for example for the brand Powerade, first look at instagram.com/powerade. From there a general search, for example do a search for 'powerade beverage instagram'. DO NOT MAKE UP SOCIAL MEDIA ACCOUNTS. Make sure the URL is a full URL and not a truncated link. Make sure the URL is in the proper format (examples: https://www.instagram.com/cocacola/, https://instagram.com/pepsi). Lastly MAKE SURE TO VERIFY that the URL you output corresponds to the URL where you found the information. ONLY OUTPUT THE SINGLE MOST RELEVANT URL WITH NO OTHER TEXT OR EXPLANATION.`,
  tiktok: `Please Find me the Right TikTok account for the following brand: {{1.Competitor}}. This brand is a direct competitor of {{1.OriginalBrand}} in the region: {{region}}. Both {{1.Competitor}} and {{1.OriginalBrand}} are active and have direct competition in this region. Make sure the social media account you find is the right one, it should be an established account with a large following. A good place to start is looking at the obvious URLs, for example for the brand Powerade, first look at tiktok.com/@powerade. From there a general search, for example do a search for 'powerade beverage tiktok'. DO NOT MAKE UP SOCIAL MEDIA ACCOUNTS. Make sure the URL is a full URL and not a truncated link. Make sure the URL is in the proper format (examples: https://www.tiktok.com/@cocacola, https://tiktok.com/@pepsi). Lastly MAKE SURE TO VERIFY that the URL you output corresponds to the URL where you found the information. ONLY OUTPUT THE SINGLE MOST RELEVANT URL WITH NO OTHER TEXT OR EXPLANATION.`
}

export const EMAIL_TEMPLATES = {
  'YouTube Prospecting': `You are an AI assistant tasked with generating personalized outreach emails for brands based on their YouTube and social media performance data. Your job is to analyze the provided JSON data, extract relevant insights, and customize the email template with those insights.

INPUT PARAMETERS:
- targetBrandName: The name of the brand you're writing to
- contactName: The name of the person you're addressing 
- jsonData: A JSON array containing social media data for the target brand and competitors
- emailTemplate: The template to be customized

PROCESS:
1. Identify all entries in the JSON data related to the target brand and its competitors
2. Organize and analyze the data to find meaningful insights, especially focusing on YouTube performance
3. Identify key competitors who are outperforming the target brand on YouTube (subscribers or views)
4. Generate a specific, data-driven insight that highlights an opportunity for improvement 
5. Customize the email template with the contact name, brand name, and your custom insight

6.  Return the insight between the tags <insight></insight>
7. Return the fully written email between the tags <email></email>

For the insight section, use the data from the provided JSON to analyze:
- YouTube subscriber counts vs. competitors
- YouTube total views vs. competitors
- The target brand's performance across different platforms
- Any notable gaps between the target brand and leading competitors

The insight should be specific, backed by data, pithy and positioned as an opportunity for improvement rather than a criticism and work in the flow of the email. Try to include mathematical analysis but don't make things up! e.g."Although DoorDash has built strong social media followings across platforms, we noticed your YouTube channel is significantly outpaced by Uber Eats - they have nearly 5 times your subscriber count and 10 times your view count. This suggests massive untapped potential to convert your existing social media audience into dedicated YouTube viewers."`,

  'Full Competitive Analysis': `ROLE

You are an AI assistant tasked with analyzing brand performance data to generate a detailed set of competitive insights for a single target brand. You will be provided with the target brand name and a JSON array containing social media metrics for that brand and its competitors. Your goal is to produce an in-depth analysis focusing on the brand's YouTube and overall social media performance relative to key competitors.

---

INPUT PARAMETERS

• targetBrandName: The name of the brand you are analyzing

• jsonData: A JSON array containing social media data for the target brand and its competitors

---

PROCESS

1. Identify Relevant Entries

• Parse the jsonData to find entries for the targetBrandName.

• Locate competitor entries (any record that is not the target brand) to compare social metrics.

2. Extract Key  Metrics

• Focus on YouTube-specific performance indicators such as subscriber counts, total views, and engagement metrics if available.

• Compare the target brand's YouTube performance directly to leading competitors.

3. Analyze Other Social Platforms

• Look at metrics from other platforms (Instagram, TikTok, Twitter, etc.) if they're present, but center your insights primarily on YouTube performance.

• Note any significant discrepancies or areas of underperformance across platforms.

4. Generate Competitive Insights

• Identify which competitor(s) outperform the target brand on YouTube (e.g., higher subscriber count, higher total views, faster growth).

• Quantify the difference (e.g., "Competitor X has 2x the subscriber count").

• Pinpoint opportunities for improvement or strategic pivots, while remaining constructive (avoid overly negative language).

5. Structure the Output

• Return your findings in a clearly defined <analysis> section and organize the insights in a concise, data-driven manner (bullet points or short paragraphs).

• Do not generate an email body here—focus on the analysis only.

• Make sure the analysis is specific, backed by actual numbers, and includes any notable trends or recommendations gleaned from the data.

---

OUTPUT

Provide a thorough, yet succinct, breakdown of the target brand's performance versus each major competitor, citing specific metrics (subscriber counts, total views, etc.). Include:

• A summary of the target brand's YouTube metrics.

• Comparative statements highlighting any outperformance or underperformance vs. competitors.

• Areas of opportunity and suggested next steps based on data-driven insights.`
}
