import ScrollReveal from '../components/ScrollReveal'

export default function Privacy() {
  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <ScrollReveal>
          <h1 className="text-4xl font-bold text-terminal-text mb-4">Privacy Policy</h1>
          <p className="text-terminal-dim mb-8">Last updated: May 2026</p>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="space-y-8 text-terminal-dim leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">1. Local-First Architecture</h2>
              <p>
                KOI is designed with privacy as a core principle. The Cat's Context Engine (CCE) uses
                a local embedding model and vector database that runs entirely on your machine. Your
                codebase, file structure, and project metadata never leave your local device.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">2. Data We Collect</h2>
              <p className="mb-3">
                KOI itself does not collect any personal data or telemetry. The only data that leaves
                your machine is:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  <strong className="text-terminal-text">LLM API requests</strong> — When you interact with KOI,
                  your prompts and selected context are sent to your configured LLM provider (OpenAI, Anthropic, etc.).
                  This is governed by your chosen provider's privacy policy.
                </li>
                <li>
                  <strong className="text-terminal-text">Package registry</strong> — When installing or updating KOI
                  via npm/bun, standard package manager analytics may apply.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">3. Data We Do NOT Collect</h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Source code or file contents</li>
                <li>Project structure or repository metadata</li>
                <li>Conversation history (stored locally only)</li>
                <li>Usage analytics or crash reports</li>
                <li>Personal identification information</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">4. Local Storage</h2>
              <p>
                KOI stores the following data locally on your machine in <code className="text-terminal-accent">~/.config/koi/</code>:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mt-2">
                <li>Configuration settings (API keys, preferences)</li>
                <li>Session history and conversation logs</li>
                <li>CCE vector database and embedding cache</li>
                <li>User-defined skills</li>
              </ul>
              <p className="mt-3">
                You can delete all local data at any time by removing the <code className="text-terminal-accent">~/.config/koi/</code> directory.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">5. Your Rights</h2>
              <p>
                Since KOI operates on a local-first model, you maintain full control over your data at all times.
                You have the right to access, modify, or delete any locally stored information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">6. Contact</h2>
              <p>
                For privacy-related questions, please open an issue on our GitHub repository
                or contact the maintainers through the project channels.
              </p>
            </section>
          </div>
        </ScrollReveal>
      </div>
    </div>
  )
}
