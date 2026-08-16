import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { EmptyState } from "@/components/admin/EmptyState";
import {
  formatBytes,
  getFiles,
  labelStatus,
  relatedCompany,
} from "@/lib/supabase/queries";

export const metadata = {
  title: "Files | 4Ward Admin",
  robots: { index: false, follow: false },
};

export default async function FilesPage() {
  const { data: files } = await getFiles();
  const logos = files.filter((row) => row.kind === "logo").length;
  const storage = files.reduce((sum, row) => sum + (row.byte_size || 0), 0);

  return (
    <div>
      <PageHeader
        title="Files"
        description="Uploaded logos and assets from the uploaded_files table."
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total files" value={String(files.length)} hint="Across all clients" />
        <StatCard label="Logos" value={String(logos)} hint="Brand marks on file" />
        <StatCard label="Storage used" value={formatBytes(storage)} hint="From recorded file sizes" />
      </section>
      {files.length === 0 ? (
        <EmptyState
          title="No files yet"
          detail="Client uploads will show here when they are saved to Supabase."
        />
      ) : (
        <div className="grid gap-3">
          {files.map((file) => (
            <article
              key={file.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-paper px-5 py-4 shadow-soft"
            >
              <div>
                <p className="font-semibold text-ink">{file.file_name}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {relatedCompany(file.customers)} · {labelStatus(file.kind)}
                </p>
              </div>
              <span className="text-sm font-medium text-muted">
                {formatBytes(file.byte_size)}
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
