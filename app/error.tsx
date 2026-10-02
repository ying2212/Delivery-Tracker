"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4">
      <div className="card max-w-md p-6 text-center">
        <h2 className="font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-slate-500">{error.message}</p>
        <button onClick={reset} className="btn-secondary mt-4">Try again</button>
      </div>
    </main>
  );
}
