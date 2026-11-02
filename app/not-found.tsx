import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60dvh] place-items-center px-4">
      <div className="text-center">
        <p className="text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-1 text-lg font-semibold text-ink">We couldn’t find that page</h1>
        <p className="mt-1 text-sm text-muted">It may have been moved, or you may not have access to it.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
          Go to your home
        </Link>
      </div>
    </main>
  );
}
