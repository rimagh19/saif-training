import { requireTrainerPage } from "@/lib/auth";
import { getDict } from "@/lib/i18n-server";
import { bankSuggestions } from "@/lib/bank-suggestions";
import { PageHeader } from "@/components/ui";
import { BankEditor } from "@/components/bank-editor";

export default async function NewBankQuestion() {
  const t = await requireTrainerPage();
  const { d } = await getDict();
  return (
    <>
      <PageHeader title={d.lib_new} back={{ href: "/library", label: d.library_title }} />
      <BankEditor suggestions={bankSuggestions(t.id)} courses={[]} />
    </>
  );
}
