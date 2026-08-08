import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";

export const metadata = {
  title: "Files | 4Ward Admin",
  robots: { index: false, follow: false },
};

const FILES = [
  { name: "accufab-logo.svg", client: "Accu-Fab NM", kind: "Logo", size: "48 KB" },
  { name: "blackmesa-brand.pdf", client: "Black Mesa Welding", kind: "Document", size: "1.2 MB" },
  { name: "desert-peak-photos.zip", client: "Desert Peak HVAC", kind: "Image", size: "8.4 MB" },
];

export default function FilesPage() {
  return (
    <div>
      <PageHeader
        title="Files"
        description="Uploaded logos and assets. Placeholder list until uploaded_files storage is wired."
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total files" value="26" hint="Across all clients" />
        <StatCard label="Logos" value="11" hint="Brand marks on file" />
        <StatCard label="Storage used" value="142 MB" hint="Placeholder estimate" />
      </section>
      <div className="grid gap-3">
        {FILES.map((file) => (
          <article
            key={file.name}
            className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-paper px-5 py-4 shadow-soft"
          >
            <div>
              <p className="font-semibold text-ink">{file.name}</p>
              <p className="mt-0.5 text-sm text-muted">
                {file.client} · {file.kind}
              </p>
            </div>
            <span className="text-sm font-medium text-muted">{file.size}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
