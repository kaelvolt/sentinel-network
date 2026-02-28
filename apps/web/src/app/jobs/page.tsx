'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

interface Job {
  id: string;
  type: string;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
}

async function fetchJobs(): Promise<Job[]> {
  const response = await fetch('/api/v1/jobs');
  if (!response.ok) {
    throw new Error('Failed to fetch jobs');
  }
  const data = await response.json();
  return data.data;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    case 'running':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export default function JobsPage() {
  const { data: jobs, isLoading, error } = useQuery({
    queryKey: ['jobs'],
    queryFn: fetchJobs,
  });

  if (isLoading) {
    return (
      <main className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Jobs</h1>
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Jobs</h1>
          <p className="text-red-600">Error: {error.message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Jobs</h1>
          <Link href="/" className="text-primary-600 hover:text-primary-700">
            ← Back to Home
          </Link>
        </div>

        {jobs && jobs.length === 0 ? (
          <p className="text-gray-600">No jobs in the queue.</p>
        ) : (
          <div className="space-y-4">
            {jobs?.map((job) => (
              <div
                key={job.id}
                className="p-4 border rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{job.type}</h3>
                    <p className="text-sm text-gray-600">ID: {job.id}</p>
                    <p className="text-sm text-gray-600">Priority: {job.priority}</p>
                    <p className="text-sm text-gray-600">
                      Attempts: {job.attempts}/{job.maxAttempts}
                    </p>
                    <p className="text-sm text-gray-600">
                      Created: {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded ${getStatusColor(job.status)}`}>
                    {job.status}
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
