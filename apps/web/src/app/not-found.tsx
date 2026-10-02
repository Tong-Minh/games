import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link
        href="/"
        className="mt-3 inline-block text-indigo-600 hover:underline dark:text-indigo-400"
      >
        Back to all games
      </Link>
    </div>
  );
}
