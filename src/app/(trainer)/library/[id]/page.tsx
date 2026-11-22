import { notFound } from "next/navigation";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { bankUsage, getBankQuestion } from "@/lib/bank";
import { bankSuggestions } from "@/lib/bank-suggestions";
import { coursesWithActivities } from "@/lib/repo";
import { PageHeader } from "@/components/ui";
import { BankEditor } from "@/components/bank-editor";

export default async function BankQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTrainerPage();
  const { d } = await getDict();
  let q;
  try { q = getBankQuestion(t.id, Number((await params).id)); } catch { notFound(); }
  return (
    <>
      <PageHeader title={q.title || q.body.slice(0, 80)} back={{ href: "/library", label: d.library_title }} subtitle={[q.domain, q.specialty, q.topic].filter(Boolean).join(" › ") || d.no_classification} />
      <BankEditor key={`${q.id}-${q.updated_at}`} question={q} usage={bankUsage(t.id, q.id)} suggestions={bankSuggestions(t.id)} courses={coursesWithActivities(t.id)} />
    </>
  );
}
