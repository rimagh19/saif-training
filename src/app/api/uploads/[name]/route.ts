import fs from "node:fs";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/db";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/** Question images use unguessable random names (128-bit), so they can be shown to trainees. */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!/^[a-f0-9]{32}\.(png|jpe?g|webp|gif)$/.test(name)) return new Response("Not found", { status: 404 });
  const p = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(p)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(p), {
    headers: { "Content-Type": MIME[name.split(".").pop()!], "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
