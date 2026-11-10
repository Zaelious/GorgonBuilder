/** Full-page navigation to the OAuth provider. Isolated so tests can observe it. */
export function redirectTo(url: string): void {
  window.location.assign(url);
}
