"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, Download, ExternalLink, Info, Trash2 } from "lucide-react";
import { useI18n } from "./i18n";
import { api, ApiError } from "./api";
import { blankQuestion, QuestionEditor } from "./question-editor";
import { BankFields, type BankMetaDraft, type Suggestions } from "./bank-fields";
import { ImportDialog, type CourseWithActivities } from "./import-dialog";
import type { BankQuestion } from "@/lib/bank";

type Usage = { question_id: number; bank_version: number; activity_id: number; activity_title: string; course_id: number; course_title: string; answers: number }[];

export function BankEditor({ question, usage, suggestions, courses }: { question?: BankQuestion; usage?: Usage; suggestions: Suggestions; courses: CourseWithActivities[] }) {
  const { d, err } = useI18n();
  const router = useRouter();
  const [meta, setMeta] = useState<BankMetaDraft>({
    domain: question?.domain ?? "",
    specialty: question?.specialty ?? "",
    topic: question?.topic ?? "",
    tags: question?.tags ?? [],
  });
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const initial = question
    ? { type: question.type, title: question.title, body: question.body, image: question.image, options: question.options, correct: question.correct, explanation: question.explanation, points: question.points, time_limit: question.time_limit, difficulty: question.difficulty }
    : blankQuestion();

  return (
    <div className="grid xl:grid-cols-[1fr_20rem] gap-6 items-start">
      <div className="space-y-4">
        {question && (
          <div className="card p-4 bg-sand/60 border-gold/30 text-sm flex gap-2">
            <Info size={18} className="text-bronze shrink-0 mt-0.5" />
            <span>{d.edit_note}</span>
          </div>
        )}
        <QuestionEditor
          plain
          initial={initial}
          heading={question ? `${d.edit_question} · v${question.version}` : d.lib_new}
          onDone={(saved) => {
            if (!saved) router.push("/library");
          }}
          save={async (payload) => {
            if (question) {
              await api(`/api/bank/${question.id}`, "PATCH", { ...payload, ...meta });
              router.refresh();
              setMsg(d.saved);
              setTimeout(() => setMsg(""), 2000);
            } else {
              const r = await api<{ id: number }>("/api/bank", "POST", { ...payload, ...meta });
              router.replace(`/library/${r.id}`);
            }
          }}
        >
          <BankFields value={meta} onChange={setMeta} suggestions={suggestions} />
        </QuestionEditor>
        {msg && <p className="text-forest font-bold">{msg}</p>}
      </div>

      {question && (
        <aside className="space-y-4 xl:sticky xl:top-4">
          <div className="card p-5 space-y-2">
            {question.status === "active" && (
              <button className="btn btn-primary w-full" onClick={() => setImporting(true)}><Download size={17} /> {d.import_to_activity}</button>
            )}
            <button
              className="btn btn-outline w-full"
              onClick={async () => {
                await api(`/api/bank/${question.id}`, "PATCH", { status: question.status === "archived" ? "active" : "archived" });
                router.refresh();
              }}
            >
              {question.status === "archived" ? <><ArchiveRestore size={17} /> {d.restore_selected}</> : <><Archive size={17} /> {d.archive_selected}</>}
            </button>
            <button
              className="btn btn-danger w-full"
              onClick={async () => {
                if (!confirm(d.confirm_delete)) return;
                try {
                  await api(`/api/bank/${question.id}`, "DELETE");
                  router.push("/library");
                } catch (x) {
                  setMsg(err(x instanceof ApiError ? x.code : undefined));
                }
              }}
            >
              <Trash2 size={17} /> {d.delete}
            </button>
            {question.status === "archived" && <p className="text-xs text-platinum text-center">{d.archived_badge}</p>}
          </div>
          <div className="card p-5">
            <h3 className="text-lg mb-1">{d.used_where}</h3>
            <p className="text-xs text-platinum mb-3">{d.history_note}</p>
            {!usage?.length ? (
              <p className="text-sm text-platinum">{d.not_used}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {usage.map((u) => (
                  <li key={u.question_id} className="rounded-lg border border-silver/60 p-2.5">
                    <Link href={`/activities/${u.activity_id}`} className="font-bold hover:text-bronze flex items-center gap-1">{u.activity_title} <ExternalLink size={12} /></Link>
                    <div className="text-xs text-platinum flex flex-wrap gap-x-3">
                      <span>{u.course_title}</span>
                      <span dir="ltr" className={u.bank_version < question.version ? "text-bronze font-bold" : ""}>v{u.bank_version}{u.bank_version < question.version ? ` → v${question.version}` : ""}</span>
                      <span className="num">{u.answers} {d.answers_n}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      )}
      {importing && question && <ImportDialog ids={[question.id]} courses={courses} onClose={() => setImporting(false)} onDone={() => router.refresh()} />}
    </div>
  );
}
