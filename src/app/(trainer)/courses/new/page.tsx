import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui";
import { CourseForm } from "@/components/course-form";

export default async function NewCourse() {
  const t = await requireTrainerPage();
  const { d } = await getDict();
  return (
    <>
      <PageHeader title={d.new_course} back={{ href: "/courses", label: d.courses_title }} />
      <CourseForm initial={{ title: "", description: "", trainer_name: t.name, course_date: new Date().toISOString().slice(0, 10), mode: "onsite", status: "draft" }} />
    </>
  );
}
