import { useEffect, useState } from "react";
import { Loader2, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { extractApiError } from "../../api/client";
import { formatModelLabel, listModels, type OllamaModel } from "../../api/llm";
import {
  getMyLLMPreferences,
  testLLM,
  updateMyLLMPreferences,
  type LLMOptions,
} from "../../api/llmPrefs";

// Define the user-tunable parameters in one place so the form generates
// itself. Each entry is one row in the UI.
type ParamKey = keyof Omit<LLMOptions, "stop">;

interface ParamSpec {
  key: ParamKey;
  label: string;
  hint: string;
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  default_hint: string;
}

const PARAMS: ParamSpec[] = [
  {
    key: "temperature",
    label: "Temperature",
    hint: "Randomness. 0 = deterministic, 1 = balanced, 2 = wild.",
    type: "number", min: 0, max: 2, step: 0.05,
    default_hint: "0.8",
  },
  {
    key: "top_p",
    label: "Top P",
    hint: "Nucleus sampling. 0.9 keeps the top-90% probability mass.",
    type: "number", min: 0, max: 1, step: 0.05,
    default_hint: "0.9",
  },
  {
    key: "top_k",
    label: "Top K",
    hint: "Sample from the K most likely tokens. 0 = disable.",
    type: "number", min: 0, max: 1000, step: 1,
    default_hint: "40",
  },
  {
    key: "num_ctx",
    label: "Context window (num_ctx)",
    hint: "Max input tokens the model can attend to. Larger = more memory.",
    type: "number", min: 256, max: 131072, step: 256,
    default_hint: "2048",
  },
  {
    key: "num_predict",
    label: "Max output tokens (num_predict)",
    hint: "Hard cap on generation. -1 = unlimited.",
    type: "number", min: -1, max: 131072, step: 1,
    default_hint: "128",
  },
  {
    key: "repeat_penalty",
    label: "Repeat penalty",
    hint: "Penalises repeating tokens. 1 = none, 1.1 = mild.",
    type: "number", min: 0, max: 5, step: 0.05,
    default_hint: "1.1",
  },
  {
    key: "seed",
    label: "Seed",
    hint: "Set for reproducible outputs. 0 = random.",
    type: "number", step: 1,
    default_hint: "0",
  },
  {
    key: "mirostat",
    label: "Mirostat",
    hint: "Adaptive sampling. 0 = off, 1 = v1, 2 = v2.",
    type: "number", min: 0, max: 2, step: 1,
    default_hint: "0",
  },
  {
    key: "mirostat_eta",
    label: "Mirostat eta",
    hint: "Mirostat learning rate (only when mirostat ≠ 0).",
    type: "number", min: 0, max: 1, step: 0.01,
    default_hint: "0.1",
  },
  {
    key: "mirostat_tau",
    label: "Mirostat tau",
    hint: "Mirostat target perplexity (only when mirostat ≠ 0).",
    type: "number", min: 0, max: 20, step: 0.1,
    default_hint: "5.0",
  },
];

export function LLMPage() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);

  const [model, setModel] = useState<string>("");
  const [options, setOptions] = useState<LLMOptions>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Test panel
  const [testPrompt, setTestPrompt] = useState(
    "In one sentence, introduce yourself.",
  );
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ output: string; model: string; ms: number } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // -------- Load models + saved prefs --------
  const loadModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const r = await listModels();
      setModels(r.models);
    } catch (e) {
      setModelsError(extractApiError(e));
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    loadModels();
    getMyLLMPreferences()
      .then(p => {
        setModel(p.model ?? "");
        setOptions(p.options ?? {});
      })
      .catch(e => setError(extractApiError(e)))
      .finally(() => setLoading(false));
  }, []);

  // -------- Helpers --------
  const setOption = (k: ParamKey, v: number | null) => {
    setOptions(prev => ({ ...prev, [k]: v }));
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const cleaned: LLMOptions = {};
      for (const p of PARAMS) {
        const v = options[p.key];
        if (v !== null && v !== undefined && !Number.isNaN(v as number)) {
          cleaned[p.key] = v as number;
        }
      }
      const result = await updateMyLLMPreferences({
        model: model.trim() || null,
        options: cleaned,
      });
      setModel(result.model ?? "");
      setOptions(result.options ?? {});
      setSavedMsg("LLM preferences saved.");
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const onResetParams = () => {
    setOptions({});
    setSavedMsg(null);
  };

  const onTest = async () => {
    setTestRunning(true);
    setTestError(null);
    setTestResult(null);
    try {
      const cleaned: LLMOptions = {};
      for (const p of PARAMS) {
        const v = options[p.key];
        if (v !== null && v !== undefined && !Number.isNaN(v as number)) {
          cleaned[p.key] = v as number;
        }
      }
      const r = await testLLM({
        model: model.trim() || null,
        options: cleaned,
        prompt: testPrompt,
      });
      setTestResult({ output: r.output, model: r.model, ms: r.duration_ms });
    } catch (e) {
      setTestError(extractApiError(e));
    } finally {
      setTestRunning(false);
    }
  };

  if (loading) return <div className="card text-sm text-kpmg-gray-500">Loading…</div>;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-kpmg-gray-800">LLM preferences</h2>
        <p className="text-sm text-kpmg-gray-500 mt-1">
          Configure the model and sampling parameters used when reviewing proposals and
          extracting metadata. The app talks to the shared Ollama service at the host —
          a separate Ollama container is not run.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {savedMsg && (
        <div role="status" className="p-3 rounded bg-green-50 border border-green-200 text-sm text-green-800">
          {savedMsg}
        </div>
      )}

      {/* Model picker */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm uppercase tracking-wider text-kpmg-gray-400 font-semibold">
            Model
          </h3>
          <button
            type="button"
            onClick={loadModels}
            disabled={loadingModels}
            className="text-xs text-kpmg-blue hover:text-kpmg-purple inline-flex items-center"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loadingModels ? "animate-spin" : ""}`} />
            Refresh from Ollama
          </button>
        </div>

        {modelsError ? (
          <p className="text-xs text-kpmg-warning">
            Could not reach Ollama: {modelsError}
          </p>
        ) : (
          <>
            <select
              className="input-field"
              value={model}
              onChange={e => setModel(e.target.value)}
              disabled={loadingModels}
            >
              <option value="">— Use system default ({models[0]?.name ?? "gemma4:latest"}) —</option>
              {models.map(m => (
                <option key={m.name} value={m.name}>
                  {formatModelLabel(m)}
                </option>
              ))}
              {model && !models.find(m => m.name === model) && (
                <option value={model}>{model} (not available locally)</option>
              )}
            </select>
            <p className="text-xs text-kpmg-gray-500">
              {loadingModels
                ? "Loading models from Ollama…"
                : `${models.length} model${models.length === 1 ? "" : "s"} loaded from the shared Ollama service.`}
            </p>
          </>
        )}
      </div>

      {/* Parameters */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm uppercase tracking-wider text-kpmg-gray-400 font-semibold">
            Sampling parameters
          </h3>
          <button type="button" onClick={onResetParams} className="text-xs text-kpmg-blue hover:text-kpmg-purple">
            Reset to model defaults
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PARAMS.map(p => {
            const v = options[p.key];
            const isSet = v !== null && v !== undefined && !Number.isNaN(v as number);
            return (
              <div key={p.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-kpmg-gray-700">
                    {p.label}
                  </label>
                  {!isSet && (
                    <span className="text-xs text-kpmg-gray-400">
                      default: {p.default_hint}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="input-field"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={isSet ? (v as number) : ""}
                    placeholder={p.default_hint}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === "") setOption(p.key, null);
                      else setOption(p.key, Number(raw));
                    }}
                  />
                  {isSet && (
                    <button
                      type="button"
                      onClick={() => setOption(p.key, null)}
                      className="text-xs text-kpmg-gray-400 hover:text-kpmg-error px-2"
                      title="Use model default"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p className="text-xs text-kpmg-gray-400">{p.hint}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end gap-3">
        <button onClick={onSave} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>

      {/* Test panel */}
      <div className="card space-y-4 border-l-4 border-kpmg-lightblue">
        <div>
          <h3 className="text-sm uppercase tracking-wider text-kpmg-gray-400 font-semibold">
            Test this configuration
          </h3>
          <p className="text-xs text-kpmg-gray-500 mt-1">
            Run a one-shot prompt against the current model + parameters (uses unsaved
            values too). Cold-starts can take a minute on first call.
          </p>
        </div>

        <textarea
          className="input-field text-sm"
          rows={2}
          value={testPrompt}
          onChange={e => setTestPrompt(e.target.value)}
          disabled={testRunning}
        />

        <div className="flex items-center gap-3">
          <button onClick={onTest} disabled={testRunning || !testPrompt.trim()} className="btn-secondary">
            {testRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Run test
              </>
            )}
          </button>
        </div>

        {testError && (
          <div role="alert" className="p-3 rounded bg-red-50 border border-red-200 text-sm text-kpmg-error">
            {testError}
          </div>
        )}

        {testResult && (
          <div className="rounded bg-kpmg-gray-50 p-3 text-sm">
            <div className="text-xs text-kpmg-gray-500 mb-2">
              {testResult.model} · {(testResult.ms / 1000).toFixed(1)}s
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs text-kpmg-gray-800">
              {testResult.output}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}
