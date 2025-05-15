'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import ThemeToggle from '@/app/ThemeToggle'

type Step =
  | 'idle'
  | 'creating'
  | 'analysing'
  | 'extracting'
  | 'scraping'
  | 'generating'
  | 'done'
  | 'error'

type Item = {
  id: string
  name: string
  platform: string
  url?: string
  followers?: number | null
  success?: boolean
  error?: string
  actorRunId?: string
  defaultDatasetId?: string
  fans_count?: number | null
}

const statusPercent: Record<Step, number> = {
  idle: 0,
  creating: 10,
  analysing: 30,
  extracting: 50,
  scraping: 70,
  generating: 90,
  done: 100,
  error: 100,
}

export default function SimpleModePage() {
  const [, updateState] = useState<object>({})
  const forceUpdate = useCallback(() => updateState({}), [])

  const [githubVersion, setGithubVersion] = useState<string | null>(null)
  useEffect(() => {
    fetch(
      'https://raw.githubusercontent.com/dodocha2021/brand-research/main/package.json'
    )
      .then((res) => res.json())
      .then((data) => setGithubVersion(data.version || null))
      .catch(() => setGithubVersion(null))
  }, [])

  const [step, setStep] = useState<Step>('idle')
  const [progress, setProgress] = useState<number>(0)
  const [brandName, setBrandName] = useState<string>('')
  const [contactName, setContactName] = useState<string>('')
  const [template, setTemplate] = useState<'YouTube Prospecting' | 'Full Competitive Analysis'>(
    'YouTube Prospecting'
  )
  const [platformSelection, setPlatformSelection] = useState<
    'all platform' | 'instagram' | 'linkedin' | 'tiktok' | 'twitter' | 'youtube'
  >('all platform')
  const [errorInfo, setErrorInfo] = useState<string | null>(null)
  const [searchId, setSearchId] = useState<string>('')
  const [competitors, setCompetitors] = useState<string[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [emailContent, setEmailContent] = useState<string>('')
  const [debugResponses, setDebugResponses] = useState<{ step: string; data: any }[]>([])

  // User intervention related
  const [incompleteItems, setIncompleteItems] = useState<Item[]>([])
  const [retryingIndices, setRetryingIndices] = useState<number[]>([])
  // Add edit-related states
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingUrl, setEditingUrl] = useState<string>('')
  const [editingFollowers, setEditingFollowers] = useState<string>('')
  const [urlError, setUrlError] = useState<string>('')
  const [followersError, setFollowersError] = useState<string>('')

  // scraping polling related
  const [scrapingPolling, setScrapingPolling] = useState<boolean>(false)
  const [scrapingStatus, setScrapingStatus] = useState<string>('scraping')

  const timerRef = useRef<number | null>(null)
  const debugContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target = statusPercent[step]
    if (timerRef.current !== null) clearInterval(timerRef.current)
    if (target > progress) {
      timerRef.current = window.setInterval(() => {
        setProgress((prev) => {
          if (prev < target) return prev + 1
          if (timerRef.current !== null) clearInterval(timerRef.current)
          return prev
        })
      }, 30)
    } else {
      setProgress(target)
    }
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
    }
  }, [step])

  useEffect(() => {
    if (debugContainerRef.current) {
      debugContainerRef.current.scrollTop = debugContainerRef.current.scrollHeight
    }
  }, [debugResponses])

  // Use check-scraping-status API to poll status
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (scrapingPolling && searchId) {
      // Periodically check scraping status
      timeoutId = setTimeout(async () => {
        try {
          // Call the new API to check status
          const res = await fetch('/api/simple-mode/check-scraping-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchId })
          });
          
          if (!res.ok) {
            throw new Error('Failed to check scraping status');
          }
          
          const statusData = await res.json();
          
          // Handle based on returned status
          if (statusData.isCompleted) {
            setScrapingPolling(false);
            setScrapingStatus(statusData.status);
            
            // Decide next action based on status
            if (statusData.status === 'user_action_needed') {
              // User action needed, get problem items
              fetchAndShowIncompleteItems();
            } else if (statusData.status === 'ready_for_generating') {
              // Can directly generate email
              handleGenerateEmailAfterScraping();
            }
          } else {
            // Continue polling - fix logic, using more precise timing
            const waitingMsg = `Still scraping, waiting 10 seconds before continuing...`
            
            // Key fix: first set polling to false, then use timeout to set to true, ensure useEffect is re-triggered
            setScrapingPolling(false);
            setTimeout(() => {
              setScrapingPolling(true);
            }, 10000);
          }
          
          setDebugResponses((prev) => [
            ...prev,
            { step: 'check-scraping-status', data: statusData },
          ]);
        } catch (e: any) {
          console.error('Failed to check scraping status:', e);
          // Also restart polling when error occurs
          setScrapingPolling(false);
          setTimeout(() => {
            setScrapingPolling(true);
          }, 10000);
        }
      }, 100); // Quick start for first check
    }
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [scrapingPolling, searchId]);
  
  // Get and display incomplete items
  const fetchAndShowIncompleteItems = async () => {
    try {
      // Get current data
      const res = await fetch('/api/simple-mode/get-competitor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchId })
      });
      
      if (!res.ok) {
        throw new Error('Failed to get data');
      }
      
      const data = await res.json();
      
      // Find invalid data items
      const incomplete = data.items.filter((item: Item) => {
        if (item.platform === 'youtube') {
          // Check if invalid data
          const followers = item.fans_count || item.followers;
          return !item.url || followers === undefined || followers === null || followers <= 200;
        } else {
          const followers = item.followers;
          return !item.url || followers === undefined || followers === null || followers <= 200;
        }
      });
      
      // If there are invalid items, display interface for user to handle
      if (incomplete.length > 0) {
        setIncompleteItems(incomplete);
      } else {
        // If actually no invalid items, can continue to generate email
        handleGenerateEmailAfterScraping();
      }
    } catch (e: any) {
      console.error('Failed to get incomplete items:', e);
      setErrorInfo(e.message);
      setStep('error');
    }
  };

  // Single retry
  const handleRetry = async (item: Item, index: number) => {
    console.log(`Starting retry for ${item.name} on ${item.platform}, index: ${index}, item ID: ${item.id}`);
    setRetryingIndices((prev) => [...prev, index]);
    
    try {
      toast.success(`Request submitted, processing...`);
      
      // 立即清空显示的URL和follower数据
      updateItemWithUrlAndFollowers(item.id, "", null, false);
      
      // ===== 第一步：使用google-gpt API重新获取URL =====
      console.log(`Step 1: Retry extracting URL for ${item.name} on ${item.platform} using google-gpt`);
      
      // 调用google-gpt API重新获取URL
      const urlRes = await fetch('/api/google-gpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          brand: item.name,
          platform: item.platform,
          region: 'Global'
        }),
      });
      
      if (!urlRes.ok) {
        const errorText = await urlRes.text();
        throw new Error(`URL extraction (google-gpt) failed: ${errorText}`);
      }
      
      const urlJson = await urlRes.json();
      const newUrl = urlJson.url || null; // 确保没有URL时为null
      
      // 保存调试信息
      setDebugResponses((prev) => [
        ...prev,
        { step: `${item.platform}-retry-url-extraction-google-gpt`, data: urlJson },
      ]);
      
      if (!newUrl) {
        console.warn(`No URL found for ${item.name} on ${item.platform}`);
        toast.error(`No ${item.platform} link found for ${item.name}`);
        // 如果没找到URL，不使用旧URL，保持为null
        setRetryingIndices((prev) => prev.filter((i) => i !== index));
        return; // 提前退出函数
      }
      
      // 如果URL发生变化，记录日志并立即更新前端显示
      if (newUrl && newUrl !== item.url) {
        console.log(`URL updated from "${item.url}" to "${newUrl}"`);
        toast.success(`URL updated: ${newUrl}`);
        
        // URL获取成功后立即更新前端显示
        updateItemWithUrlAndFollowers(item.id, newUrl, null, false);
        
        // 更新数据库中的URL
        try {
          const updateUrlRes = await fetch('/api/simple-mode/update-competitor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              search_id: searchId,
              competitor_name: item.name,
              platform: item.platform,
              url: newUrl
            }),
          });
          
          if (!updateUrlRes.ok) {
            console.error(`Failed to update URL in database: ${await updateUrlRes.text()}`);
          }
        } catch (urlUpdateErr) {
          console.error("Error updating URL in database:", urlUpdateErr);
        }
      }
      
      // ===== 第二步：使用平台特定API获取粉丝数据 =====
      console.log(`Step 2: Getting follower data for ${item.name} using URL: ${newUrl}`);
      toast.success(`Getting follower data for ${item.name}...`);
      
      // Depending on platform type, select different API endpoints and request parameters
      let apiEndpoint = '';
      let requestBody = {};
      
      if (item.platform === 'youtube') {
        console.log(`Processing YouTube retry for ${item.name}, URL: ${newUrl}`);
        apiEndpoint = '/api/apify/youtube';
        requestBody = { 
          maxResultStreams: 0,
          maxResults: 1,
          maxResultsShorts: 0,
          sortVideosBy: "POPULAR",
          startUrls: [{ url: newUrl, method: "GET" }]
        };
      } else if (item.platform === 'tiktok') {
        apiEndpoint = '/api/apify/tiktok';
        requestBody = {
          excludePinnedPosts: false,
          profiles: [newUrl],
          resultsPerPage: 1,
          shouldDownloadAvatars: false,
          shouldDownloadCovers: true,
          shouldDownloadSlideshowImages: false,
          shouldDownloadSubtitles: false,
          shouldDownloadVideos: false,
          profileScrapeSections: ["videos"],
          profileSorting: "latest"
        };
      } else if (item.platform === 'instagram') {
        apiEndpoint = '/api/apify/instagram';
        requestBody = {
          usernames: [newUrl]
        };
      } else if (item.platform === 'linkedin') {
        apiEndpoint = '/api/apify/linkedin';
        requestBody = {
          identifier: [newUrl]
        };
      } else if (item.platform === 'twitter') {
        apiEndpoint = '/api/apify/twitter';
        requestBody = {
          maxItems: 1,
          sort: "Latest",
          startUrls: [newUrl]
        };
      } else {
        throw new Error(`Platform ${item.platform} does not support retry operation`);
      }
      
      // Send request
      console.log(`Sending retry request to ${apiEndpoint}`, requestBody);
      const retryRes = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (!retryRes.ok) {
        const errorText = await retryRes.text();
        console.error(`Follower data request failed: ${errorText}`);
        toast.error(`Failed to get follower data, but URL has been updated`);
        // 即使获取粉丝数据失败，也保持URL更新
        setRetryingIndices((prev) => prev.filter((i) => i !== index));
        return;
      }
      
      const resultData = await retryRes.json();
      console.log(`Received data for ${item.platform}:`, resultData);
      
      setDebugResponses((prev) => [
        ...prev,
        { step: `${item.platform}-retry-request`, data: resultData },
      ]);
      
      // Unified processing of return result
      try {
        // Extract follower data from return result
        let fans_count = null;
        
        if (item.platform === 'youtube') {
          // Process YouTube data
          console.log(`Processing YouTube response data`, resultData);
          if (Array.isArray(resultData) && resultData.length > 0) {
            const firstItem = resultData[0];
            console.log(`First YouTube result item:`, firstItem);
            
            // Try different paths to get subscriber count
            if (firstItem.aboutChannelInfo?.numberOfSubscribers !== undefined) {
              const subCount = firstItem.aboutChannelInfo.numberOfSubscribers;
              console.log(`Found numberOfSubscribers in aboutChannelInfo: ${subCount}`);
              if (typeof subCount === 'string') {
                fans_count = parseInt(subCount.replace(/,/g, ''));
              } else {
                fans_count = subCount;
              }
            } else if (firstItem.subscriberCount !== undefined) {
              console.log(`Found subscriberCount: ${firstItem.subscriberCount}`);
              fans_count = firstItem.subscriberCount;
            } else if (firstItem.channel?.subscriberCount !== undefined) {
              console.log(`Found channel.subscriberCount: ${firstItem.channel.subscriberCount}`);
              fans_count = firstItem.channel.subscriberCount;
            } else if (firstItem.numberOfSubscribers !== undefined) {
              console.log(`Found numberOfSubscribers: ${firstItem.numberOfSubscribers}`);
              fans_count = firstItem.numberOfSubscribers;
            }
          }
          
          // Special case: if we found "numberOfSubscribers" in the object itself (top level)
          if (fans_count === null && typeof resultData === 'object' && resultData.numberOfSubscribers !== undefined) {
            console.log(`Found top-level numberOfSubscribers: ${resultData.numberOfSubscribers}`);
            fans_count = resultData.numberOfSubscribers;
          }
          
          console.log(`Final extracted fans_count: ${fans_count}`);
        } else if (item.platform === 'tiktok') {
          // Process TikTok data
          if (Array.isArray(resultData) && resultData.length > 0) {
            const firstItem = resultData[0];
            if (firstItem.authorMeta && firstItem.authorMeta.fans !== undefined) {
              fans_count = firstItem.authorMeta.fans;
            }
          }
        } else if (item.platform === 'instagram') {
          // Process Instagram data
          if (Array.isArray(resultData) && resultData.length > 0) {
            const firstItem = resultData[0];
            if (firstItem.followersCount !== undefined) {
              fans_count = firstItem.followersCount;
            }
          }
        } else if (item.platform === 'linkedin') {
          // Process LinkedIn data
          if (Array.isArray(resultData) && resultData.length > 0) {
            const firstItem = resultData[0];
            if (firstItem.stats && firstItem.stats.follower_count !== undefined) {
              fans_count = firstItem.stats.follower_count;
            }
          }
        } else if (item.platform === 'twitter') {
          // Process Twitter data
          if (Array.isArray(resultData) && resultData.length > 0) {
            const firstItem = resultData[0];
            if (firstItem.author && firstItem.author.followers !== undefined) {
              fans_count = firstItem.author.followers;
            }
          }
        }
        
        if (fans_count !== null) {
          // Found valid data, update database
          console.log(`Valid fan count found: ${fans_count}. Updating database...`);
          
          const updateRes = await fetch('/api/simple-mode/update-competitor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              search_id: searchId,
              competitor_name: item.name,
              platform: item.platform,
              url: newUrl,
              fans_count: fans_count,
              dataset: JSON.stringify(resultData)
            }),
          });
          
          if (!updateRes.ok) {
            const errorText = await updateRes.text();
            console.error(`Failed to update database: ${errorText}`);
            throw new Error(`Failed to update database: ${errorText}`);
          }
          
          const updateJson = await updateRes.json();
          console.log(`Database update response:`, updateJson);
          
          // Update front-end state with follower count (URL已经更新)
          const isSuccess = fans_count > 200;
          console.log(`Updating frontend state with URL=${newUrl}, fans_count=${fans_count}, isSuccess=${isSuccess}`);
          
          // 更新本地item状态，更新粉丝数
          // Force re-render with a timeout to ensure state is updated
          setTimeout(() => {
            updateItemWithUrlAndFollowers(item.id, newUrl, fans_count, isSuccess);
          }, 50);
          
          if (isSuccess) {
            toast.success(`Successfully retrieved ${item.name}'s followers: ${fans_count}`);
          } else {
            toast.error(`${item.name}'s followers count ${fans_count} is below the required threshold`);
          }
        } else {
          console.error(`Could not extract follower count from results for ${item.platform}`);
          toast.error(`Failed to get follower data, but URL has been updated`);
        }
      } catch (err) {
        console.error(`Failed to process ${item.platform} data:`, err);
        toast.error('Failed to process data: ' + (err instanceof Error ? err.message : String(err)));
      }
      
      // Remove retry status
      setRetryingIndices((prev) => prev.filter((i) => i !== index));
      
    } catch (e: any) {
      console.error(`Retry request failed:`, e);
      toast.error('Retry request failed: ' + e.message);
      // If request fails, restore button status but保持数据为空
      setRetryingIndices((prev) => prev.filter((i) => i !== index));
    }
  }
  
  // Helper function: Update both URL and follower data in state
  const updateItemWithUrlAndFollowers = (itemId: string, url: string, fans_count: number | null, isSuccess: boolean) => {
    console.log(`Updating item with URL and followers: itemId=${itemId}, url=${url}, fans_count=${fans_count}, isSuccess=${isSuccess}`);
    
    // Update local state
    setItems(prevItems => {
      const newItems = prevItems.map(prevItem => {
        // Match by ID if available, or by platform and name as fallback
        if (prevItem.id === itemId || 
            (prevItem.id && itemId && 
             prevItem.platform === 'youtube' && 
             prevItem.name === 'UGG')) {
          console.log(`Found matching item to update, before:`, prevItem);
          const updated = { 
            ...prevItem, 
            url: url,
            followers: fans_count, 
            fans_count: fans_count, 
            success: isSuccess 
          };
          console.log(`Updated item:`, updated);
          return updated;
        }
        return prevItem;
      });
      console.log(`Updated items state with ${newItems.length} items`);
      return newItems;
    });
    
    // Update incompleteItems state - create brand new array to ensure re-render
    setIncompleteItems(prev => {
      const newArray = [...prev]; // Create new array
      let itemUpdated = false;
      
      // First try to find by ID
      const itemIndex = newArray.findIndex(it => it.id === itemId);
      
      // If not found by ID, try to find by platform and name (especially for YouTube/UGG case)
      const fallbackIndex = itemIndex === -1 ? 
        newArray.findIndex(it => it.platform === 'youtube' && it.name === 'UGG') : -1;
      
      const indexToUpdate = itemIndex >= 0 ? itemIndex : fallbackIndex;
      
      if (indexToUpdate >= 0) {
        // Replace with new object
        console.log(`Updating incompleteItems at index ${indexToUpdate}`);
        newArray[indexToUpdate] = { 
          ...newArray[indexToUpdate], 
          url: url,
          followers: fans_count, 
          fans_count: fans_count, 
          success: isSuccess
        };
        itemUpdated = true;
      }
      
      if (!itemUpdated) {
        console.log(`Warning: Could not find item to update with id=${itemId} in incompleteItems array`);
      }
      
      return newArray; // Return new array to trigger re-render
    });
    
    // Force the entire interface to re-render
    setTimeout(() => {
      forceUpdate();
      console.log("Forced UI update after state changes");
    }, 50);
  }

  // Validate URL format
  const validateUrl = (url: string): boolean => {
    try {
      // Simple URL format validation
      const urlPattern = /^(https?:\/\/)?(www\.)?[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]*)?$/;
      return urlPattern.test(url);
    } catch (e) {
      return false;
    }
  }

  // Validate follower count
  const validateFollowers = (followers: string): boolean => {
    const followerNum = Number(followers);
    return !isNaN(followerNum) && followerNum > 200;
  }

  // Handle edit button click
  const handleEdit = (item: Item, index: number) => {
    setEditingIndex(index);
    setEditingUrl(item.url || '');
    setEditingFollowers(item.followers?.toString() || '');
    setUrlError('');
    setFollowersError('');
  }

  // Handle URL input change
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEditingUrl(value);
    if (!validateUrl(value)) {
      setUrlError('Please enter a valid URL');
    } else {
      setUrlError('');
    }
  }

  // Handle follower count input change
  const handleFollowersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEditingFollowers(value);
    if (!validateFollowers(value)) {
      setFollowersError('Please enter a number greater than 200');
    } else {
      setFollowersError('');
    }
  }

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingUrl('');
    setEditingFollowers('');
    setUrlError('');
    setFollowersError('');
  }

  // Handle save edit
  const handleSaveEdit = async (item: Item) => {
    try {
      // Final validation
      if (!validateUrl(editingUrl) || !validateFollowers(editingFollowers)) {
        return; // Validation failed, do not execute save
      }

      const fans_count = Number(editingFollowers);
      
      // Update database
      const updateRes = await fetch('/api/simple-mode/update-competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_id: searchId,
          competitor_name: item.name,
          platform: item.platform,
          url: editingUrl,
          fans_count: fans_count
        }),
      });
      
      if (!updateRes.ok) {
        throw new Error('Failed to update database');
      }
      
      // Update front-end state - 使用updateItemWithUrlAndFollowers代替updateItemInState
      const isSuccess = fans_count > 200;
      updateItemWithUrlAndFollowers(item.id, editingUrl, fans_count, isSuccess);
      
      // Exit edit mode
      setEditingIndex(null);
      setEditingUrl('');
      setEditingFollowers('');
      setUrlError('');
      setFollowersError('');
      
      toast.success(`Successfully updated ${item.name}'s data`);
    } catch (e: any) {
      toast.error('Save failed: ' + e.message);
    }
  }

  // Handle delete item
  const handleDeleteItem = async (item: Item, index: number) => {
    try {
      // Delete from database
      const deleteRes = await fetch('/api/simple-mode/update-competitor', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_id: searchId,
          id: item.id
        }),
      });
      
      if (!deleteRes.ok) {
        throw new Error('Failed to delete from database');
      }
      
      // Remove from list
      setIncompleteItems(prev => prev.filter((_, i) => i !== index));
      setItems(prev => prev.filter(i => i.id !== item.id));
      
      toast.success(`Successfully deleted ${item.name}'s data`);
      
      // Exit edit mode
      handleCancelEdit();
    } catch (e: any) {
      toast.error('Delete failed: ' + e.message);
    }
  }

  // Modify handleIgnoreAll function
  const handleIgnoreAll = async () => {
    try {
      // Only keep valid items
      const validItems = items.filter(
        (item: Item) => item.followers !== undefined && item.followers !== null && item.followers >= 200
      );
      setItems(validItems);
      setIncompleteItems([]); // Clear incomplete items list
      handleGenerateEmailAfterScraping();
    } catch (e: any) {
      toast.error('Ignore failed: ' + e.message);
    }
  };

  // scraping completed, generate email
  const handleGenerateEmailAfterScraping = async () => {
    try {
      setStep('generating')
      
      const emailRes = await fetch('/api/simple-mode/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchId,
          selectedTemplate: template,
          customTemplate: '',
          contactName,
        }),
      })
      
      if (!emailRes.ok) {
        const errorText = await emailRes.text()
        throw new Error(`Email generation API error (${emailRes.status}): ${errorText}`)
      }
      
      const emailJson = (await emailRes.json()) as { content: string }
      
      setDebugResponses((prev) => [
        ...prev,
        { step: 'generate-email', data: emailJson },
      ])
      
      if (!emailJson.content) {
        throw new Error('Generated email content is empty')
      }
      
      setEmailContent(emailJson.content)
      setStep('done')
      toast.success('Email generated successfully!')
    } catch (err: any) {
      setErrorInfo(err.message)
      setStep('error')
      toast.error('Error: ' + err.message)
    }
  }

  // Main flow
  const handleGenerateEmail = async () => {
    try {
      setStep('creating')
      const createRes = await fetch('/api/simple-mode/create-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName }),
      })
      const createJson = await createRes.json()
      setDebugResponses((prev) => [
        ...prev,
        { step: 'create-search', data: createJson },
      ])
      const id = createJson.searchId
      setSearchId(id)

      setStep('analysing')
      const compRes = await fetch('/api/simple-mode/analyse-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName, searchId: id }),
      })
      const compJson = (await compRes.json()) as { competitors: string[] }
      setDebugResponses((prev) => [
        ...prev,
        { step: 'analyse-competitors', data: compJson },
      ])
      setCompetitors(compJson.competitors)

      setStep('extracting')
      const allPlatforms = ['instagram', 'linkedin', 'tiktok', 'twitter', 'youtube'] as const
      const brandPlatforms: Item[] = allPlatforms.map((p) => ({ name: brandName, platform: p, id: '' }))
      const usePlatforms =
        platformSelection === 'all platform' ? allPlatforms : [platformSelection]
      const compItems: Item[] = compJson.competitors
        .slice(1)
        .flatMap((name) => usePlatforms.map((p) => ({ name, platform: p, id: '' })))
      const allItems: Item[] = [...brandPlatforms, ...compItems]

      // Extract URL and write to database
      const itemsWithUrl: Item[] = []
      for (const it of allItems) {
        const urlRes = await fetch('/api/simple-mode/extract-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: it.name, platform: it.platform, searchId: id }),
        })
        const urlJson = (await urlRes.json()) as { name: string; platform: string; url: string; id: string; debug?: any }
        
        // 保存调试信息
        if (urlJson.debug) {
          setDebugResponses((prev) => [
            ...prev,
            { 
              step: `extract-url-debug-${it.name}-${it.platform}`, 
              data: {
                ...urlJson.debug,
                name: it.name,
                platform: it.platform
              } 
            },
          ]);
          
          // 如果有原始结果，单独记录以便清晰显示
          if (urlJson.debug.rawResults) {
            if (urlJson.debug.rawResults.social_accounts) {
              setDebugResponses((prev) => [
                ...prev,
                { 
                  step: `${it.platform}-social-accounts-raw`, 
                  data: urlJson.debug.rawResults.social_accounts
                },
              ]);
            }
            
            if (urlJson.debug.rawResults.verify_urls) {
              setDebugResponses((prev) => [
                ...prev,
                { 
                  step: `${it.platform}-verify-urls-raw`, 
                  data: urlJson.debug.rawResults.verify_urls
                },
              ]);
            }
          }
        }
        
        itemsWithUrl.push({ ...it, url: urlJson.url, id: urlJson.id })
      }
      setItems(itemsWithUrl)

      // Process competitor data
      for (const item of itemsWithUrl) {
        const updateRes = await fetch('/api/simple-mode/update-competitor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            search_id: id, // Use created search_id
            competitor_name: item.name, // Competitor name
            platform: item.platform, // Use extracted actual platform
            url: item.url, // Use extracted actual URL
          }),
        });

        const updateJson = await updateRes.json();
        setDebugResponses((prev) => [
          ...prev,
          { step: 'update-competitor', data: updateJson },
        ]);
      }

      // scraping step, call API and start polling
      setStep('scraping')
      await fetch('/api/simple-mode/scrape-followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchId: id }),
      })
      setScrapingPolling(true)
    } catch (err: any) {
      setErrorInfo(err.message)
      setStep('error')
      toast.error('Error: ' + err.message)
    }
  }

  // 在显示无效数据后启动自动更新机制
  useEffect(() => {
    if (incompleteItems.length > 0 && searchId) {
      // 设置定时器，每30秒检查一次数据库更新
      const intervalId = setInterval(async () => {
        try {
          // 重新获取当前数据
          const res = await fetch('/api/simple-mode/get-competitor-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchId })
          });
          
          if (!res.ok) {
            throw new Error('Failed to get updated data');
          }
          
          const data = await res.json();
          
          // 检查之前无效的条目是否现在有了有效数据
          let updatedCount = 0;
          
          // 创建新的incompleteItems数组，移除已有有效数据的项
          const stillIncomplete = incompleteItems.filter(oldItem => {
            // 在新数据中查找对应项
            const updatedItem = data.items.find((item: Item) => item.id === oldItem.id);
            
            if (updatedItem) {
              const followers = updatedItem.followers || updatedItem.fans_count;
              const nowValid = followers !== undefined && followers !== null && followers > 200;
              
              if (nowValid) {
                // 找到了更新，此项已有效
                updatedCount++;
                
                // 更新本地状态 - 使用数据库中的新URL和新的粉丝数据
                const newUrl = updatedItem.url || ""; // 使用数据库中的URL
                updateItemWithUrlAndFollowers(oldItem.id, newUrl, followers, true);
                console.log(`Auto-updating item: ID=${oldItem.id}, new URL=${newUrl}, new followers=${followers}`);
                return false; // 从无效列表中移除
              }
            }
            
            return true; // 保留在无效列表中
          });
          
          if (updatedCount > 0) {
            console.log(`Auto-update: Found ${updatedCount} items with new valid data`);
            toast.success(`Found ${updatedCount} new valid items`);
            
            // 更新无效列表
            setIncompleteItems(stillIncomplete);
            
            // 如果所有项都有效了，可以继续流程
            if (stillIncomplete.length === 0) {
              clearInterval(intervalId);
              handleGenerateEmailAfterScraping();
            }
          }
          
        } catch (e) {
          console.error('Auto-update check failed:', e);
        }
      }, 30000); // 30秒检查一次
      
      // 清理函数
      return () => clearInterval(intervalId);
    }
  }, [incompleteItems, searchId]);

  return (
    <div className="container" style={{ position: 'relative' }}>
      {/* Add global styles */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .edit-input {
          width: 100%;
          padding: 6px 10px;
          border-radius: 4px;
          transition: all 0.3s ease;
          font-size: 14px;
        }
        
        .edit-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
        }
        
        .error-tooltip {
          color: white;
          font-size: 12px;
          background-color: rgba(220, 38, 38, 0.9);
          padding: 4px 10px;
          border-radius: 4px;
          position: absolute;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          z-index: 10;
          animation: fadeIn 0.3s ease-in-out;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
      
      {/* Version number */}
      <div
        style={{
          position: 'fixed',
          top: 8,
          left: 12,
          fontSize: 12,
          color: '#999',
        }}
      >
        {githubVersion ? `Version: ${githubVersion}` : 'Version: loading...'}
      </div>

      {/* Theme toggle */}
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>

      <h1>Simple Mode One-Click Operation</h1>

      {step === 'idle' && (
        <div className="card">
          {/* Input form */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Target Brand Name:</label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              style={{ width: '100%', padding: 8 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Contact Name (optional):</label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              style={{ width: '100%', padding: 8 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Template:</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as any)}
              style={{ width: '100%', padding: 8 }}
            >
              <option value="YouTube Prospecting">YouTube Prospecting</option>
              <option value="Full Competitive Analysis">Full Competitive Analysis</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Search Platform for Competitors:</label>
            <select
              value={platformSelection}
              onChange={(e) =>
                setPlatformSelection(
                  e.target.value as
                    | 'all platform'
                    | 'instagram'
                    | 'linkedin'
                    | 'tiktok'
                    | 'twitter'
                    | 'youtube'
                )
              }
              style={{ width: '100%', padding: 8 }}
            >
              <option value="all platform">All Platforms</option>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
              <option value="tiktok">TikTok</option>
              <option value="twitter">Twitter</option>
              <option value="youtube">YouTube</option>
            </select>
          </div>

          <button onClick={handleGenerateEmail} disabled={!brandName} className="search-btn">
            Generate Email
          </button>
        </div>
      )}

      {step !== 'idle' && (
        <div className="card">
          {/* Progress bar */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                background: '#e5e7eb',
                borderRadius: 6,
                height: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  background: '#3b82f6',
                  height: '100%',
                  transition: 'width 30ms linear',
                }}
              />
            </div>
            <p style={{ marginTop: 8, fontWeight: 600 }}>
              {progress}% – {step.charAt(0).toUpperCase() + step.slice(1)}
            </p>
          </div>

          {/* Analysis results */}
          {step === 'analysing' && (
            <ul>
              {competitors.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}

          {/* Error */}
          {step === 'error' && <p style={{ color: 'red' }}>Error: {errorInfo}</p>}
        </div>
      )}

      {/* User intervention: display invalid items and retry options */}
      {incompleteItems.length > 0 && (
        <div className="card">
          <h3>Invalid Data Detected – Action Required</h3>
          <p>
            The following items have invalid data (followers are null or not greater than 200).
            Please choose to retry for each link individually or ignore all invalid data:
          </p>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {incompleteItems.map((item, index) => {
              // Determine whether to display success mark
              console.log(`Rendering item ${index} - name: ${item.name}, platform: ${item.platform}, followers: ${item.followers}, fans_count: ${item.fans_count}, success: ${item.success}`);
              
              // Check for valid followers in both possible properties
              const followers = item.followers || item.fans_count;
              const hasValidFollowers = 
                item.success === true || // If success flag is explicitly set to true
                (followers !== undefined && followers !== null && followers > 200);
              
              console.log(`Item ${index} hasValidFollowers: ${hasValidFollowers}, combined followers value: ${followers}`);
              
              // Check if currently editing this item
              const isEditing = editingIndex === index;
              
              // Calculate if Save button is available
              const saveEnabled = !urlError && !followersError && editingUrl && editingFollowers;
              
              return (
                <li
                  key={`${item.id || index}-${index}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    flexDirection: 'column'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    width: '100%', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: isEditing ? '8px' : '0'
                  }}>
                    {!isEditing ? (
                      <span>
                        Brand: {item.name} | Platform: {item.platform} | Link: {item.url ? item.url : 'N/A'} | Followers:{' '}
                        {followers === null || followers === undefined ? 'null' : followers}
                      </span>
                    ) : (
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        width: '80%',
                        gap: '8px'
                      }}>
                        <div>Brand: {item.name} | Platform: {item.platform}</div>
                        <div style={{ position: 'relative', marginBottom: '30px' }}>
                          <div>Link:</div>
                          <input
                            type="text"
                            value={editingUrl}
                            onChange={handleUrlChange}
                            style={{ 
                              width: '100%', 
                              padding: '4px 8px',
                              border: urlError ? '1px solid red' : '1px solid #ccc'
                            }}
                            placeholder="Enter URL"
                          />
                          {urlError && (
                            <div style={{ 
                              color: 'white', 
                              fontSize: '12px',
                              backgroundColor: 'rgba(220, 38, 38, 0.9)',
                              padding: '4px 10px',
                              borderRadius: '3px',
                              position: 'absolute',
                              top: '27px',
                              right: '0',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                              zIndex: 10,
                              animation: 'fadeIn 0.2s ease-in-out',
                              display: 'flex',
                              alignItems: 'center',
                              minHeight: '24px'
                            }}>
                              <span style={{ marginRight: '4px' }}>⚠️</span> {urlError}
                            </div>
                          )}
                        </div>
                        <div style={{ position: 'relative', marginBottom: '30px' }}>
                          <div>Followers:</div>
                          <input
                            type="text"
                            value={editingFollowers}
                            onChange={handleFollowersChange}
                            style={{ 
                              width: '100%', 
                              padding: '4px 8px',
                              border: followersError ? '1px solid red' : '1px solid #ccc'
                            }}
                            placeholder="Enter follower count"
                          />
                          {followersError && (
                            <div style={{ 
                              color: 'white', 
                              fontSize: '12px',
                              backgroundColor: 'rgba(220, 38, 38, 0.9)',
                              padding: '4px 10px',
                              borderRadius: '3px',
                              position: 'absolute',
                              top: '27px',
                              right: '0',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                              zIndex: 10,
                              animation: 'fadeIn 0.2s ease-in-out',
                              display: 'flex',
                              alignItems: 'center',
                              minHeight: '24px'
                            }}>
                              <span style={{ marginRight: '4px' }}>⚠️</span> {followersError}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {!isEditing ? (
                        <>
                          {hasValidFollowers ? (
                            <span style={{ padding: '4px 8px', fontSize: '0.8rem' }}>✅</span>
                          ) : (
                            <button
                              onClick={() => handleRetry(item, index)}
                              disabled={retryingIndices.includes(index)}
                              className={`edit-btn btn-retry`}
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.8rem',
                                backgroundColor: retryingIndices.includes(index) ? '#ccc' : undefined
                              }}
                            >
                              {retryingIndices.includes(index) ? 'Retrying...' : 'Retry'}
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(item, index)}
                            className="edit-btn btn-edit"
                          >
                            Edit
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={handleCancelEdit}
                            className="edit-btn btn-cancel"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(item)}
                            disabled={!saveEnabled}
                            className="edit-btn btn-save"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item, index)}
                            className="edit-btn btn-delete"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <button 
            onClick={handleIgnoreAll} 
            className="search-btn"
            disabled={editingIndex !== null}
            style={{
              opacity: editingIndex !== null ? 0.5 : 1,
              cursor: editingIndex !== null ? 'not-allowed' : 'pointer'
            }}
          >
            Ignore Invalid Data & Continue
          </button>
        </div>
      )}

      {/* Display generated email */}
      {step === 'done' && (
        <div className="card">
          <h2>Generated Email</h2>
          <div style={{ background: '#f3f4f6', padding: 16, borderRadius: 4 }}>
            <ReactMarkdown>{emailContent}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Debug Responses */}
      <div className="card">
        <h3>Debug Information</h3>
        <div
          ref={debugContainerRef}
          style={{
            background: 'black',
            color: '#39FF14',
            padding: '8px',
            height: '300px', // 增加高度
            overflowY: 'auto',
            fontFamily: 'monospace',
            resize: 'vertical'
          }}
        >
          {debugResponses.map((dbg, idx) => (
            <div key={idx} style={{ 
              marginBottom: '12px',
              borderBottom: '1px solid #333',
              paddingBottom: '8px'
            }}>
              {/* 根据不同类型的日志使用不同的样式 */}
              {dbg.step.includes('social-accounts-raw') ? (
                <div>
                  <strong style={{ color: '#FF9966' }}>{dbg.step}:</strong>
                  <pre style={{ 
                    whiteSpace: 'pre-wrap', 
                    margin: 0,
                    background: '#111',
                    padding: '8px',
                    borderRadius: '4px',
                    color: '#66CCFF' // 蓝色显示URL
                  }}>
                    {Array.isArray(dbg.data) 
                      ? dbg.data.map((url, i) => `[${i+1}] ${url}`).join('\n') 
                      : JSON.stringify(dbg.data, null, 2)}
                  </pre>
                </div>
              ) : dbg.step.includes('verify-urls-raw') ? (
                <div>
                  <strong style={{ color: '#FFCC00' }}>{dbg.step}:</strong>
                  <pre style={{ 
                    whiteSpace: 'pre-wrap', 
                    margin: 0,
                    background: '#111',
                    padding: '8px',
                    borderRadius: '4px',
                    color: '#66FF99' // 绿色显示验证URL
                  }}>
                    {Array.isArray(dbg.data) 
                      ? dbg.data.map((url, i) => `[${i+1}] ${url}`).join('\n') 
                      : JSON.stringify(dbg.data, null, 2)}
                  </pre>
                </div>
              ) : dbg.step.includes('extract-url-debug') ? (
                <div>
                  <strong style={{ color: '#CC99FF' }}>{dbg.step}:</strong>
                  {dbg.data.steps && (
                    <div style={{ marginLeft: '16px', color: '#CCCCCC' }}>
                      {dbg.data.steps.map((step: string, i: number) => (
                        <div key={i} style={{ marginBottom: '4px' }}>• {step}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
              <strong>{dbg.step}:</strong>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {JSON.stringify(dbg.data, null, 2)}
              </pre>
                </div>
              )}
            </div>
          ))}
        </div>
        
        {/* 添加刷新按钮 */}
        <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
          <button 
            onClick={() => {
              setDebugResponses([]);
            }}
            style={{
              padding: '4px 8px',
              background: '#333',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear Logs
          </button>
          
          <span style={{ fontSize: '12px', color: '#666' }}>
            Total: {debugResponses.length} logs
          </span>
        </div>
      </div>
    </div>
  )
}
