/**
 * Names an error for the server log without its message. Database driver
 * messages can carry connection details, which must never be logged.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
    return `${error.name}${code}`;
  }
  // The Neon driver can reject with a websocket event rather than an Error.
  return Object.prototype.toString.call(error);
}
