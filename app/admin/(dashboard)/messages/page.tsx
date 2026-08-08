import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";

export const metadata = {
  title: "Messages | 4Ward Admin",
  robots: { index: false, follow: false },
};

const MESSAGES = [
  {
    from: "Tina Reed",
    subject: "Ready to start Tier 1",
    preview: "We signed the agreement and uploaded our logo…",
    time: "1h ago",
  },
  {
    from: "Maria Lopez",
    subject: "Homepage copy feedback",
    preview: "Can we tighten the services section headline?",
    time: "Yesterday",
  },
  {
    from: "James Ortiz",
    subject: "Quote form routing",
    preview: "Please send welding quotes to shop@…",
    time: "2 days ago",
  },
];

export default function MessagesPage() {
  return (
    <div>
      <PageHeader
        title="Messages"
        description="Client communication inbox preview. Placeholder threads for the UI shell."
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Unread" value="3" hint="Needs response" trend="New" />
        <StatCard label="Open threads" value="8" hint="Active conversations" />
        <StatCard label="Avg reply time" value="4.2h" hint="Placeholder metric" />
      </section>
      <div className="space-y-3">
        {MESSAGES.map((msg) => (
          <article
            key={msg.subject}
            className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{msg.from}</p>
                <p className="mt-1 font-display text-base font-bold tracking-tight">
                  {msg.subject}
                </p>
                <p className="mt-1 text-sm text-muted">{msg.preview}</p>
              </div>
              <span className="text-xs font-medium text-muted">{msg.time}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
