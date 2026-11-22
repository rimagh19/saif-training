import { redirect } from "next/navigation";
import { currentTrainer, trainerCount } from "@/lib/auth";

export default async function Home() {
  if (trainerCount() === 0) redirect("/setup");
  const t = await currentTrainer();
  redirect(t ? "/dashboard" : "/login");
}
