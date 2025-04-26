import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 创建 Supabase 客户端
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 创建服务端 Supabase 客户端（使用服务角色密钥）
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 类型定义
export type Database = {
  public: {
    Tables: {
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
      competitors: {
        Row: {
          id: string
          search_id: string
          competitor_name: string
          platform: string
          competitor_url: string
          fans_count: number | null
          following_count: number | null
          profile_picture_url: string | null
          data_fetched: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          search_id: string
          competitor_name: string
          platform: string
          competitor_url: string
          fans_count?: number | null
          following_count?: number | null
          profile_picture_url?: string | null
          data_fetched?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          search_id?: string
          competitor_name?: string
          platform?: string
          competitor_url?: string
          fans_count?: number | null
          following_count?: number | null
          profile_picture_url?: string | null
          data_fetched?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      reports: {
        Row: {
          id: string
          search_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          search_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          search_id?: string
          content?: string
          created_at?: string
        }
      }
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