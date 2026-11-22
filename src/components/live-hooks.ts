"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads a state endpoint and re-loads it whenever the SSE stream signals a change.
 * A light poll is kept as a safety net (e.g. a proxy that buffers SSE), so the UI
 * never needs a manual refresh.
 */
export function useLiveResource<T>(url: string, streamUrl: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [serverOffset, setServerOffset] = useState(0);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let inflight = false;
    let again = false;
    let alive = true;
    const load = async (): Promise<void> => {
      if (inflight) {
        again = true;
        return;
      }
      inflight = true;
      try {
        const t0 = Date.now();
        const res = await fetch(url, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) setError(json.error ?? "server_error");
        else {
          if (typeof json.server_now === "number") setServerOffset(json.server_now - (t0 + Date.now()) / 2);
          setError(null);
          setData(json);
        }
      } catch {
        if (alive) setConnected(false);
      } finally {
        inflight = false;
        if (again && alive) {
          again = false;
          load();
        }
      }
    };
    loadRef.current = load;
    load();
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      es?.close();
      es = new EventSource(streamUrl);
      es.addEventListener("hello", () => {
        setConnected(true);
        load();
      });
      es.addEventListener("change", () => load());
      es.onerror = () => {
        setConnected(false);
        // The browser retries by itself unless it gave up (CLOSED) — then rebuild the stream.
        if (es?.readyState === EventSource.CLOSED && alive && !retry) {
          retry = setTimeout(() => {
            retry = null;
            if (alive) connect();
          }, 3000);
        }
      };
    };
    connect();
    const poll = setInterval(load, 15000);
    const onVis = () => document.visibilityState === "visible" && load();
    // Back online: refresh immediately instead of waiting for the next retry.
    const onOnline = () => {
      load();
      if (!es || es.readyState === EventSource.CLOSED) connect();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      es?.close();
      if (retry) clearTimeout(retry);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [url, streamUrl]);

  const reload = useCallback(() => loadRef.current(), []);
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
        cb.current?.();
      }
    }, 250);
    return () => clearInterval(i);
  }, [deadline, serverOffset]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - (nowMs + serverOffset)) / 1000));
}
