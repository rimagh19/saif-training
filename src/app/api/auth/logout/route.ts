import { destroyTrainerSession } from "@/lib/auth";
import { assertSameOrigin, handler } from "@/lib/http";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await destroyTrainerSession();
  return Response.json({ ok: true });
});
