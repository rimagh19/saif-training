import { TraineePlay } from "@/components/trainee-play";

export const metadata = { title: "Activity" };

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TraineePlay code={code.replace(/\D/g, "").slice(0, 6)} />;
}
