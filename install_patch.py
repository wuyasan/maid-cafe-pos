from pathlib import Path
import re
import sys

project = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
page_file = project / "customer-web/app/order/[tableCode]/page.tsx"

if not page_file.exists():
    raise SystemExit(f"Missing: {page_file}")

text = page_file.read_text(encoding="utf-8")

import_line = (
    'import { clearCartDraft, restoreCartDraft, saveCartDraft } '
    'from "@/lib/cartDraft";'
)

if import_line not in text:
    api_import_pattern = re.compile(
        r'import\s*\{\s*apiGet\s*,\s*apiPost\s*\}\s*'
        r'from\s*"@/lib/api";'
    )
    match = api_import_pattern.search(text)

    if not match:
        raise SystemExit(
            "Could not find the apiGet/apiPost import in page.tsx"
        )

    text = text[:match.end()] + "\n" + import_line + text[match.end():]

draft_state = "const [draftReady, setDraftReady] = useState(false);"

if draft_state not in text:
    cart_state_pattern = re.compile(
        r'const\s*\[\s*cart\s*,\s*setCart\s*\]\s*=\s*'
        r'useState\s*<\s*CartLine\[\]\s*>\s*\(\s*\[\s*\]\s*\)\s*;'
    )
    match = cart_state_pattern.search(text)

    if not match:
        raise SystemExit(
            "Could not find the cart state in page.tsx"
        )

    text = text[:match.end()] + "\n  " + draft_state + text[match.end():]

if "const restoredDraft = restoreCartDraft(" not in text:
    load_page_index = text.find("async function loadPage")
    if load_page_index < 0:
        raise SystemExit("Could not find loadPage()")

    bill_pattern = re.compile(
        r'setBill\s*\(\s*billData\s*\)\s*;'
    )
    match = bill_pattern.search(text, load_page_index)

    if not match:
        raise SystemExit(
            "Could not find setBill(billData) inside loadPage()"
        )

    restore_code = '\n      const restoredDraft = restoreCartDraft(\n        code,\n        orderSource,\n        currentSession.session?.id ?? null,\n        menuItems.filter(\n          (item) => item.is_active,\n        ),\n      );\n\n      if (restoredDraft.length > 0) {\n        setCart(restoredDraft);\n      }\n\n      setDraftReady(true);'
    text = text[:match.end()] + restore_code + text[match.end():]

if "if (!draftReady || !tableCode) return;" not in text:
    table_effect_pattern = re.compile(
        r'useEffect\s*\(\s*\(\s*\)\s*=>\s*\{\s*'
        r'if\s*\(\s*tableCode\s*\)\s*\{\s*'
        r'void\s+loadPage\s*\(\s*tableCode\s*\)\s*;\s*'
        r'\}\s*\}\s*,\s*\[\s*tableCode\s*\]\s*\)\s*;'
    )
    match = table_effect_pattern.search(text)

    if not match:
        raise SystemExit(
            "Could not find the tableCode load effect"
        )

    persistence_effect = '\n  useEffect(() => {\n    if (!draftReady || !tableCode) return;\n\n    saveCartDraft(\n      tableCode,\n      orderSource,\n      session?.id ?? null,\n      cart,\n    );\n  }, [\n    cart,\n    draftReady,\n    orderSource,\n    session?.id,\n    tableCode,\n  ]);'
    text = text[:match.end()] + persistence_effect + text[match.end():]

success_line = "clearCartDraft(tableCode, orderSource);"

if text.count(success_line) < 2:
    search_from = 0
    inserted = text.count(success_line)

    while inserted < 2:
        post_index = text.find("await apiPost(", search_from)

        if post_index < 0:
            break

        set_cart_match = re.search(
            r'setCart\s*\(\s*\[\s*\]\s*\)\s*;',
            text[post_index:],
        )

        if not set_cart_match:
            break

        absolute_index = post_index + set_cart_match.start()

        text = (
            text[:absolute_index]
            + success_line
            + "\n      "
            + text[absolute_index:]
        )

        inserted += 1
        search_from = absolute_index + len(success_line) + 20

    if inserted < 2:
        raise SystemExit(
            "Could not add draft clearing to both successful submit paths"
        )

page_file.write_text(text, encoding="utf-8")

print("Order draft persistence installed successfully.")
print("Updated:", page_file)
