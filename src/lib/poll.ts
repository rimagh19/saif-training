import "server-only";

/** ?rev=N sent by polling clients: the revision they already have. */
export function revParam(req: Request): number | null {
  const v = new URL(req.url).searchParams.get("rev");
  if (v === null || !/^\d{1,15}$/.test(v)) return null;
  return Number(v);
}

/** Nothing changed since the client's revision. */
export const notModified = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
