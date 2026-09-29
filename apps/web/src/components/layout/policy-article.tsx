import type { PolicyDoc } from '@shop/shared';

/** 약관·정책 문서 (본문은 @shop/shared POLICIES — 앱 화면과 같은 내용) */
export function PolicyArticle({ doc }: { doc: PolicyDoc }) {
  return (
    <article className="page-x mx-auto max-w-2xl py-8 md:py-12">
      <h1 className="text-h1">{doc.title}</h1>
      <p className="mt-2 text-small text-muted">시행일 {doc.effectiveDate}</p>
      <div className="mt-8 flex flex-col gap-6">
        {doc.sections.map((s) => (
          <section key={s.title}>
            <h2 className="text-h3">{s.title}</h2>
            {s.body && <p className="mt-2 text-body text-foreground-2">{s.body}</p>}
            {s.table && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-small">
                  <thead className="bg-background-soft text-left text-muted">
                    <tr>
                      {s.table.columns.map((c) => (
                        <th key={c} scope="col" className="h-10 px-3 font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.table.rows.map((row) => (
                      <tr key={row[0]} className="border-t border-border-soft">
                        {row.map((cell, i) => (
                          <td key={i} className="px-3 py-3">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
