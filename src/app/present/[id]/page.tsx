import { notFound } from "next/navigation";
import { requireTrainerPage } from "@/lib/auth";
import { getActivity } from "@/lib/repo";
import { PresentScreen } from "@/components/present-screen";

export const metadata = { title: "Presentation" };

export default async function PresentPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTrainerPage();
  let a;
  try { a = await getActivity(t.id, Number((await params).id)); } catch { notFound(); }
  return <PresentScreen activityId={a.id} />;
}
