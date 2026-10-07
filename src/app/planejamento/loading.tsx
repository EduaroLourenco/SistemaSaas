export default function Loading() {
  return (
    <div className="p-8 space-y-5" role="status" aria-busy="true">
      <div className="h-8 w-56 bg-panel-3 animate-pulse rounded" />
      <p className="text-ink-2">Preparando seu calendário…</p>
      <div className="h-[500px] bg-panel animate-pulse rounded-xl border border-line" />
    </div>
  );
}
