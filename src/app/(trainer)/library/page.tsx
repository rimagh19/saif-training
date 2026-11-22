import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { bankFacets } from "@/lib/bank";
import { coursesWithActivities } from "@/lib/repo";
import { PageHeader } from "@/components/ui";
import { LibraryBrowser } from "@/components/library-browser";

export default async function Library({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireTrainerPage();
  const { d } = await getDict();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [];
  const status = one("status") === "archived" ? "archived" : "active";
  const sort = (["recent", "usage", "title", "oldest"].includes(one("sort")) ? one("sort") : "recent") as "recent";
  return (
    <>
      <PageHeader title={d.library_title} subtitle={d.lib_sub} />
      <LibraryBrowser
        initialFacets={await bankFacets(t.id, status)}
        courses={await coursesWithActivities(t.id)}
        initialFilters={{ q: one("q"), domain: one("domain"), specialty: one("specialty"), topic: one("topic"), difficulty: one("difficulty"), type: one("type"), tag: tags, status, sort }}
      />
    </>
  );
}
