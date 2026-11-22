import "server-only";
import { bankFacets } from "./bank";

export function bankSuggestions(trainerId: number) {
  const f = bankFacets(trainerId, "all");
  return { domains: f.domains.map((x) => x.value), specialties: f.specialties.map((x) => x.value), topics: f.topics.map((x) => x.value), tags: f.tags.map((x) => x.value) };
}
