"use client";

import AuthGuard from "@/components/AuthGuard";
import Header from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import {
  generateRegexFromCsv,
  listWorkspaceRegex,
  saveRegexConfiguration,
  RegexEntry,
} from "@/services/settingsService";
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Notification = {
  type: "success" | "error";
  message: string;
};

export default function SettingsPage() {
  const { user } = useAuth();

  const defaultWorkspaceId = useMemo(() => {
    if (!user) return "";
    const metadata = user.user_metadata ?? {};
    return (
      metadata.workspace_id ||
      metadata.agency ||
      metadata.department ||
      user.email ||
      user.id ||
      ""
    );
  }, [user]);

  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [descriptionColumn, setDescriptionColumn] = useState("description");
  const [regexName, setRegexName] = useState("");
  const [regexDescription, setRegexDescription] = useState("");
  const [generatedPatterns, setGeneratedPatterns] = useState<string[]>([]);
  const [savedPatterns, setSavedPatterns] = useState<RegexEntry[]>([]);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [clipboardFeedback, setClipboardFeedback] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (defaultWorkspaceId) {
      setWorkspaceId(defaultWorkspaceId);
    }
  }, [defaultWorkspaceId]);

  const loadSavedPatterns = useCallback(async () => {
    if (!workspaceId) return;
    setIsRefreshing(true);
    try {
      const entries = await listWorkspaceRegex(workspaceId);
      setSavedPatterns(entries);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load saved regex";
      setNotification({ type: "error", message });
    } finally {
      setIsRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadSavedPatterns();
  }, [loadSavedPatterns]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setGeneratedPatterns([]);
    setNotification(null);
  };

  const handleGenerate = async () => {
    if (!selectedFile) {
      setNotification({
        type: "error",
        message: "Please upload a CSV file before generating regex.",
      });
      return;
    }

    setIsGenerating(true);
    setNotification(null);
    const formData = new FormData();
    formData.append("workspace_id", workspaceId || "workspace-default");
    formData.append("description_column", descriptionColumn.trim() || "description");
    formData.append("csv_file", selectedFile);

    if (regexName.trim()) {
      formData.append("regex_name", regexName.trim());
    }
    if (regexDescription.trim()) {
      formData.append("description", regexDescription.trim());
    }

    try {
      const result = await generateRegexFromCsv(formData);
      setGeneratedPatterns(result.patterns || []);
      setNotification({
        type: "success",
        message: `Generated ${result.patterns.length} pattern(s).`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to generate regex";
      setNotification({ type: "error", message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedPatterns.length) {
      setNotification({
        type: "error",
        message: "Generate regex patterns before saving them.",
      });
      return;
    }

    setIsSaving(true);
    setNotification(null);

    try {
      await saveRegexConfiguration({
        workspace_id: workspaceId || "workspace-default",
        name: regexName.trim() || "Generated Regex Set",
        description: regexDescription || null,
        patterns: generatedPatterns,
        source_csv: selectedFile?.name ?? null,
        created_by: user?.id ?? null,
      });
      setNotification({
        type: "success",
        message: "Regex configuration saved for the workspace.",
      });
      loadSavedPatterns();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save regex configuration";
      setNotification({ type: "error", message });
    } finally {
      setIsSaving(false);
    }
  };

  const copyPattern = async (pattern: string) => {
    if (!navigator?.clipboard) {
      setNotification({
        type: "error",
        message: "Clipboard access is unavailable in this browser.",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(pattern);
      setClipboardFeedback(pattern);
      setTimeout(() => setClipboardFeedback(null), 2000);
    } catch {
      setNotification({
        type: "error",
        message: "Unable to copy pattern to clipboard.",
      });
    }
  };

  const formatTimestamp = (value: string) => {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Workspace Regex Admin
              </h1>
              <p className="text-sm text-gray-600">
                Generate and persist partner regex templates for your workspace.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-1 text-sm font-medium text-white">
              Workspace:
              <strong className="text-sm">{workspaceId || "pending..."}</strong>
            </span>
          </div>

          {notification && (
            <div
              className={`rounded-md px-4 py-3 text-sm ${
                notification.type === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {notification.message}
            </div>
          )}

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-gray-900">
                Upload CSV &amp; Generate Patterns
              </h2>
              <p className="text-sm text-gray-500">
                Upload a CSV with transaction descriptions and the backend will
                iteratively generate regex heuristics using the agent engine.
                Include the column name that contains the raw description string.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  CSV File
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                />
                {selectedFile && (
                  <p className="text-xs text-gray-500">
                    Selected file: <strong>{selectedFile.name}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Description Column
                </label>
                <input
                  type="text"
                  value={descriptionColumn}
                  onChange={(event) => setDescriptionColumn(event.target.value)}
                  placeholder="description"
                  className="block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500">
                  Column name that contains the transaction description.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Regex Name
                </label>
                <input
                  type="text"
                  value={regexName}
                  onChange={(event) => setRegexName(event.target.value)}
                  placeholder="NEFT beneficiary capture"
                  className="block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={regexDescription}
                  onChange={(event) => setRegexDescription(event.target.value)}
                  placeholder="Generic NEFT/RTGS formats"
                  className="block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !selectedFile}
                className="flex items-center justify-center gap-2 rounded border border-transparent bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isGenerating ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                    Generating...
                  </>
                ) : (
                  "Generate regex"
                )}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !generatedPatterns.length}
                className="flex items-center justify-center gap-2 rounded border border-transparent bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {isSaving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                    Saving...
                  </>
                ) : (
                  "Save patterns to workspace"
                )}
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Generated Patterns ({generatedPatterns.length})
                </h2>
                <p className="text-xs text-gray-500">
                  Click any pattern to copy it to the clipboard.
                </p>
              </div>
              {clipboardFeedback && (
                <span className="text-xs font-medium text-blue-600">
                  Copied pattern to clipboard
                </span>
              )}
            </div>
            {generatedPatterns.length === 0 ? (
              <p className="text-sm text-gray-500">
                No patterns generated yet.
              </p>
            ) : (
              <div className="grid gap-3">
                {generatedPatterns.map((pattern) => (
                  <button
                    key={pattern}
                    onClick={() => copyPattern(pattern)}
                    className="text-left text-sm text-gray-800 transition hover:bg-gray-100"
                  >
                    <span className="font-mono text-xs text-gray-600">
                      {pattern}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Saved Workspace Regex
                </h2>
                <p className="text-xs text-gray-500">
                  These regex sets are visible to your workspace members.
                </p>
              </div>
              <button
                type="button"
                onClick={loadSavedPatterns}
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                {isRefreshing ? "Refreshing..." : "Refresh list"}
              </button>
            </div>

            {savedPatterns.length === 0 ? (
              <p className="text-sm text-gray-500">
                No saved regex templates yet. Save patterns once you are happy
                with them.
              </p>
            ) : (
              <div className="space-y-4">
                {savedPatterns.map((entry) => (
                  <div
                    key={entry.regex_id}
                    className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {entry.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          Source CSV: {entry.source_csv || "manual"} •
                          Created at: {formatTimestamp(entry.created_at)}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600">
                        {entry.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    {entry.description && (
                      <p className="mt-2 text-xs text-gray-600">
                        {entry.description}
                      </p>
                    )}
                    <div className="mt-3 grid gap-2">
                      {entry.patterns.map((pattern, index) => (
                        <button
                          key={`${entry.regex_id}-${index}`}
                          onClick={() => copyPattern(pattern)}
                          className="text-left text-xs text-gray-700 transition hover:bg-white"
                        >
                          <span className="font-mono break-words">{pattern}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </AuthGuard>
  );
}
