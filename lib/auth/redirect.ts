/** Return only a same-site relative redirect; never redirect to a network-path URL. */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;

  // URL parsers, proxies and browsers may strip tab/CR/LF, treat backslashes as
  // slashes, or decode escapes at different points in the login flow.
  // Reject ambiguity before parsing and avoid returning a normalized path.
  const pathname = value.split(/[?#]/, 1)[0] ?? "";
  if (
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value) ||
    /%2f/i.test(pathname) ||
    /%(?:25(?:0[0-9a-f]|1[0-9a-f]|7f|5c))/i.test(value) ||
    /%252f/i.test(pathname)
  ) return fallback;

  try {
    const parsed = new URL(value, "https://aspire.invalid");
    if (parsed.origin !== "https://aspire.invalid" || parsed.pathname.startsWith("//")) {
      return fallback;
    }
    return value;
  } catch {
    return fallback;
  }
}
