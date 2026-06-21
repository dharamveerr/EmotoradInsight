"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Topbar from "@/components/Topbar";
import SelectGlass from "@/components/SelectGlass";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Client {
  id: string;
  name: string;
  slug: string | null;
  subdomain: string | null;
  org_id: string | null;
  source_client_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  tree_count?: number;
  user_count?: number;
}

function fmt(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleString();
}

function AddClientModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: "", subdomain: "", org_id: "", client_id: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const allFilled = !!(form.name.trim() && form.subdomain.trim() && form.org_id.trim() && form.client_id.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!allFilled) { setError("All fields are required"); return; }
    setBusy(true); setError("");
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name.trim(), subdomain: form.subdomain.trim(), org_id: form.org_id.trim(), client_id: form.client_id.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setBusy(false); setError(data.error || "Failed to create client"); return; }
    onSuccess();
    onClose();
  }

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="cl-modal bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-5 border-b border-white/5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-lg">🏢</div>
          <div>
            <h3 className="text-base font-bold text-white">Add Client</h3>
          </div>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-300">{error}</div>}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Client name <span className="text-red-400">*</span></label>
            <input autoFocus value={form.name} onChange={set("name")} placeholder="e.g. Leverage" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Subdomain <span className="text-red-400">*</span></label>
            <input value={form.subdomain} onChange={set("subdomain")} placeholder="e.g. leverage" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">org_id <span className="text-red-400">*</span></label>
              <input value={form.org_id} onChange={set("org_id")} placeholder="source org id" className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">client_id <span className="text-red-400">*</span></label>
              <input value={form.client_id} onChange={set("client_id")} placeholder="source client id" className={`${inputCls} font-mono`} />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="cl-cancel flex-1 py-2.5 rounded-xl border border-white/15 text-sm font-medium text-gray-200 hover:border-white/40 transition-all" style={{ background: "rgba(255,255,255,0.05)" }}>Cancel</button>
            <button type="submit" disabled={busy || !allFilled} className="cl-create-btn flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-semibold text-white border border-slate-500/50 shadow-sm tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] cursor-pointer">
              {busy ? "Creating…" : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClientListPage() {
  const { data, isLoading, mutate } = useSWR<{ clients: Client[]; isSuperAdmin: boolean }>("/api/clients", fetcher);
  const clients = data?.clients || [];
  const [selected, setSelected] = useState<Client | null>(null);
  const [edit, setEdit] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.subdomain || "").toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar title="Client List" subtitle="All tenants — view and update details" />
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-7 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or subdomain…"
              className="pl-9 pr-4 py-2.5 text-sm bg-white/5 border border-white/10 rounded-xl text-gray-200 placeholder-gray-500 focus:outline-none focus:border-white/25 w-72 transition-colors"
            />
          </div>
          <div className="flex gap-3">
          <button
            onClick={() => setShowAddClient(true)}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-white/5 border border-white/10 text-gray-200 rounded-xl hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
            Add Client
          </button>
          <button
            onClick={() => setShowCopy(true)}
            className="cl-copybtn flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:from-emerald-400 hover:to-teal-500 active:scale-95 transition-all shadow-lg shadow-emerald-700/30 ring-1 ring-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            Copy Tree
          </button>
          </div>
        </div>
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-gray-400 border-b border-white/10">
                <th className="px-5 py-3 font-semibold">Client name</th>
                <th className="px-5 py-3 font-semibold">Subdomain</th>
                <th className="px-5 py-3 font-semibold">org_id</th>
                <th className="px-5 py-3 font-semibold">client_id</th>
                <th className="px-5 py-3 font-semibold text-center">Trees</th>
                <th className="px-5 py-3 font-semibold text-center">Users</th>
                <th className="px-5 py-3 font-semibold">Last synced</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <>
                  {[...Array(5)].map((_, i) => (
                    <tr key={`skeleton-${i}`} className="border-b border-white/5">
                      {[...Array(7)].map((_, j) => (
                        <td key={`cell-${j}`} className="px-5 py-3"><div className="skeleton h-4 w-24 rounded"></div></td>
                      ))}
                    </tr>
                  ))}
                </>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-500">{search ? "No clients match your search" : "No clients yet"}</td></tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => { setSelected(c); setEdit(false); }}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 font-semibold text-white">{c.name}</td>
                    <td className="px-5 py-3 text-gray-400">{c.subdomain || "—"}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-400">{c.org_id || "—"}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-400">{c.source_client_id || "—"}</td>
                    <td className="px-5 py-3 text-center text-gray-300">{c.tree_count ?? 0}</td>
                    <td className="px-5 py-3 text-center text-gray-300">{c.user_count ?? 0}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{fmt(c.last_synced_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {selected && (
        <ClientDetail
          client={selected}
          edit={edit}
          onEdit={() => setEdit(true)}
          onBack={() => setEdit(false)}
          onClose={() => { setSelected(null); setEdit(false); }}
          onSaved={(updated) => { setSelected(updated); setEdit(false); mutate(); }}
        />
      )}

      {showAddClient && (
        <AddClientModal onClose={() => setShowAddClient(false)} onSuccess={() => mutate()} />
      )}
      {showCopy && (
        <CopyTreeModal clients={clients} onClose={() => setShowCopy(false)} onSuccess={(msg) => { setToast(msg); mutate(); }} />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] animate-fade-in">
          <div className="cl-toast flex items-center gap-2 px-5 py-3 bg-slate-800 text-white text-sm font-medium rounded-xl shadow-xl shadow-black/30 border border-slate-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 shrink-0"><path d="M20 6L9 17l-5-5" /></svg>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function CopyTreeModal({ clients, onClose, onSuccess }: { clients: Client[]; onClose: () => void; onSuccess: (msg: string) => void }) {
  const [sourceClient, setSourceClient] = useState("");
  const [treeId, setTreeId] = useState("");
  const [targetClient, setTargetClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  // Trees of the chosen source client (super-admin scoped fetch).
  const { data: treesData } = useSWR<{ trees: { id: string; name: string; journey_count: number }[] }>(
    sourceClient ? `/api/trees?clientId=${sourceClient}` : null,
    fetcher
  );
  const trees = treesData?.trees || [];

  // Reset tree selection when source client changes.
  useEffect(() => { setTreeId(""); }, [sourceClient]);

  const clientOpts = clients.map((c) => ({ value: c.id, label: c.name }));
  const treeOpts = trees.map((t) => ({ value: t.id, label: `${t.name} (${t.journey_count} journeys)` }));
  const targetOpts = clients.filter((c) => c.id !== sourceClient).map((c) => ({ value: c.id, label: c.name }));

  const canCopy = !!(sourceClient && treeId && targetClient && targetClient !== sourceClient);

  async function copy() {
    if (!canCopy) return;
    setBusy(true); setError(""); setDone("");
    const res = await fetch("/api/trees/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ treeId, targetClientId: targetClient }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error || "Copy failed"); return; }
    onSuccess(`Copied "${d.name}" to ${d.targetClient} (${d.journeysCopied} journeys)`);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="cl-modal bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div>
            <h3 className="text-base font-bold text-white">Copy Tree</h3>
            <p className="text-xs text-gray-400 mt-0.5">Duplicate a tree into another client (as draft)</p>
          </div>
          <button onClick={onClose} className="cl-iconbtn text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-300">{error}</div>}

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Source client</label>
            <SelectGlass value={sourceClient} onChange={setSourceClient} options={[{ value: "", label: "Select client…" }, ...clientOpts]} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Tree to copy</label>
            <SelectGlass
              value={treeId}
              onChange={setTreeId}
              options={[{ value: "", label: sourceClient ? (trees.length ? "Select tree…" : "No trees in this client") : "Select source client first" }, ...treeOpts]}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Target client</label>
            <SelectGlass value={targetClient} onChange={setTargetClient} options={[{ value: "", label: "Select client…" }, ...targetOpts]} />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="cl-cancel flex-1 px-4 py-2.5 text-sm font-semibold bg-white/5 text-gray-300 border border-white/10 rounded-xl hover:bg-white/10 transition-all">Close</button>
            <button onClick={copy} disabled={busy || !canCopy} className="cl-create-btn flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-700 hover:bg-slate-600 text-white border border-slate-500/50 shadow-sm rounded-xl tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] cursor-pointer">{busy ? (<span className="flex items-center justify-center gap-2"><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg>Copying…</span>) : "Copy Tree"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientDetail({
  client, edit, onEdit, onBack, onClose, onSaved,
}: {
  client: Client;
  edit: boolean;
  onEdit: () => void;
  onBack: () => void;
  onClose: () => void;
  onSaved: (c: Client) => void;
}) {
  const [name, setName] = useState(client.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Client name is required"); return; }
    setBusy(true);
    setError("");
    // Only the display name is editable; the other fields are immutable.
    const res = await fetch("/api/clients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: client.id, name: name.trim() }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error || "Failed to update"); return; }
    onSaved({ ...client, name: name.trim() });
  }

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50";
  const lockedCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-400 font-mono cursor-not-allowed opacity-70";
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyToClipboard = (label: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  const Row = ({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) => (
    <div className="flex justify-between gap-4 py-2 border-b border-white/5">
      <span className="text-xs text-gray-400">{label}</span>
      {copyable && value !== "—" ? (
        <button
          onClick={() => copyToClipboard(label, value)}
          title={`Copy ${label}`}
          className="flex items-center gap-1.5 group text-right"
        >
          <span className="text-sm text-gray-200 font-mono break-all group-hover:text-purple-300 transition-colors">{value}</span>
          <span className="shrink-0 text-gray-500 group-hover:text-purple-400 transition-colors">
            {copiedField === label ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-green-400">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </span>
        </button>
      ) : (
        <span className="text-sm text-gray-200 font-mono text-right break-all">{value}</span>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="cl-modal bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-2">
            {edit && (
              <button onClick={onBack} className="cl-iconbtn text-gray-400 hover:text-white -ml-1 mr-0.5" title="Back" aria-label="Back">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
            )}
            <div>
              <h3 className="text-base font-bold text-white">{edit ? "Edit Client" : client.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{edit ? "Client name only — other fields are locked" : "Client details"}</p>
            </div>
          </div>
          <button onClick={onClose} className="cl-iconbtn text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {edit ? (
          <form onSubmit={save} className="p-5 space-y-4">
            {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-300">{error}</div>}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Client name <span className="text-red-400">*</span></label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Subdomain <span className="text-gray-600">🔒 locked</span></label>
              <input value={client.subdomain || "—"} disabled readOnly className={lockedCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">org_id <span className="text-gray-600">🔒</span></label>
                <input value={client.org_id || "—"} disabled readOnly className={lockedCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">client_id <span className="text-gray-600">🔒</span></label>
                <input value={client.source_client_id || "—"} disabled readOnly className={lockedCls} />
              </div>
            </div>
            <p className="text-[10px] text-gray-500">subdomain, org_id and client_id are fixed after creation — they bind this tenant to its source data.</p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onBack} className="cl-cancel flex-1 px-4 py-2.5 text-sm font-semibold bg-white/5 text-gray-300 border border-white/10 rounded-xl hover:bg-white/10 transition-all">Back</button>
              <button type="submit" disabled={busy} className="cl-save flex-1 px-4 py-2.5 text-sm font-semibold bg-purple-500/20 text-purple-200 border border-purple-500/40 rounded-xl hover:bg-purple-500/30 transition-all disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        ) : (
          <div className="p-5">
            <Row label="Client name" value={client.name} />
            <Row label="Subdomain" value={client.subdomain || "—"} />
            <Row label="org_id" value={client.org_id || "—"} copyable />
            <Row label="client_id" value={client.source_client_id || "—"} copyable />
            <Row label="Trees" value={String(client.tree_count ?? 0)} />
            <Row label="Users" value={String(client.user_count ?? 0)} />
            <Row label="Last synced" value={fmt(client.last_synced_at)} />
            <Row label="Created" value={fmt(client.created_at)} />
            <button onClick={onEdit} className="cl-save w-full mt-4 px-4 py-2.5 text-sm font-semibold bg-purple-500/20 text-purple-200 border border-purple-500/40 rounded-xl hover:bg-purple-500/30 transition-all">Edit details</button>
          </div>
        )}
      </div>
    </div>
  );
}
