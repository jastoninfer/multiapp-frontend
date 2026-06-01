import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Settings } from "lucide-react";
import { createTenant, listAdminTenants } from "../api/tenant";
import { getFriendlyError } from "../api/client";
import { isPlatformAdmin } from "../auth/authorization";
import { useAuth } from "../auth/AuthContext";
import { ErrorMessage } from "../components/ErrorMessage";
import { ForbiddenMessage } from "../components/ForbiddenMessage";
import { StatusBadge } from "../components/StatusBadge";
import { useCurrentTenant } from "../hooks/useCurrentTenant";
import { queryKeys } from "../queryKeys";
import { formatDate } from "../ui/format";

export function AdminTenantsPage() {
  const { updateTenantId } = useAuth();
  const { profile, tenants: memberships } = useCurrentTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const platformAdmin = isPlatformAdmin(profile, memberships);
  const tenants = useQuery({ queryKey: queryKeys.adminTenants({ page: 0 }), queryFn: listAdminTenants, enabled: platformAdmin });
  const create = useMutation({
    mutationFn: () => createTenant(name.trim()),
    onSuccess: () => {
      setName("");
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTenants({ page: 0 }) });
    }
  });

  if (!platformAdmin) return <ForbiddenMessage message="Platform tenant administration is visible only to platform admins." />;

  function onCreate(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  function manageTenant(tenantId: string) {
    updateTenantId(tenantId);
    navigate("/tenant");
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="section-heading">
          <h1>Platform tenants</h1>
          <button type="button" className="secondary" onClick={() => setShowCreate((value) => !value)}>
            <Plus size={16} />Create tenant
          </button>
        </div>
        <ErrorMessage message={tenants.error ? getFriendlyError(tenants.error) : undefined} />
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {tenants.data?.items.map((tenant) => (
              <tr key={tenant.id}>
                <td>{tenant.name}</td>
                <td><StatusBadge value={tenant.status} /></td>
                <td>{formatDate(tenant.createdAt)}</td>
                <td className="table-actions">
                  <button type="button" className="secondary" onClick={() => updateTenantId(tenant.id)}>Select</button>
                  <button type="button" onClick={() => manageTenant(tenant.id)}><Settings size={16} />Manage</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {showCreate && <section className="panel">
        <h2>Create tenant</h2>
        <form className="inline-form" onSubmit={onCreate}>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tenant name" />
          <button type="submit" disabled={create.isPending}>Create</button>
        </form>
        <ErrorMessage message={create.error ? getFriendlyError(create.error) : undefined} />
      </section>}
    </div>
  );
}
