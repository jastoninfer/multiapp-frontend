export function ForbiddenMessage({ message = "You do not have access to this page." }: { message?: string }) {
  return (
    <section className="panel narrow">
      <h1>Forbidden</h1>
      <p className="muted">{message}</p>
    </section>
  );
}
