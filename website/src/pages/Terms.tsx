import ScrollReveal from '../components/ScrollReveal'

export default function Terms() {
  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <ScrollReveal>
          <h1 className="text-4xl font-bold text-terminal-text mb-4">Terms of Service</h1>
          <p className="text-terminal-dim mb-8">Last updated: May 2026</p>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="space-y-8 text-terminal-dim leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">1. Acceptance of Terms</h2>
              <p>
                By downloading, installing, or using KOI ("the Software"), you agree to be bound by these Terms of Service.
                If you do not agree to these terms, do not use the Software.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">2. License</h2>
              <p>
                KOI is licensed under the GNU General Public License v3.0 (GPL-3.0). This means you are free to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4 mt-2">
                <li>Use the Software for any purpose</li>
                <li>Study how the Software works and modify it</li>
                <li>Redistribute copies of the Software</li>
                <li>Distribute modified versions under the same license</li>
              </ul>
              <p className="mt-3">
                The full license text is available at{' '}
                <a href="https://www.gnu.org/licenses/gpl-3.0.html" className="text-terminal-accent hover:underline" target="_blank" rel="noopener noreferrer">
                  gnu.org/licenses/gpl-3.0.html
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">3. Disclaimer of Warranty</h2>
              <p>
                THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
                INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
                PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
                FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
                ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">4. Limitations of Liability</h2>
              <p>
                KOI is an AI-powered coding assistant. While we strive for accuracy and safety, you are solely
                responsible for reviewing and validating any code changes, commands, or suggestions generated
                by the Software. Always review AI-generated changes before committing them to production systems.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">5. Third-Party Services</h2>
              <p>
                KOI may integrate with third-party services (LLM providers, MCP servers, package registries).
                Your use of these services is governed by their respective terms of service and privacy policies.
                We are not responsible for the content, accuracy, or practices of third-party services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">6. Modifications to Terms</h2>
              <p>
                We reserve the right to modify these terms at any time. Changes will be effective immediately
                upon posting. Your continued use of the Software after changes constitutes acceptance of the modified terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-terminal-text mb-3">7. Governing Law</h2>
              <p>
                These terms shall be governed by and construed in accordance with the laws applicable
                in the jurisdiction where the copyright holder resides, without regard to conflict of law provisions.
              </p>
            </section>
          </div>
        </ScrollReveal>
      </div>
    </div>
  )
}
