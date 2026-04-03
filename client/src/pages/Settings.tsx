import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface LLMConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
}

export default function Settings() {
  const [, navigate] = useLocation();
  const [config, setConfig] = useState<LLMConfig>({
    apiKey: "",
    apiUrl: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
  });

  useEffect(() => {
    const saved = localStorage.getItem("llm_config");
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch {}
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem("llm_config", JSON.stringify(config));
    navigate("/");
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="container py-8 max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button className="sa-btn" onClick={() => navigate("/")}>
            Back
          </button>
          <h1 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
            LLM Settings
          </h1>
        </div>

        <div className="sa-card space-y-5">
          <div>
            <label className="text-xs font-semibold block mb-2" style={{ color: "var(--muted-foreground)" }}>
              API Key
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              className="w-full text-sm p-3 rounded-lg transition-all"
              style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.04)",
              }}
              placeholder="sk-..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-2" style={{ color: "var(--muted-foreground)" }}>
              API URL
            </label>
            <input
              type="text"
              value={config.apiUrl}
              onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
              className="w-full text-sm p-3 rounded-lg"
              style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.04)",
              }}
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-2" style={{ color: "var(--muted-foreground)" }}>
              Model
            </label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              className="w-full text-sm p-3 rounded-lg"
              style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.04)",
              }}
            />
          </div>

          <button
            className="sa-btn sa-btn-primary w-full mt-4 py-3"
            onClick={handleSave}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
