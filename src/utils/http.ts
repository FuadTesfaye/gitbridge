import { GITBRIDGE_VERSION } from "@/version";

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  params?: Record<string, string | number | boolean | undefined>;
  /** Allow cleartext HTTP. Default false — credentials must not go over HTTP. */
  allowHttp?: boolean;
}

export async function requestJson<T>(
  url: string,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "GET",
  body?: unknown,
  options: HttpRequestOptions = {}
): Promise<{ data: T; status: number; headers: Headers }> {
  let targetUrl = url;
  if (options.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      targetUrl += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  try {
    const headers: Record<string, string> = {
      "User-Agent": `GitBridge-CLI/${GITBRIDGE_VERSION}`,
      Accept: "application/json",
      ...options.headers,
    };

    let serializedBody: string | undefined;
    if (body !== undefined) {
      if (typeof body === "string") {
        serializedBody = body;
      } else {
        serializedBody = JSON.stringify(body);
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
    }

    if (/^http:\/\//i.test(targetUrl) && !options.allowHttp && process.env.GITBRIDGE_ALLOW_HTTP !== "1") {
      throw new Error(`Refusing cleartext HTTP request to ${url}. Use HTTPS or pass --insecure-http.`);
    }

    const res = await fetch(targetUrl, {
      method,
      headers,
      body: serializedBody,
      signal: controller.signal,
      // Do not follow redirects: Authorization headers would otherwise be sent to a new host.
      redirect: "error",
    });

    clearTimeout(timeout);

    let responseData: unknown;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      responseData = await res.json();
    } else {
      const text = await res.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = text;
      }
    }

    return {
      data: responseData as T,
      status: res.status,
      headers: res.headers,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${options.timeoutMs ?? 15000}ms`);
    }
    throw err;
  }
}
