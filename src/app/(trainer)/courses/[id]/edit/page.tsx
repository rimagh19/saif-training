import { notFound } from "next/navigation";
import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { getCourse } from "@/lib/repo";
import { PageHeader } from "@/components/ui";
import { CourseForm } from "@/components/course-form";

export default async function EditCourse({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTrainerPage();
  const { d } = await getDict();
  let c;
  try { c = await getCourse(t.id, Number((await params).id)); } catch { notFound(); }
  return (
    <>
      <PageHeader title={d.edit_course} back={{ href: `/courses/${c.id}`, label: c.title }} />
      <CourseForm initial={c} />
    </>
  );
}
