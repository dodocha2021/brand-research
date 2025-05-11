import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const { search_id, competitor_name, platform, url } = await request.json();
    
    // 验证请求
    if (!search_id || !competitor_name || !platform || !url) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // 插入数据到数据库
    const { error } = await supabase
      .from('simple_search_history') // 确保使用正确的表名
      .insert({
        search_id,
        competitor_name,
        platform,
        url,
        updated_at: new Date().toISOString() // 可选字段
      });
    
    if (error) {
      console.error('Error inserting data:', error);
      return NextResponse.json(
        { success: false, message: 'Database insert failed', error },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Competitor data inserted successfully'
    });
    
  } catch (error: any) {
    console.error('Error in update-competitor:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
} 