'use client';

import { useState, useEffect } from 'react';

export default function PerplexityUrlDemo() {
  const [brand, setBrand] = useState('');
  const [region, setRegion] = useState('North American');
  const [platform, setPlatform] = useState('youtube');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Array<{type: string, content: string, timestamp: Date}>>([]);

  const platforms = ['youtube', 'instagram', 'linkedin', 'twitter', 'tiktok'];
  const regions = ['North American', 'Global', 'European', 'Asian', 'Latin American'];

  const fetchUrl = async () => {
    if (!brand) {
      setError('Please enter a brand name');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/perplexity_url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brand,
          region,
          platform,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      setResult(data);
      
      // Add Anthropic and Perplexity responses to history
      const newResponses = [...responses];
      
      // Add Anthropic result first (latest shows at the top)
      newResponses.unshift({
        type: 'Anthropic (Final URL)',
        content: data.url,
        timestamp: new Date()
      });
      
      // Then add Perplexity result
      if (data.perplexityContent) {
        newResponses.unshift({
          type: 'Perplexity (URL Candidates)',
          content: data.perplexityContent,
          timestamp: new Date()
        });
      }
      
      setResponses(newResponses);
      
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Social Media URL Extraction Demo</h1>
      
      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4 mb-6">
          <div>
            <label htmlFor="brand" className="block mb-2 font-medium">
              Brand Name
            </label>
            <input
              id="brand"
              type="text"
              className="w-full px-4 py-2 rounded border"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g., Coca Cola"
            />
          </div>

          <div>
            <label htmlFor="region" className="block mb-2 font-medium">
              Region
            </label>
            <select
              id="region"
              className="w-full px-4 py-2 rounded border"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="platform" className="block mb-2 font-medium">
              Platform
            </label>
            <select
              id="platform"
              className="w-full px-4 py-2 rounded border"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-blue-300"
          onClick={fetchUrl}
          disabled={loading || !brand}
        >
          {loading ? 'Processing...' : 'Get URL'}
        </button>

        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
            Error: {error}
          </div>
        )}

        {result && (
          <div className="mt-6 p-4 bg-gray-50 rounded">
            <h2 className="text-lg font-semibold mb-2">Current Result:</h2>
            <div className="space-y-2">
              <div>
                <span className="font-medium">Brand:</span> {result.brand}
              </div>
              <div>
                <span className="font-medium">Region:</span> {result.region}
              </div>
              <div>
                <span className="font-medium">Platform:</span> {result.platform}
              </div>
              <div>
                <span className="font-medium">URL:</span>{' '}
                {result.url === 'NO_URL_FOUND' ? (
                  <span className="text-orange-500">No URL found</span>
                ) : (
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all"
                  >
                    {result.url}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
        
        {responses.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-4">Processing History (newest at top):</h2>
            <div className="space-y-4">
              {responses.map((response, index) => (
                <div key={index} className="p-4 border rounded">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className={`font-medium ${response.type.includes('Anthropic') ? 'text-purple-700' : 'text-green-700'}`}>
                      {response.type}
                    </h3>
                    <span className="text-gray-500 text-sm">
                      {formatTime(response.timestamp)}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">
                    {response.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 