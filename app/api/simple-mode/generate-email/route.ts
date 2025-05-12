import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { EMAIL_TEMPLATES } from '@/lib/prompts'

type RequestBody = {
  searchId: string
  selectedTemplate: keyof typeof EMAIL_TEMPLATES
  customTemplate?: string
  contactName?: string
}

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let searchId: string | undefined

  try {
    // 1. Parse request body
    console.log('Starting to process generate-email request');
    let requestBody;
    try {
      requestBody = await req.json();
      console.log('Received request body:', requestBody);
    } catch (e) {
      console.error('Failed to parse request body JSON:', e);
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    
    // Note: The frontend should consistently pass the same searchId throughout the process
    // to avoid data incompleteness due to new searchId generation during retries
    const {
      searchId: id,
      selectedTemplate,
      customTemplate = '',
      contactName = ''
    } = requestBody as RequestBody
    
    searchId = id
    console.log('Parsed searchId:', searchId);
    
    if (!searchId) {
      console.error('Missing searchId parameter');
      return NextResponse.json({ error: 'Missing searchId' }, { status: 400 })
    }

    // Validate template
    if (!selectedTemplate && !customTemplate) {
      console.error('Missing template parameter');
      return NextResponse.json({ error: 'Missing template selection' }, { status: 400 });
    }

    if (selectedTemplate && !EMAIL_TEMPLATES[selectedTemplate]) {
      console.error('Invalid template selection:', selectedTemplate);
      return NextResponse.json({ error: 'Invalid template selection' }, { status: 400 });
    }

    // 2. Update status to generating
    {
      const { error: updErr } = await supabase
        .from('searches')
        .update({ status: 'generating' })
        .eq('id', searchId)
      if (updErr) {
        console.error('Failed to update status to generating:', updErr);
      }
    }

    // 3. Get original brand from searches table
    const { data: searchData, error: searchErr } = await supabase
      .from('searches')
      .select('original_brand, status')
      .eq('id', searchId)
      .single()
    if (searchErr || !searchData) {
      console.error('fetch searches error:', searchErr);
      throw new Error('Search record not found');
    }
    console.log("Search record (searchData):", searchData);
    const originalBrand = searchData.original_brand;

    // 4. Get scraping results from simple_search_history table
    const { data: rows, error: fetchErr } = await supabase
      .from('simple_search_history')
      .select('competitor_name, platform, url, fans_count')
      .eq('search_id', searchId)
    if (fetchErr) {
      console.error('fetch simple_search_history error:', fetchErr);
      throw new Error('Failed to fetch data');
    }
    console.log("Raw rows pulled from database:", rows);

    // Check if there is enough data for analysis
    if (!rows || rows.length === 0) {
      console.error('No social media data found');
      
      // Check current search status, if still in progress, prompt user to wait
      if (searchData.status === 'scraping') {
        throw new Error('Search still in progress, please try again later. Data is being processed asynchronously via webhook.');
      } else {
        throw new Error('No social media data found for this search. Please ensure scraping completed successfully.');
      }
    }

    // 5. Construct JSON data for AI analysis
    const competitorData = (rows || []).map(r => ({
      competitor_name: r.competitor_name,
      platform: r.platform,
      url: r.url,
      followers: r.fans_count
    }))
    const jsonData = JSON.stringify(competitorData, null, 2)
    console.log("Organized competitorData:", competitorData);
    console.log("Formatted JSON data:", jsonData);

    // 6. Choose template and replace placeholders, explicitly stating target brand
    const baseTemplate = customTemplate || EMAIL_TEMPLATES[selectedTemplate];
    let promptContent = `Target Brand: ${originalBrand}\nContact: ${contactName}\n\n`;
    promptContent += baseTemplate
      .replace('{{targetBrandName}}', originalBrand)
      .replace('{{contactName}}', contactName || '[Contact Name]');
    promptContent += `\n\nJSON Data:\n${jsonData}`;
    console.log("Final promptContent sent to AI:", promptContent);

    // 7. Call internal Anthropic API to generate email
    const origin = req.nextUrl.origin;
    const aiRes = await fetch(`${origin}/api/anthropic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: promptContent }] })
    });
    
    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      console.error(`AI API call failed (${aiRes.status}):`, errorText);
      throw new Error(`AI service error: ${aiRes.status} ${errorText}`);
    }
    
    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    if (!content) {
      console.error('AI returned empty content');
      throw new Error('AI generated empty content');
    }

    // 8. Update status to completed
    {
      const { error: updErr2 } = await supabase
        .from('searches')
        .update({ status: 'completed' })
        .eq('id', searchId)
      if (updErr2) {
        console.error('Failed to update status to completed:', updErr2);
      }
    }

    // 9. Return generated result with debug data
    return NextResponse.json({ 
      content, 
      debug: { 
        searchData, 
        rows, 
        competitorData 
      } 
    });
  } catch (e: any) {
    console.error('generate-email POST error:', e);
    // Update status to failed on error, unless data is not ready yet
    if (searchId && !e.message.includes('Search still in progress')) {
      try {
        await supabase
          .from('searches')
          .update({ status: 'failed' })
          .eq('id', searchId)
      } catch (err) {
        console.error('Failed to update status to failed:', err);
      }
    }
    return NextResponse.json(
      { error: e.message || 'Internal error' },
      { status: 500 }
    );
  }
}