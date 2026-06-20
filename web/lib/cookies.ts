// Tiny client cookie helper. Kept outside component scope so the document.cookie
// write isn't flagged by the react-hooks immutability rule.
export function setCookie(name: string, value: string, maxAgeSec = 31536000): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSec}; samesite=lax`;
}
