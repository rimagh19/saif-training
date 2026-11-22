"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";

export function QR({ text, size = 200, dark = "#1b1f2a", light = "#ffffff", className = "" }: { text: string; size?: number; dark?: string; light?: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark, light } }).then((v) => {
      if (alive) setSvg(v);
    });
    return () => {
      alive = false;
    };
  }, [text, dark, light]);
  return <div className={className} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

const noop = () => () => {};
export function useOrigin() {
  return useSyncExternalStore(noop, () => window.location.origin, () => "");
}
