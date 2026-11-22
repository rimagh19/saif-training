"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type LiveData = { server_now?: number; rev?: number; realtime?: "sse" | "poll" };

const POLL_MS = 1500; // serverless: trainees ask "anything new?" this often while the page is visible
export const TRAINER_POLL_MS = 1000; // trainer panel & projector
const POLL_HIDDEN_MS = 10000;
const SAFETY_MS = 15000; // streaming mode: occasional full refresh as a safety net

/**
 * Loads a live state endpoint and keeps it current without manual refresh.
 * The server says which transport to use (`realtime` in the payload):
 *  - "sse":  instant push over Server-Sent Events (own server),
 *  - "poll": short polling with ?rev= — unchanged state costs a 204 (Vercel / serverless).
 * Reconnects by itself after network loss.
 */
export function useLiveResource<T extends LiveData>(url: string, streamUrl: string, pollMs = POLL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [serverOffset, setServerOffset] = useState(0);
  const [mode, setMode] = useState<"sse" | "poll" | null>(null);
  const loadRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const revRef = useRef<number | null>(null);

  // ---- loading (shared by both modes) ----
  useEffect(() => {
    let alive = true;
    let inflight = false;
    let again: boolean | null = null; // queued load; true = forced
    const load = async (force = true): Promise<void> => {
      if (inflight) {
        again = again === true || force;
        return;
      }
      inflight = true;
      try {
        const t0 = Date.now();
        const useRev = !force && revRef.current !== null;
        const res = await fetch(useRev ? `${url}${url.includes("?") ? "&" : "?"}rev=${revRef.current}` : url, { cache: "no-store" });
        if (!alive) return;
        setConnected(true);
        if (res.status === 204) return; // nothing changed
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) setError(json.error ?? "server_error");
        else {
          if (typeof json.server_now === "number") setServerOffset(json.server_now - (t0 + Date.now()) / 2);
          revRef.current = typeof json.rev === "number" ? json.rev : null;
          if (json.realtime === "sse" || json.realtime === "poll") setMode(json.realtime);
          setError(null);
          setData(json);
        }
      } catch {
        if (alive) setConnected(false);
      } finally {
        inflight = false;
        if (again !== null && alive) {
          const f = again;
          again = null;
          void load(f);
        }
      }
    };
    loadRef.current = load;
    void load(true);
    const onVis = () => document.visibilityState === "visible" && void load(true);
    const onOnline = () => void load(true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [url]);

  // ---- change notifications ----
  useEffect(() => {
    if (!mode) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (mode === "poll") {
      const tick = async () => {
        await loadRef.current(false);
        if (alive) timer = setTimeout(tick, document.visibilityState === "visible" ? pollMs : POLL_HIDDEN_MS);
      };
      timer = setTimeout(tick, pollMs);
      return () => {
        alive = false;
        if (timer) clearTimeout(timer);
      };
    }

    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      es?.close();
      es = new EventSource(streamUrl);
      es.addEventListener("hello", () => {
        setConnected(true);
        void loadRef.current(true);
      });
      es.addEventListener("change", () => void loadRef.current(true));
      es.onerror = () => {
        setConnected(false);
        // the browser retries by itself unless it gave up (CLOSED) — then rebuild the stream
        if (es?.readyState === EventSource.CLOSED && alive && !retry) {
          retry = setTimeout(() => {
            retry = null;
            if (alive) connect();
          }, 3000);
        }
      };
    };
    connect();
    const safety = setInterval(() => void loadRef.current(true), SAFETY_MS);
    const onOnline = () => {
      if (!es || es.readyState === EventSource.CLOSED) connect();
    };
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      es?.close();
      if (retry) clearTimeout(retry);
      clearInterval(safety);
      window.removeEventListener("online", onOnline);
    };
  }, [mode, streamUrl, pollMs]);

  const reload = useCallback(() => loadRef.current(true), []);
  return { data, error, connected, reload, serverOffset };
}

/** Seconds remaining until a server-side deadline, corrected for clock skew. Calls onExpired once after it passes. */
export function useCountdown(deadline: number | null | undefined, serverOffset: number, onExpired?: () => void) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const cb = useRef(onExpired);
  useEffect(() => {
    cb.current = onExpired;
  });
  useEffect(() => {
    if (!deadline) return;
    let fired = false;
    const i = setInterval(() => {
      const t = Date.now();
      setNowMs(t);
      if (!fired && t + serverOffset > deadline + 1700) {
        fired = true;
        void cb.current?.();
      }
    }, 250);
    return () => clearInterval(i);
  }, [deadline, serverOffset]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - (nowMs + serverOffset)) / 1000));
}
