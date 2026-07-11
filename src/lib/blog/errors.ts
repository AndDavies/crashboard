function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

export function isTransientPublicContentError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return (
    /error code 5\d\d/.test(message) ||
    message.includes("web server is down") ||
    message.includes("gateway timeout") ||
    message.includes("service unavailable") ||
    message.includes("connection terminated due to connection timeout") ||
    message.includes("fetch failed") ||
    message.includes("network error") ||
    message.includes("timed out")
  );
}
