'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

async function fetchUsers(): Promise<User[]> {
  const response = await fetch('/api/v1/users');
  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }
  const data = await response.json();
  return data.data;
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'admin':
      return 'bg-purple-100 text-purple-800';
    case 'user':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export default function UsersPage() {
  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  if (isLoading) {
    return (
      <main className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Users</h1>
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Users</h1>
          <p className="text-red-600">Error: {error.message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Users</h1>
          <Link href="/" className="text-primary-600 hover:text-primary-700">
            ← Back to Home
          </Link>
        </div>

        {users && users.length === 0 ? (
          <p className="text-gray-600">No users found.</p>
        ) : (
          <div className="space-y-4">
            {users?.map((user) => (
              <div
                key={user.id}
                className="p-4 border rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{user.name}</h3>
                    <p className="text-sm text-gray-600">{user.email}</p>
                    <p className="text-sm text-gray-600">
                      Joined: {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded ${getRoleColor(user.role)}`}>
                    {user.role}
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
