const configuredBasePath =
  process.env.NEXT_PUBLIC_BASE_PATH ?? "/maid-cafe";

export const BASE_PATH =
  configuredBasePath === "/"
    ? ""
    : `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`;

/**
 * Prefix a same-origin absolute path for the sub-path deployment.
 *
 * Next.js applies basePath to Link and router navigation automatically, but
 * browser APIs such as fetch(), window.location and plain <img> URLs do not.
 */
export function withBasePath(path: string): string {
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path === BASE_PATH ||
    path.startsWith(`${BASE_PATH}/`)
  ) {
    return path;
  }

  return `${BASE_PATH}${path}`;
}
