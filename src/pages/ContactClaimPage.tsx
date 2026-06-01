import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { claimContact } from "../api/contacts";
import { getFriendlyError } from "../api/client";
import { ErrorMessage } from "../components/ErrorMessage";
import { useToast } from "../components/ToastProvider";
import { queryKeys } from "../queryKeys";

export function ContactClaimPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [form, setForm] = useState({ code: "", email: "", phone: "" });
  const mutation = useMutation({
    mutationFn: () => claimContact({
      code: form.code.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined
    }),
    onSuccess: () => {
      notify("Contact linked.");
      setForm({ code: "", email: "", phone: "" });
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    }
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <section className="panel narrow">
      <h1>Claim contact with code</h1>
      <form className="grid-form single" onSubmit={onSubmit}>
        <label>Code<input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Phone<input placeholder="+15551234567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <button type="submit" disabled={mutation.isPending}>Claim</button>
      </form>
      <ErrorMessage message={mutation.error ? getFriendlyError(mutation.error) : undefined} />
    </section>
  );
}
