const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const SETTINGS_API_BASE = `${BACKEND_URL}/api/v1/settings`;

function parseResponseBody(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const payloadText = await response.text();
  const payload = parseResponseBody(payloadText);

  if (!response.ok) {
    const message =
      payload?.detail || payload?.message || payloadText || response.statusText;
    throw new Error(typeof message === "string" ? message : "Request failed");
  }

  return payload as T;
}

export interface RegexEntry {
  regex_id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  source_csv?: string | null;
  patterns: string[];
  created_by?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface RegexGenerateResponse {
  workspace_id: string;
  name?: string | null;
  description?: string | null;
  patterns: string[];
}

export interface RegexListResponse {
  workspace_id: string;
  entries: RegexEntry[];
}

export interface RegexSavePayload {
  workspace_id: string;
  name: string;
  patterns: string[];
  description?: string | null;
  source_csv?: string | null;
  created_by?: string | null;
}

export async function generateRegexFromCsv(
  formData: FormData
): Promise<RegexGenerateResponse> {
  const response = await fetch(`${SETTINGS_API_BASE}/regex/generate`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<RegexGenerateResponse>(response);
}

export async function listWorkspaceRegex(
  workspaceId: string
): Promise<RegexEntry[]> {
  const url = new URL(`${SETTINGS_API_BASE}/regex`);
  url.searchParams.set("workspace_id", workspaceId);

  const response = await fetch(url.toString());
  const data = await handleResponse<RegexListResponse>(response);
  return data.entries || [];
}

export async function saveRegexConfiguration(
  body: RegexSavePayload
): Promise<RegexEntry> {
  const response = await fetch(`${SETTINGS_API_BASE}/regex`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return handleResponse<RegexEntry>(response);
}
