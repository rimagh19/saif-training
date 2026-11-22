import "server-only";
import { cookies } from "next/headers";
import { dictionaries, LANG_COOKIE, type Lang } from "./i18n";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return v === "en" ? "en" : "ar";
}

export async function getDict() {
  const lang = await getLang();
  return { lang, d: dictionaries[lang] };
}
