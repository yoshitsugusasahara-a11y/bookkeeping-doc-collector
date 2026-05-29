import { Loader2 } from "lucide-react";

export default function AdminCustomerDetailLoading() {
  return (
    <main className="admin-detail-shell">
      <section className="loading-panel" aria-live="polite">
        <Loader2 className="spin-icon" size={20} />
        読み込み中です...
      </section>
    </main>
  );
}
