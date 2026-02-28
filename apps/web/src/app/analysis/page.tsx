'use client';

import Link from 'next/link';

export default function AnalysisPage() {
  return (
    <main className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Analysis</h1>
          <Link href="/" className="text-primary-600 hover:text-primary-700">
            ← Back to Home
          </Link>
        </div>

        <p className="text-gray-600 mb-8">
          Data analysis tools and pipelines will be available here.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">Pipelines</h3>
            <p className="text-sm text-gray-600">
              Create and manage data processing pipelines
            </p>
          </div>

          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">Transformations</h3>
            <p className="text-sm text-gray-600">
              Define data transformation rules
            </p>
          </div>

          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">Aggregations</h3>
            <p className="text-sm text-gray-600">
              Configure aggregation functions
            </p>
          </div>

          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">Reports</h3>
            <p className="text-sm text-gray-600">
              View and export analysis reports
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
