import { notFound } from "next/navigation";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { getActivity, listQuestions } from "@/lib/repo";
import { ActivityStatus, PageHeader } from "@/components/ui";
import { ActivityEditor } from "@/components/activity-editor";
import { bankVersions } from "@/lib/bank";
import { bankSuggestions } from "@/lib/bank-suggestions";

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTrainerPage();
  const { d } = await getDict();
  let a;
  try { a = getActivity(t.id, Number((await params).id)); } catch { notFound(); }
  const questions = listQuestions(a.id);
  const versions = bankVersions(t.id, [...new Set(questions.map((q) => q.bank_id).filter((x): x is number => !!x))]);
  return (
    <>
      <PageHeader
        back={{ href: `/courses/${a.course_id}`, label: a.course_title }}
        title={a.title}
        subtitle={<ActivityStatus status={a.status} d={d} />}
      />
      <ActivityEditor key={`${a.id}-${a.updated_at}`} activity={a} questions={questions} bankVersions={versions} suggestions={bankSuggestions(t.id)} />
    </>
  );
}
