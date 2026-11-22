import "server-only";
import { EventEmitter } from "node:events";
import { run } from "./db";

/**
 * Live updates.
 *
 * Every change bumps activities.rev in the database. Clients learn about changes in one of two ways:
 *  - "sse"  (own server / single long-running process): pushed instantly over Server-Sent Events
 *           through this in-process emitter.
 *  - "poll" (Vercel / serverless, many short-lived instances): clients ask every ~1.5 s whether the
 *           revision changed; an unchanged revision costs one tiny query and a 204 reply.
 * Events only say "something changed in activity N"; every client then re-reads its own
 * permission-filtered state, so no data leaks through the change channel itself.
 */
export type RealtimeMode = "sse" | "poll";
export const REALTIME_MODE: RealtimeMode =
  process.env.REALTIME_MODE === "sse" || process.env.REALTIME_MODE === "poll" ? process.env.REALTIME_MODE : process.env.VERCEL ? "poll" : "sse";

type G = typeof globalThis & { __safeBus?: EventEmitter };
const g = globalThis as G;
const bus = g.__safeBus ?? (g.__safeBus = new EventEmitter());
bus.setMaxListeners(0);

export type LiveEvent = { kind: "state" | "answer" | "participant"; at: number };

export async function publish(activityId: number, kind: LiveEvent["kind"]) {
  await run("UPDATE activities SET rev = rev + 1 WHERE id = ?", activityId);
  bus.emit(`a:${activityId}`, { kind, at: Date.now() } satisfies LiveEvent);
}

export function subscribe(activityId: number, fn: (e: LiveEvent) => void) {
  const key = `a:${activityId}`;
  bus.on(key, fn);
  return () => bus.off(key, fn);
}

/** Builds an SSE Response that relays events for one activity until the client disconnects. */
export function sseResponse(req: Request, activityId: number, onEvent?: () => boolean): Response {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(enc.encode(data));
        } catch {
          cleanup();
        }
      };
      send(`retry: 2000\n\n`);
      send(`event: hello\ndata: {}\n\n`);
      let timer: ReturnType<typeof setTimeout> | null = null;
      const unsub = subscribe(activityId, (e) => {
        if (onEvent && !onEvent()) {
          cleanup();
          try { controller.close(); } catch {}
          return;
        }
        // coalesce bursts (e.g. 40 answers in a second) into one push
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          send(`event: change\ndata: ${JSON.stringify(e)}\n\n`);
        }, 150);
      });
      const ping = setInterval(() => send(`: ping\n\n`), 20000);
      cleanup = () => {
        unsub();
        clearInterval(ping);
        if (timer) clearTimeout(timer);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
