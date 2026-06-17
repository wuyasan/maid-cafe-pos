from pathlib import Path
import sys

project = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
api_file = project / "staff-web/lib/api.ts"

if not api_file.exists():
    raise SystemExit(f"Missing: {api_file}")

text = api_file.read_text(encoding="utf-8")

if "export async function apiPut" not in text:
    helper = """
export async function apiPut<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(
    `${getApiBase()}${path}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  return handleResponse<T>(response);
}
"""
    api_file.write_text(text + helper, encoding="utf-8")
    print("Added apiPut to staff-web/lib/api.ts")
else:
    print("apiPut already exists.")

print("Installer finished.")
