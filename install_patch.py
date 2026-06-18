from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path


def add_suspense_import(text: str) -> str:
    pattern = re.compile(
        r'import\s*\{(?P<names>[^}]*)\}\s*from\s*["\']react["\'];?',
        re.S,
    )
    match = pattern.search(text)
    if match:
        names = [name.strip() for name in match.group("names").split(",") if name.strip()]
        if "Suspense" not in names:
            names.insert(0, "Suspense")
            replacement = 'import { ' + ", ".join(names) + ' } from "react";'
            text = text[:match.start()] + replacement + text[match.end():]
        return text

    pattern = re.compile(r'import\s+React\s+from\s+["\']react["\'];?')
    match = pattern.search(text)
    if match:
        insertion = match.end()
        return text[:insertion] + '\nimport { Suspense } from "react";' + text[insertion:]

    directive = re.match(r'(\s*["\']use client["\'];?\s*)', text)
    if directive:
        insertion = directive.end()
        return text[:insertion] + '\nimport { Suspense } from "react";\n' + text[insertion:]

    return 'import { Suspense } from "react";\n' + text


def find_matching_brace(text: str, open_index: int) -> int:
    depth = 0
    i = open_index
    state = "code"
    quote = ""

    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if state == "code":
            if ch in ("'", '"', "`"):
                state = "string"
                quote = ch
            elif ch == "/" and nxt == "/":
                state = "line_comment"
                i += 1
            elif ch == "/" and nxt == "*":
                state = "block_comment"
                i += 1
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return i
        elif state == "string":
            if ch == "\\":
                i += 1
            elif ch == quote:
                state = "code"
        elif state == "line_comment":
            if ch == "\n":
                state = "code"
        elif state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "code"
                i += 1

        i += 1

    raise RuntimeError("Could not find the end of the default page component.")


def transform_file(path: Path) -> str:
    original = path.read_text(encoding="utf-8")

    if "useSearchParams(" not in original:
        return "skip: no useSearchParams"

    if "<Suspense" in original:
        return "skip: already has Suspense"

    pattern = re.compile(
        r'export\s+default\s+function\s+(?P<name>[A-Za-z_$][\w$]*)\s*'
        r'(?P<params>\([^)]*\))\s*(?P<return_type>:\s*[^\{]+)?\{'
    )
    match = pattern.search(original)

    if not match:
        raise RuntimeError(
            "Unsupported page shape. Expected `export default function PageName() {`."
        )

    name = match.group("name")
    params = match.group("params")
    open_brace = match.end() - 1
    close_brace = find_matching_brace(original, open_brace)

    if params.strip() != "()":
        raise RuntimeError(
            f"Default component {name}{params} has parameters; automatic wrapping was skipped."
        )

    inner_name = f"{name}Content"
    header = original[match.start():open_brace + 1]
    new_header = re.sub(
        r'export\s+default\s+function\s+' + re.escape(name),
        f'function {inner_name}',
        header,
        count=1,
    )

    before = original[:match.start()]
    body_and_close = original[open_brace + 1:close_brace + 1]
    after = original[close_brace + 1:]

    wrapper = f'''

export default function {name}() {{
  return (
    <Suspense fallback={{<div style={{{{ padding: 24 }}}}>Loading...</div>}}>
      <{inner_name} />
    </Suspense>
  );
}}
'''

    updated = before + new_header + body_and_close + wrapper + after
    updated = add_suspense_import(updated)

    backup = path.with_suffix(path.suffix + ".before-suspense-fix")
    if not backup.exists():
        shutil.copy2(path, backup)

    path.write_text(updated, encoding="utf-8")
    return "fixed"


def main() -> int:
    project_root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd().resolve()

    roots = [
        project_root / "staff-web",
        project_root / "customer-web",
    ]

    candidates = []
    for app_root in roots:
        app_dir = app_root / "app"
        if not app_dir.exists():
            continue
        for path in app_dir.rglob("page.tsx"):
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            if "useSearchParams(" in text:
                candidates.append(path)

    if not candidates:
        print("No page.tsx files using useSearchParams() were found.")
        return 0

    print("Found pages using useSearchParams():")
    for path in candidates:
        print(" -", path.relative_to(project_root))

    failures = []
    changed = 0
    for path in candidates:
        try:
            result = transform_file(path)
            print(f"[{result}] {path.relative_to(project_root)}")
            if result == "fixed":
                changed += 1
        except Exception as exc:
            failures.append((path, str(exc)))
            print(f"[ERROR] {path.relative_to(project_root)}: {exc}")

    print()
    print(f"Changed {changed} file(s).")
    print("Backups use the suffix: .before-suspense-fix")

    if failures:
        print()
        print("Some files were not changed automatically:")
        for path, error in failures:
            print(f" - {path.relative_to(project_root)}: {error}")
        return 1

    print()
    print("Next:")
    print("  cd staff-web && rm -rf .next && npm run build")
    print("  cd customer-web && rm -rf .next && npm run build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
