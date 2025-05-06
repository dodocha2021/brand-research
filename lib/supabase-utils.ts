import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/supabase'

// 1. 创建新的搜索会话
export async function createSearch(
  originalBrand: string,
  region: string
): Promise<Database['public']['Tables']['searches']['Row']> {
  const { data, error } = await supabase
    .from('searches')
    .insert([{ original_brand: originalBrand, region, status: 'pending' }])
    .select()
    .single()
  if (error) throw error
  return data
}

// 2. 获取某次搜索会话
export async function getSearch(
  id: string
): Promise<Database['public']['Tables']['searches']['Row']> {
  const { data, error } = await supabase
    .from('searches')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// 3. 更新搜索状态
export async function updateSearchStatus(
  id: string,
  status: Database['public']['Tables']['searches']['Row']['status']
): Promise<Database['public']['Tables']['searches']['Row']> {
  const { data, error } = await supabase
    .from('searches')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// 4. 添加流程状态更新（可选）
export async function addStatusUpdate(
  searchId: string,
  message: string,
  step: Database['public']['Tables']['status_updates']['Row']['step'],
  percentage?: number
): Promise<Database['public']['Tables']['status_updates']['Row']> {
  const { data, error } = await supabase
    .from('status_updates')
    .insert([
      {
        search_id: searchId,
        message,
        step,
        percentage: percentage ?? null
      }
    ])
    .select()
    .single()
  if (error) throw error
  return data
}

// 5. 获取流程状态更新（可选）
export async function getStatusUpdates(
  searchId: string
): Promise<Database['public']['Tables']['status_updates']['Row'][]> {
  const { data, error } = await supabase
    .from('status_updates')
    .select('*')
    .eq('search_id', searchId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// 6. 添加 Simple Mode 抓取结果
export async function addSimpleSearchEntry(
  searchId: string,
  competitorName: string,
  platform: string,
  url: string,
  fansCount: number
): Promise<Database['public']['Tables']['simple_search_history']['Row']> {
  const { data, error } = await supabase
    .from('simple_search_history')
    .insert([
      {
        search_id: searchId,
        competitor_name: competitorName,
        platform,
        url,
        fans_count: fansCount
      }
    ])
    .select()
    .single()
  if (error) throw error
  return data
}



// 8. 获取竞争对手搜索历史记录（按时间倒序）
export async function getCompetitors(): Promise<any[]> {
  const { data, error } = await supabase
    .from('competitor_search_history')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}