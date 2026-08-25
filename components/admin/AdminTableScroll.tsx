export function AdminTableScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-paper shadow-soft [-webkit-overflow-scrolling:touch]">
      {children}
    </div>
  );
}
