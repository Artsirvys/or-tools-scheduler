"use client"

import { useState } from "react"

export default function TestAPIPage() {
  const [teamId, setTeamId] = useState("")
  const [results, setResults] = useState<{
    teams?: { status: number; data: unknown };
    members?: { status: number; data: unknown };
    shifts?: { status: number; data: unknown };
    error?: string;
  } | null>(null)
  const [loading, setLoading] = useState(false)

  const testEndpoints = async () => {
    if (!teamId) return
    
    setLoading(true)
    setResults(null)
    
    try {
      // Test the main teams endpoint
      const teamsResponse = await fetch(`/api/teams/${teamId}`)
      const teamsData = await teamsResponse.json()
      
      // Test the members endpoint
      const membersResponse = await fetch(`/api/teams/${teamId}/members`)
      const membersData = await membersResponse.json()
      
      // Test the shifts endpoint
      const shiftsResponse = await fetch(`/api/teams/${teamId}/shifts`)
      const shiftsData = await shiftsResponse.json()
      
      setResults({
        teams: { status: teamsResponse.status, data: teamsData },
        members: { status: membersResponse.status, data: membersData },
        shifts: { status: shiftsResponse.status, data: shiftsData }
      })
    } catch (error) {
      setResults({ error: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">API Endpoint Test</h1>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Team ID:</label>
          <input
            type="text"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            placeholder="Enter team ID to test"
            className="border rounded px-3 py-2 w-full"
          />
        </div>
        
        <button
          onClick={testEndpoints}
          disabled={!teamId || loading}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Testing..." : "Test Endpoints"}
        </button>
        
        {results && (
          <div className="mt-6 space-y-4">
            <h2 className="text-xl font-semibold">Results:</h2>
            
            {results.error ? (
              <div className="bg-red-50 border border-red-200 rounded p-4">
                <p className="text-red-800">Error: {results.error}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-50 border rounded p-4">
                  <h3 className="font-semibold">Teams Endpoint:</h3>
                  <p>Status: {results.teams?.status ?? 'N/A'}</p>
                  <pre className="mt-2 text-sm bg-white p-2 rounded overflow-auto">
                    {JSON.stringify(results.teams?.data ?? {}, null, 2)}
                  </pre>
                </div>
                
                <div className="bg-gray-50 border rounded p-4">
                  <h3 className="font-semibold">Members Endpoint:</h3>
                  <p>Status: {results.members?.status ?? 'N/A'}</p>
                  <pre className="mt-2 text-sm bg-white p-2 rounded overflow-auto">
                    {JSON.stringify(results.members?.data ?? {}, null, 2)}
                  </pre>
                </div>
                
                <div className="bg-gray-50 border rounded p-4">
                  <h3 className="font-semibold">Shifts Endpoint:</h3>
                  <p>Status: {results.shifts?.status ?? 'N/A'}</p>
                  <pre className="mt-2 text-sm bg-white p-2 rounded overflow-auto">
                    {JSON.stringify(results.shifts?.data ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
