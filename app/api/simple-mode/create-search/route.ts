import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { brandName, region } = await req.json()
    if (!brandName) {
      return NextResponse.json({ error: 'Brand name is required' }, { status: 400 })
    }
    // Use provided region value or set default
    const regionValue = region || 'North American'
    
    // Check if there's an existing search record in idle status
    const { data, error } = await supabase
      .from('searches')
      .select('*')
      .eq('original_brand', brandName)
      .eq('status', 'idle')
      .limit(1)
      .single()
    
    if (data) {
      // Reuse existing searchId to ensure all retries use the same searchId
      return NextResponse.json({ searchId: data.id })
    }
    
    // If not exist, create a new search record and insert region field
    const { data: newData, error: insertError } = await supabase
      .from('searches')
      .insert({ original_brand: brandName, status: 'idle', region: regionValue })
      .select()
      .single()
      
    if (insertError) {
      throw new Error(insertError.message)
    }
    
    return NextResponse.json({ searchId: newData.id })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}