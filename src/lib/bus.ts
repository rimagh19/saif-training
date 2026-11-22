import "server-only";
import { EventEmitter } from "node:events";

/**
 * In-process pub/sub used to push live updates over Server-Sent Events.
 * Events only say "something changed in activity N"; every client then
 * re-reads its own permission-filtered state from the server, so no data
 * leaks through the event channel itself.
 *
 * Runs in a single Node process. For multiple instances, replace with
 * Redis pub/sub or Postgres LISTEN/NOTIFY behind the same two functions.
 */
type G = typeof globalThis & { __safeBus?: EventEmitter };
const g = globalThis as G;
const bus = g.__safeBus ?? (g.__safeBus = new EventEmitter());
bus.setMaxListeners(0);

export type LiveEvent = { kind: "state" | "answer" | "participant"; at: number };

export function publish(activityId: number, kind: LiveEvent["kind"]) {
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
