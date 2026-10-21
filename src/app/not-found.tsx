import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <h1 className="text-[22px] font-bold">That page is not here</h1>
        <p className="mt-2 text-[14px] text-muted">The simulation may have been renamed.</p>
        <Link href="/simulations/" prefetch={false} className="mt-6 inline-block rounded-full bg-brand px-6 py-3
                                              text-[14px] font-semibold text-white hover:bg-brand-deep">
          All simulations
        </Link>
      </div>
    </main>
  );
}
