export default function DocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.4em] text-cyan-200">Documentation</p>
      <h1 className="mt-4 text-4xl font-semibold text-white">Architecture & research materials</h1>
      <p className="mt-3 text-slate-200">
        Detailed specifications live inside the Python repository. Use the quick links below to jump into the source-controlled docs.
      </p>
      <div className="mt-8 space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-sm text-slate-100">
        <p>Open these Markdown files in VS Code:</p>
        <ul className="list-disc pl-6 text-slate-300">
          <li>docs/architecture.md</li>
          <li>docs/validation.md</li>
          <li>docs/frontend.md</li>
        </ul>
      </div>
      <p className="mt-6 text-sm text-slate-400">
        The Next.js UI simply links to those Markdown files so you can open them in VS Code or render them via any static site tooling you prefer.
      </p>
    </main>
  );
}
