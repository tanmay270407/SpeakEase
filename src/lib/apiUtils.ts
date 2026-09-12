export interface SafeApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string | null;
  isJson: boolean;
}

/**
 * Safely handles API responses, checking Content-Type, status code,
 * and reading text before attempting JSON parsing.
 * Never throws unhandled SyntaxErrors on non-JSON server responses.
 */
export async function parseJsonResponseSafely<T = any>(res: Response): Promise<SafeApiResponse<T>> {
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.toLowerCase().includes("application/json");

  if (!isJson) {
    let rawText = "";
    try {
      rawText = await res.text();
    } catch {
      rawText = "";
    }
    const truncatedText = rawText.length > 250 ? rawText.substring(0, 250) + "..." : rawText;
    const cleanText = truncatedText.replace(/\s+/g, ' ').trim();
    return {
      ok: false,
      status: res.status,
      data: null,
      errorMessage: `Server returned non-JSON response (HTTP ${res.status}): ${cleanText || 'Empty response body'}`,
      isJson: false
    };
  }

  try {
    const json = await res.json();
    if (!res.ok) {
      const msg = json.error || json.message || json.details || `Server returned error status HTTP ${res.status}`;
      return {
        ok: false,
        status: res.status,
        data: json,
        errorMessage: typeof msg === 'string' ? msg : JSON.stringify(msg),
        isJson: true
      };
    }
    
    // Check standard envelope { success: boolean, data: ... }
    if (json && typeof json === 'object' && 'success' in json) {
      if (json.success === false) {
        return {
          ok: false,
          status: res.status,
          data: json,
          errorMessage: json.error || json.message || "Request returned unsuccessful status",
          isJson: true
        };
      }
      // If success is true and data field exists, use data field
      if (json.success === true && 'data' in json) {
        return {
          ok: true,
          status: res.status,
          data: json.data as T,
          errorMessage: null,
          isJson: true
        };
      }
    }

    return {
      ok: true,
      status: res.status,
      data: json as T,
      errorMessage: null,
      isJson: true
    };
  } catch (parseErr: any) {
    return {
      ok: false,
      status: res.status,
      data: null,
      errorMessage: `Failed to parse JSON response: ${parseErr.message || 'Invalid JSON format'}`,
      isJson: false
    };
  }
}
