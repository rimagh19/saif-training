import "server-only";

export class HttpError extends Error {
  constructor(public status: number, public code: string, public details?: unknown) {
    super(code);
  }
}

/** Wraps a route handler so thrown HttpErrors become JSON responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) {
        return Response.json({ error: e.code, details: e.details }, { status: e.status });
      }
      if (e instanceof Error && /UNIQUE constraint failed: participants\.run_id, participants\.trainee_number/.test(e.message)) {
        return Response.json({ error: "trainee_number_taken" }, { status: 409 });
      }
      console.error(e);
      return Response.json({ error: "server_error" }, { status: 500 });
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

export function toId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, "not_found");
  return n;
}

export const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Rejects cross-site state-changing requests (defence in depth on top of SameSite cookies). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "bad_origin");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "bad_origin");
  }
}
