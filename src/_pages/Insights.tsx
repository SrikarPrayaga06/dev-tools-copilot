// Insights.tsx
import React, { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism";

interface InsightsData {
  summary: string;
  code?: string;
  faqs: string[];
  clarifications: string[];
  nextSteps: string[];
}

interface InsightsProps {
  onClose: () => void;
  currentLanguage: string;
}

export const Insights: React.FC<InsightsProps> = ({ onClose, currentLanguage }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cleanups = [
      window.electronAPI.onInsightsGenerating(() => setLoading(true)),
      window.electronAPI.onInsightsComplete((insightsData: InsightsData) => {
        setData(insightsData);
        setLoading(false);
      }),
      window.electronAPI.onInsightsError((err: string) => {
        setError(err);
        setLoading(false);
      }),
    ];

    return () => cleanups.forEach(c => c());
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-black/90 border border-white/10 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-black/95 border-b border-white/10 p-4 flex justify-between items-center">
          <h2 className="text-lg font-medium text-white">Insights from Audio</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-white/50" />
              <span className="ml-3 text-white/70">Generating insights...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
              {error}
            </div>
          )}

          {data && (
            <>
              <Section title="Summary">{data.summary}</Section>

              {data.code && (
                <div>
                  <h3 className="text-sm font-medium text-white mb-2">Code Solution</h3>
                  <SyntaxHighlighter
                    language={currentLanguage === "golang" ? "go" : currentLanguage}
                    style={dracula}
                    customStyle={{
                      margin: 0,
                      padding: "1rem",
                      backgroundColor: "rgba(22, 27, 34, 0.5)",
                    }}
                  >
                    {data.code}
                  </SyntaxHighlighter>
                </div>
              )}

              {data.faqs.length > 0 && (
                <Section title="FAQs">
                  <ul className="space-y-2">
                    {data.faqs.map((faq, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-blue-400">Q:</span>
                        <span>{faq}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {data.clarifications.length > 0 && (
                <Section title="Clarifications">
                  <ul className="space-y-1">
                    {data.clarifications.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-yellow-400">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {data.nextSteps.length > 0 && (
                <Section title="Next Steps">
                  <ol className="space-y-1">
                    {data.nextSteps.map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-green-400">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div>
    <h3 className="text-sm font-medium text-white mb-2">{title}</h3>
    <div className="text-sm text-gray-300 leading-relaxed">{children}</div>
  </div>
);

export default Insights;
