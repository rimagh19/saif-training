import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { requireTrainerApi } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/db";
import { assertSameOrigin, handler, HttpError } from "@/lib/http";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX = 5 * 1024 * 1024;

/** Magic-byte check so only real images are stored. */
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "webp";
  if (buf.subarray(0, 4).toString() === "GIF8") return "gif";
  return null;
}

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await requireTrainerApi();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "no_file");
  if (file.size > MAX) throw new HttpError(413, "file_too_large");
  if (!TYPES[file.type]) throw new HttpError(415, "unsupported_type");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniff(buf);
  if (!ext) throw new HttpError(415, "unsupported_type");
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return Response.json({ name });
});
