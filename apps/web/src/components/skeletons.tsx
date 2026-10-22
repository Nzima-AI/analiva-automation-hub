/** Loading placeholders shaped like the pages they stand in for. */
export function PageSkeleton({ stats = 4, wide = true }: { stats?: number; wide?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-7 space-y-2.5">
        <div className="skeleton h-3.5 w-28" />
        <div className="skeleton h-8 w-72" />
      </div>
      {stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="rounded-2xl border border-line bg-panel p-4">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton mt-3 h-7 w-32" />
              <div className="skeleton mt-2.5 h-3 w-20" />
            </div>
          ))}
        </div>
      ) : null}
      <div className={`mt-6 grid gap-6 ${wide ? "xl:grid-cols-3" : ""}`}>
        <div className="rounded-2xl border border-line bg-panel p-5 xl:col-span-2">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton mt-5 h-56 w-full" />
        </div>
        {wide ? (
          <div className="space-y-3 rounded-2xl border border-line bg-panel p-5">
            <div className="skeleton h-4 w-28" />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="skeleton h-9 w-full" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="mt-2 space-y-2 rounded-2xl border border-line bg-panel p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-4 flex-1" />
          <div className="skeleton h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
