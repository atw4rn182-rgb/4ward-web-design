type PageHeaderProps = {
  title: string;
  description: string;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="mb-5 sm:mb-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
    </header>
  );
}
