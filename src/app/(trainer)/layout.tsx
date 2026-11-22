import { requireTrainerPage } from "@/lib/auth";
import { get } from "@/lib/db";
import { Sidebar } from "@/components/sidebar";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const t = await requireTrainerPage();
  const live = (
    await get("SELECT COUNT(*) c FROM activities a JOIN courses c2 ON c2.id = a.course_id WHERE c2.trainer_id = ? AND a.status = 'live'", t.id) as { c: number }
  ).c;
  return (
    <div className="min-h-screen bg-sand/40">
      <Sidebar name={t.name} liveCount={live} />
      <div className="lg:ps-64">
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 animate-fade-up">{children}</main>
      </div>
    </div>
  );
}
