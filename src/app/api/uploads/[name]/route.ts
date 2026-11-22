import { get } from "@/lib/db";

/** Question images use unguessable random names (128-bit), so they can be shown to trainees. */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!/^[a-f0-9]{32}\.(png|jpe?g|webp|gif)$/.test(name)) return new Response("Not found", { status: 404 });
  const row = await get<{ mime: string; data: ArrayBuffer }>("SELECT mime, data FROM uploads WHERE name = ?", name);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
