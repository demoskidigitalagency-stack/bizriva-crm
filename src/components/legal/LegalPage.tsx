/** Public legal pages (privacy, terms, data deletion) — no sign-in, no app menu. Meta's app review links to these. */
import type { ReactNode } from "react";

export const CONTACT_EMAIL = "demoski.digital.agency@gmail.com";
export const UPDATED = "7 November 2026";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-lg border bg-card p-6 text-sm leading-relaxed shadow-sm sm:p-10 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Bizriva</p>
        <h1 className="mt-1 text-2xl font-bold">{title}</h1>
        <p className="text-xs text-muted-foreground">Last updated {UPDATED}</p>
        {children}
        <p className="mt-10 border-t pt-4 text-xs text-muted-foreground">
          <a className="underline" href="/privacy">Privacy policy</a> · <a className="underline" href="/terms">Terms of service</a> · <a className="underline" href="/data-deletion">Delete your data</a> · Contact: <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </article>
    </main>
  );
}
