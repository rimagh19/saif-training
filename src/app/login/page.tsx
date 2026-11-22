import { redirect } from "next/navigation";
import { currentTrainer, trainerCount } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./form";

export default async function LoginPage() {
  if (trainerCount() === 0) redirect("/setup");
  if (await currentTrainer()) redirect("/dashboard");
  const { d } = await getDict();
  return (
    <AuthShell d={d}>
      <h2 className="text-3xl text-navy">{d.login_title}</h2>
      <p className="text-platinum mt-1 mb-8">{d.login_sub}</p>
      <LoginForm />
    </AuthShell>
  );
}
