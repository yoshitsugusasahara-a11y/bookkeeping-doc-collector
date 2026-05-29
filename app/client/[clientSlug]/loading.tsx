import { Loader2 } from "lucide-react";

export default function ClientLoading() {
  return (
    <main className="app-frame">
      <section className="loading-panel" aria-live="polite">
        <Loader2 className="spin-icon" size={20} />
        読み込み中です...
      </section>
    </main>
  );
}
