import { redirect } from "next/navigation";
import { trainerCount } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { AuthShell } from "@/components/auth-shell";
import { SetupForm } from "./form";

export default async function SetupPage() {
  if (trainerCount() > 0) redirect("/login");
  const { d } = await getDict();
  return (
    <AuthShell d={d}>
      <h2 className="text-3xl text-navy">{d.setup_title}</h2>
      <p className="text-platinum mt-1 mb-8">{d.setup_sub}</p>
      <SetupForm />
    </AuthShell>
  );
}
