import { createClient } from '@supabase/supabase-js'

// 环境变量中读取 Supabase 项目 URL 和匿名 key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 创建并导出 Supabase 客户端实例
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// 定义数据库类型（仅保留 we 需要的表）
export type Database = {
  public: {
    Tables: {
      // 搜索会话表
      searches: {
        Row: {
          id: string
          original_brand: string
          region: string
          status: 'pending' | 'analyzing' | 'completed' | 'failed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          original_brand: string
          region: string
          status?: 'pending' | 'analyzing' | 'completed' | 'failed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          original_brand?: string
          region?: string
          status?: 'pending' | 'analyzing' | 'completed' | 'failed'
          created_at?: string
          updated_at?: string
        }
      }

      // Simple Mode 专用表：存储抓取到的非空社交账号数据
      simple_search_history: {
        Row: {
          id: string
          search_id: string
          competitor_name: string
          platform: string
          url: string
          fans_count: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          search_id: string
          competitor_name: string
          platform: string
          url: string
          fans_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          search_id?: string
          competitor_name?: string
          platform?: string
          url?: string
          fans_count?: number | null
          created_at?: string
          updated_at?: string
        }
      }

      // 流程状态更新表（可选，用于记录进度消息）
      status_updates: {
        Row: {
          id: string
          search_id: string
          message: string
          step: 'validation' | 'competitors_found' | 'scraping' | 'analysis' | 'completed'
          percentage: number | null
          created_at: string
        }
        Insert: {
          id?: string
          search_id: string
          message: string
          step: 'validation' | 'competitors_found' | 'scraping' | 'analysis' | 'completed'
          percentage?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          search_id?: string
          message?: string
          step?: 'validation' | 'competitors_found' | 'scraping' | 'analysis' | 'completed'
          percentage?: number | null
          created_at?: string
        }
      }
    }
  }
}