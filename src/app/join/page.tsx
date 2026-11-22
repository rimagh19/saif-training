import { getDict } from "@/lib/i18n-server";
import { TraineeShell } from "@/components/trainee-shell";
import { JoinCodeForm } from "./form";

export const metadata = { title: "Join" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { d } = await getDict();
  const sp = await searchParams;
  const initial = (sp.code ?? "").replace(/\D/g, "").slice(0, 6);
  return (
    <TraineeShell title={d.join_title}>
      <div className="my-auto py-6 animate-fade-up">
        <div className="text-center mb-6">
          <h1 className="text-3xl">{d.join_title}</h1>
          <p className="text-platinum mt-1">{d.t_scan_hint}</p>
        </div>
        <JoinCodeForm initial={initial} />
      </div>
    </TraineeShell>
  );
}
