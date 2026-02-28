import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Kael Platform</h1>
        <p className="text-lg text-gray-600 mb-8">
          Welcome to the Kael Platform. A modern data platform for analysis and insights.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/sources"
            className="p-6 border rounded-lg hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-semibold mb-2">Sources</h2>
            <p className="text-gray-600">Manage your data sources and connections</p>
          </Link>

          <Link
            href="/jobs"
            className="p-6 border rounded-lg hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-semibold mb-2">Jobs</h2>
            <p className="text-gray-600">View and manage background jobs</p>
          </Link>

          <Link
            href="/analysis"
            className="p-6 border rounded-lg hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-semibold mb-2">Analysis</h2>
            <p className="text-gray-600">Run data analysis and view results</p>
          </Link>

          <Link
            href="/users"
            className="p-6 border rounded-lg hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-semibold mb-2">Users</h2>
            <p className="text-gray-600">Manage platform users and permissions</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
