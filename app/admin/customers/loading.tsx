import { Loader2 } from "lucide-react";

export default function AdminCustomersLoading() {
  return (
    <main className="admin-content">
      <section className="loading-panel" aria-live="polite">
        <Loader2 className="spin-icon" size={20} />
        読み込み中です...
      </section>
    </main>
  );
}
