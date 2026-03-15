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
    <div className="min-h-screen" style={{ background: "#F2E8D5" }}>
      <div className="container py-8 max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button className="pixel-btn" onClick={() => navigate("/")}>
            ← BACK
          </button>
          <h1 className="font-pixel text-sm" style={{ color: "#6B4C3B" }}>
            LLM SETTINGS
          </h1>
        </div>

        <div className="pixel-panel space-y-4">
          <div>
            <label className="font-pixel text-[11px] block mb-2" style={{ color: "#3A2A1A" }}>
              API KEY
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              className="w-full font-pixel-data text-base p-2"
              style={{
                background: "#F5ECD8",
                border: "2px solid #6B4C3B",
                color: "#6B4C3B",
              }}
              placeholder="sk-..."
            />
          </div>

          <div>
            <label className="font-pixel text-[11px] block mb-2" style={{ color: "#3A2A1A" }}>
              API URL
            </label>
            <input
              type="text"
              value={config.apiUrl}
              onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
              className="w-full font-pixel-data text-base p-2"
              style={{
                background: "#F5ECD8",
                border: "2px solid #6B4C3B",
                color: "#6B4C3B",
              }}
            />
          </div>

          <div>
            <label className="font-pixel text-[11px] block mb-2" style={{ color: "#3A2A1A" }}>
              MODEL
            </label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              className="w-full font-pixel-data text-base p-2"
              style={{
                background: "#F5ECD8",
                border: "2px solid #6B4C3B",
                color: "#6B4C3B",
              }}
            />
          </div>

          <button
            className="pixel-btn w-full mt-4"
            style={{ background: "#3D6B4F" }}
            onClick={handleSave}
          >
            SAVE SETTINGS
          </button>
        </div>
      </div>
    </div>
  );
}
