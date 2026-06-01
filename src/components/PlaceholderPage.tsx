export function PlaceholderPage({ title, message }: { title: string; message: string }) {
  return (
    <section className="panel narrow">
      <h1>{title}</h1>
      <p className="muted">{message}</p>
    </section>
  );
}
