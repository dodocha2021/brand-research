import { supabase, Database } from './supabase'

// 创建新的搜索记录
export async function createSearch(originalBrand: string, region: string) {
  const { data, error } = await supabase
    .from('searches')
    .insert([
      {
        original_brand: originalBrand,
        region,
        status: 'pending'
      }
    ])
    .select()
    .single()

  if (error) throw error
  return data
}

// 获取搜索记录
export async function getSearch(id: string) {
  const { data, error } = await supabase
    .from('searches')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

// 更新搜索状态
export async function updateSearchStatus(
  id: string,
  status: Database['public']['Tables']['searches']['Row']['status']
) {
  const { data, error } = await supabase
    .from('searches')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// 添加竞争对手
export async function addCompetitor(
  searchId: string,
  competitor: Omit<Database['public']['Tables']['competitors']['Insert'], 'id' | 'search_id' | 'created_at' | 'updated_at'>
) {
  const { data, error } = await supabase
    .from('competitors')
    .insert([
      {
        search_id: searchId,
        ...competitor
      }
    ])
    .select()
    .single()

  if (error) throw error
  return data
}

// 更新竞争对手数据
export async function updateCompetitorData(
  id: string,
  data: Partial<Database['public']['Tables']['competitors']['Update']>
) {
  const { data: updatedData, error } = await supabase
    .from('competitors')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return updatedData
}

// 添加分析报告
export async function addReport(searchId: string, content: string) {
  const { data, error } = await supabase
    .from('reports')
    .insert([
      {
        search_id: searchId,
        content
      }
    ])
    .select()
    .single()

  if (error) throw error
  return data
}

// 添加状态更新
export async function addStatusUpdate(
  searchId: string,
  message: string,
  step: Database['public']['Tables']['status_updates']['Row']['step'],
  percentage?: number
) {
  const { data, error } = await supabase
    .from('status_updates')
    .insert([
      {
        search_id: searchId,
        message,
        step,
        percentage
      }
    ])
    .select()
    .single()

  if (error) throw error
  return data
}

// 获取搜索的所有竞争对手
export async function getCompetitors(searchId: string) {
  const { data, error } = await supabase
    .from('competitors')
    .select('*')
    .eq('search_id', searchId)

  if (error) throw error
  return data
}

// 获取搜索的报告
export async function getReport(searchId: string) {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('search_id', searchId)
    .single()

  if (error) throw error
  return data
}

// 获取搜索的状态更新
export async function getStatusUpdates(searchId: string) {
  const { data, error } = await supabase
    .from('status_updates')
    .select('*')
    .eq('search_id', searchId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

// 获取所有搜索记录
export async function getAllSearches() {
  const { data, error } = await supabase
    .from('competitor_search_history')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
} 