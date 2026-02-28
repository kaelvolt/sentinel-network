'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

interface Source {
  id: string;
  name: string;
  type: string;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
}

async function fetchSources(): Promise<Source[]> {
  const response = await fetch('/api/v1/sources');
  if (!response.ok) {
    throw new Error('Failed to fetch sources');
  }
  const data = await response.json();
  return data.data;
}

export default function SourcesPage() {
  const { data: sources, isLoading, error } = useQuery({
    queryKey: ['sources'],
    queryFn: fetchSources,
  });

  if (isLoading) {
    return (
      <main className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Sources</h1>
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Sources</h1>
          <p className="text-red-600">Error: {error.message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Sources</h1>
          <Link
            href="/"
            className="text-primary-600 hover:text-primary-700"
          >
            Back to Home
          </Link>
        </div>

        {sources && sources.length === 0 ? (
          <p className="text-gray-600">No sources configured yet.</p>
        ) : (
          <div className="space-y-4">
            {sources?.map((source) => (
              <div
                key={source.id}
                className="p-4 border rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{source.name}</h3>
                    <p className="text-sm text-gray-600">Type: {source.type}</p>
                    <p className="text-sm text-gray-600">Status: {source.status}</p>
                    {source.lastSyncAt && (
                      <p className="text-sm text-gray-600">
                        Last sync: {new Date(source.lastSyncAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      source.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : source.status === 'error'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {source.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
