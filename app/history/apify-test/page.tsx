'use client'

import { useState } from 'react'

export default function ApifyTestPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const testApify = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/apify/twitter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxItems: 5,
          sort: 'Latest',
          startUrls: [
            'https://x.com/TechCrunch'
          ]
        })
      })
      const data = await res.json()
      setResult(data)
    } catch (e: any) {
      setResult({ error: e.message })
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-100">
      <h1 className="text-2xl font-bold mb-6">Apify Connection Test</h1>
      <button
        onClick={testApify}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Testing...' : 'Test Apify Connection'}
      </button>
      {result && (
        <pre className="mt-6 bg-white p-4 rounded shadow w-full max-w-2xl overflow-auto text-sm">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  )
}