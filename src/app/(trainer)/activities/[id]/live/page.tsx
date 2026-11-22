import { notFound } from "next/navigation";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { getActivity } from "@/lib/repo";
import { ModeBadge, PageHeader } from "@/components/ui";
import { LiveControl } from "@/components/live-control";

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTrainerPage();
  const { d } = await getDict();
  let a;
  try { a = await getActivity(t.id, Number((await params).id)); } catch { notFound(); }
  return (
    <>
      <PageHeader
        back={{ href: `/activities/${a.id}`, label: a.title }}
        title={d.live_control}
        subtitle={<span className="flex items-center gap-2">{a.title} · {a.course_title} <ModeBadge mode={a.course_mode} d={d} /></span>}
      />
      <LiveControl activityId={a.id} />
    </>
  );
}
