import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Set wait time after last webhook arrival (milliseconds)
const WAIT_TIME_AFTER_LAST_WEBHOOK = 2 * 60 * 1000; // 2 minutes
// Set absolute maximum wait time (milliseconds)
const MAX_TOTAL_WAIT_TIME = 3 * 60 * 1000; // 3 minutes

export async function POST(request: NextRequest) {
  console.log('[check-scraping-status] Processing request');
  
  try {
    // Parse request body
    const { searchId } = await request.json();
    console.log(`[check-scraping-status] Received searchId: ${searchId}`);
    
    // Validate request
    if (!searchId) {
      console.log('[check-scraping-status] Missing searchId parameter');
      return NextResponse.json(
        { success: false, message: 'Search ID is required' },
        { status: 400 }
      );
    }
    
    // 1. Check current search status
    console.log(`[check-scraping-status] Fetching search status from database, id=${searchId}`);
    const { data: searchData, error: searchError } = await supabase
      .from('searches')
      .select('status, updated_at')
      .eq('id', searchId)
      .single();
      
    if (searchError) {
      console.error('[check-scraping-status] Failed to get search status:', searchError);
      return NextResponse.json(
        { success: false, message: 'Failed to get search status', error: searchError },
        { status: 500 }
      );
    }
    
    console.log(`[check-scraping-status] Current search status: ${searchData.status}, last updated: ${searchData.updated_at}`);
    
    // If search status is not scraping, return current status
    if (searchData.status !== 'scraping') {
      console.log(`[check-scraping-status] Search status is not scraping, returning: ${searchData.status}`);
      return NextResponse.json({
        success: true,
        isCompleted: searchData.status !== 'failed',
        status: searchData.status
      });
    }
    
    // Check how much time has passed since scraping started
    const now = new Date();
    const searchStartTime = new Date(searchData.updated_at);
    const totalElapsedTime = now.getTime() - searchStartTime.getTime();
    console.log(`[check-scraping-status] Time elapsed since scraping started: ${Math.round(totalElapsedTime/1000)} seconds`);
    
    // Check if maximum wait time has been exceeded
    const hasExceededMaxWaitTime = totalElapsedTime > MAX_TOTAL_WAIT_TIME;
    
    if (hasExceededMaxWaitTime) {
      console.log(`[check-scraping-status] Maximum wait time (${MAX_TOTAL_WAIT_TIME/1000} seconds) exceeded, forcing next phase`);
    }
    
    // 2. Get all related competitor data
    console.log(`[check-scraping-status] Fetching competitor data, searchId=${searchId}`);
    const { data: items, error: itemsError } = await supabase
      .from('simple_search_history')
      .select('*')
      .eq('search_id', searchId);
      
    if (itemsError) {
      console.error('[check-scraping-status] Failed to get competitor data:', itemsError);
      return NextResponse.json(
        { success: false, message: 'Failed to get competitor data', error: itemsError },
        { status: 500 }
      );
    }
    
    // If no data, might still be in initial phase
    if (!items || items.length === 0) {
      // If timed out, still force next phase
      if (hasExceededMaxWaitTime) {
        const newStatus = 'user_action_needed';
        console.log(`[check-scraping-status] Timeout with no data, updating status to: ${newStatus}`);
        
        await supabase
          .from('searches')
          .update({ status: newStatus })
          .eq('id', searchId);
          
        return NextResponse.json({
          success: true,
          isCompleted: true,
          status: newStatus,
          diagnosis: `Waited ${Math.round(totalElapsedTime/1000)} seconds but received no data. Manual action required.`,
          stats: {
            total: 0,
            withData: 0,
            withValidData: 0,
            isStillReceivingWebhooks: false,
            lastUpdateTimeDiff: null,
            totalElapsedTime: Math.round(totalElapsedTime/1000)
          }
        });
      }
      
      console.log('[check-scraping-status] No competitor data found, possibly still in initial phase');
      return NextResponse.json({
        success: true,
        isCompleted: false,
        status: 'scraping',
        diagnosis: `Waited ${Math.round(totalElapsedTime/1000)} seconds, no data received yet`,
        stats: {
          totalElapsedTime: Math.round(totalElapsedTime/1000)
        }
      });
    }
    
    console.log(`[check-scraping-status] Successfully fetched ${items.length} competitor data entries`);
    
    // 3. Calculate how many items have fans_count and how many don't
    const totalItems = items.length;
    const itemsWithData = items.filter(item => 
      item.fans_count !== null && 
      item.fans_count !== undefined
    );
    const itemsWithValidData = itemsWithData.filter(item => 
      item.fans_count > 200
    );
    
    console.log(`[check-scraping-status] Data statistics: Total=${totalItems}, With data=${itemsWithData.length}, With valid data=${itemsWithValidData.length}`);
    
    // Log status of all items for debugging
    items.forEach((item, index) => {
      console.log(`[check-scraping-status] Item #${index+1}: ${item.competitor_name} / ${item.platform} => fans_count=${item.fans_count}, actorRunId=${item.actorRunId?.slice(0, 8)}..., defaultDatasetId=${item.defaultDatasetId?.slice(0, 8) || 'null'}`);
    });
    
    // 4. Check for recently updated webhook data
    const lastUpdatedItem = items.reduce((latest, item) => {
      if (!item.updated_at) return latest;
      const itemDate = new Date(item.updated_at);
      return !latest || itemDate > new Date(latest.updated_at) ? item : latest;
    }, null);
    
    // If last update time is within 2 minutes, consider there may be more webhooks being processed
    let isStillReceivingWebhooks = false;
    let lastUpdateTimeDiff = null;
    if (lastUpdatedItem && lastUpdatedItem.updated_at) {
      const lastUpdateTime = new Date(lastUpdatedItem.updated_at);
      lastUpdateTimeDiff = now.getTime() - lastUpdateTime.getTime();
      isStillReceivingWebhooks = lastUpdateTimeDiff < WAIT_TIME_AFTER_LAST_WEBHOOK && !hasExceededMaxWaitTime;
      
      console.log(`[check-scraping-status] Last update time: ${lastUpdateTime.toISOString()}, time since: ${Math.round(lastUpdateTimeDiff/1000)} seconds, still receiving webhooks: ${isStillReceivingWebhooks}`);
    } else {
      console.log('[check-scraping-status] Could not find last update time');
    }
    
    // 5. Decide if completed and next status
    let isCompleted = false;
    let newStatus = 'scraping';
    
    // Consider scraping complete if any of these conditions are met:
    // 1. All items have data
    // 2. Or last webhook was more than 2 minutes ago and there is at least some data
    // 3. Or total time has exceeded maximum wait time
    if (itemsWithData.length === totalItems || 
        (!isStillReceivingWebhooks && itemsWithData.length > 0) ||
        hasExceededMaxWaitTime) {
      
      isCompleted = true;
      
      // Check if there is invalid data (fans_count <= 200)
      if (itemsWithValidData.length < totalItems) {
        // Invalid data exists, user action needed
        newStatus = 'user_action_needed';
        console.log('[check-scraping-status] Invalid data needs user action, updating status to: user_action_needed');
      } else {
        // All data is valid, can proceed directly to generating
        newStatus = 'ready_for_generating';
        console.log('[check-scraping-status] All data valid, updating status to: ready_for_generating');
      }
      
      // Update search status
      console.log(`[check-scraping-status] Updating database search status: ${searchData.status} -> ${newStatus}`);
      const { error: updateError } = await supabase
        .from('searches')
        .update({ status: newStatus })
        .eq('id', searchId);
        
      if (updateError) {
        console.error('[check-scraping-status] Failed to update search status:', updateError);
      } else {
        console.log('[check-scraping-status] Database status updated successfully');
      }
    } else {
      console.log('[check-scraping-status] Scraping still in progress, not updating status');
    }
    
    // Generate detailed diagnosis information
    const timeoutMsg = hasExceededMaxWaitTime ? `(timeout after ${Math.round(totalElapsedTime/1000)} seconds)` : '';
    
    const diagnosis = isCompleted 
      ? `Scraping completed ${timeoutMsg}, ${itemsWithValidData.length}/${totalItems} data valid` 
      : isStillReceivingWebhooks 
        ? `Still receiving webhooks, last update ${Math.round((lastUpdateTimeDiff || 0)/1000)} seconds ago, total time ${Math.round(totalElapsedTime/1000)} seconds` 
        : `Waiting for webhook data, currently only ${itemsWithData.length}/${totalItems} items have data, total time ${Math.round(totalElapsedTime/1000)} seconds`;
        
    // 6. Return result
    console.log(`[check-scraping-status] Returning result: completed=${isCompleted}, status=${newStatus}, diagnosis=${diagnosis}`);
    return NextResponse.json({
      success: true,
      isCompleted,
      status: newStatus,
      diagnosis,
      stats: {
        total: totalItems,
        withData: itemsWithData.length,
        withValidData: itemsWithValidData.length,
        isStillReceivingWebhooks,
        lastUpdateTimeDiff: lastUpdateTimeDiff ? Math.round(lastUpdateTimeDiff/1000) : null,
        totalElapsedTime: Math.round(totalElapsedTime/1000),
        hasExceededMaxWaitTime
      }
    });
    
  } catch (error: any) {
    console.error('[check-scraping-status] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
} 