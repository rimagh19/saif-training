import { requireTrainerPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n-server";
import { fmtDate, PageHeader } from "@/components/ui";
import { AddTrainerForm, PasswordForm, ProfileForm } from "@/components/settings-forms";
import { LangSwitch } from "@/components/i18n";

export default async function Settings() {
  const t = await requireTrainerPage();
  const { d, lang } = await getDict();
  const trainers = db().prepare("SELECT id, name, email, created_at FROM trainers ORDER BY created_at").all() as { id: number; name: string; email: string; created_at: number }[];
  return (
    <>
      <PageHeader title={d.settings_title} />
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-5"><h2 className="text-xl mb-4">{d.profile}</h2><ProfileForm name={t.name} email={t.email} /></section>
        <section className="card p-5"><h2 className="text-xl mb-4">{d.change_password}</h2><PasswordForm /></section>
        <section className="card p-5">
          <h2 className="text-xl mb-1">{d.trainers}</h2>
          <p className="text-sm text-platinum mb-4">{d.trainers_hint}</p>
          <ul className="divide-y divide-silver/40 mb-4">
            {trainers.map((x) => (
              <li key={x.id} className="py-2 flex items-center justify-between text-sm">
                <span><b>{x.name}</b> <span className="text-platinum" dir="ltr">{x.email}</span></span>
                <span className="text-platinum">{fmtDate(x.created_at, lang)}</span>
              </li>
            ))}
          </ul>
          <AddTrainerForm />
        </section>
        <section className="card p-5 h-fit">
          <h2 className="text-xl mb-4">{d.language}</h2>
          <LangSwitch className="btn-outline" />
        </section>
      </div>
    </>
  );
}
