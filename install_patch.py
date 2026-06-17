from pathlib import Path
import re
import sys

project = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()

checkout_file = project / "backend/app/api/v1/endpoints/staff_checkout.py"
types_file = project / "staff-web/lib/types.ts"

if not checkout_file.exists():
    raise SystemExit(f"Missing: {checkout_file}")
if not types_file.exists():
    raise SystemExit(f"Missing: {types_file}")

text = checkout_file.read_text(encoding="utf-8")

if "MenuItemComponent" not in text:
    old_import = "from app.models.menu import MenuItem"
    if old_import not in text:
        raise SystemExit("Could not find MenuItem import.")
    text = text.replace(
        old_import,
        "from app.models.menu import MenuItem, MenuItemComponent",
        1,
    )

for name in ["SessionSummarySetComponent,", "SessionSummarySetSource,"]:
    if name not in text:
        marker = "SessionSummaryItem,"
        index = text.find(marker)
        if index < 0:
            raise SystemExit("Could not find summary schema imports.")
        index += len(marker)
        text = text[:index] + "\n    " + name + text[index:]

pattern = re.compile(
    r'@router\.get\(\s*"/session-summary/\{session_id\}",.*?'
    r'(?=\n@router\.post\("/table/\{table_code\}/start-checkout"\))',
    flags=re.S,
)

match = pattern.search(text)
if not match:
    raise SystemExit("Could not locate current session summary endpoint.")

new_endpoint = '@router.get(\n    "/session-summary/{session_id}",\n    response_model=SessionSummaryResponse,\n)\ndef get_session_summary(\n    session_id: int,\n    db: Session = Depends(get_db),\n):\n    session_obj = db.get(SessionModel, session_id)\n\n    if not session_obj:\n        raise HTTPException(status_code=404, detail="Session not found.")\n\n    direct_rows = db.execute(\n        select(\n            MenuItem.id.label("menu_item_id"),\n            MenuItem.name.label("menu_item_name"),\n            MenuItem.item_type.label("item_type"),\n            MenuItem.is_bundle.label("is_bundle"),\n            func.coalesce(func.sum(OrderItem.quantity), 0).label(\n                "direct_ordered"\n            ),\n            func.coalesce(func.sum(OrderItem.total_price), 0).label(\n                "total_sales"\n            ),\n        )\n        .join(OrderItem, OrderItem.menu_item_id == MenuItem.id)\n        .join(Order, Order.id == OrderItem.order_id)\n        .join(Bill, Bill.id == Order.bill_id)\n        .join(SessionTable, SessionTable.id == Bill.session_table_id)\n        .where(SessionTable.session_id == session_id)\n        .group_by(\n            MenuItem.id,\n            MenuItem.name,\n            MenuItem.item_type,\n            MenuItem.is_bundle,\n        )\n    ).all()\n\n    component_rows = db.execute(\n        select(\n            MenuItemComponent.component_menu_item_id.label("menu_item_id"),\n            MenuItem.name.label("menu_item_name"),\n            MenuItem.item_type.label("item_type"),\n            MenuItem.is_bundle.label("is_bundle"),\n            MenuItemComponent.parent_menu_item_id.label("set_menu_item_id"),\n            MenuItemComponent.quantity.label("component_quantity_per_set"),\n            func.coalesce(func.sum(OrderItem.quantity), 0).label(\n                "set_quantity_ordered"\n            ),\n            func.coalesce(\n                func.sum(OrderItem.quantity * MenuItemComponent.quantity),\n                0,\n            ).label("quantity_from_set"),\n        )\n        .join(\n            MenuItem,\n            MenuItem.id == MenuItemComponent.component_menu_item_id,\n        )\n        .join(\n            OrderItem,\n            OrderItem.menu_item_id == MenuItemComponent.parent_menu_item_id,\n        )\n        .join(Order, Order.id == OrderItem.order_id)\n        .join(Bill, Bill.id == Order.bill_id)\n        .join(SessionTable, SessionTable.id == Bill.session_table_id)\n        .where(SessionTable.session_id == session_id)\n        .group_by(\n            MenuItemComponent.component_menu_item_id,\n            MenuItem.name,\n            MenuItem.item_type,\n            MenuItem.is_bundle,\n            MenuItemComponent.parent_menu_item_id,\n            MenuItemComponent.quantity,\n        )\n    ).all()\n\n    set_ids = {row.set_menu_item_id for row in component_rows}\n    set_names = {}\n\n    if set_ids:\n        set_names = {\n            item.id: item.name\n            for item in db.execute(\n                select(MenuItem).where(MenuItem.id.in_(set_ids))\n            )\n            .scalars()\n            .all()\n        }\n\n    item_map: dict[int, dict] = {}\n\n    for row in direct_rows:\n        item_map[row.menu_item_id] = {\n            "menu_item_id": row.menu_item_id,\n            "menu_item_name": row.menu_item_name,\n            "item_type": row.item_type,\n            "is_bundle": row.is_bundle,\n            "direct_ordered": int(row.direct_ordered),\n            "from_sets": 0,\n            "total_sales": row.total_sales,\n            "from_set_breakdown": [],\n        }\n\n    for row in component_rows:\n        entry = item_map.setdefault(\n            row.menu_item_id,\n            {\n                "menu_item_id": row.menu_item_id,\n                "menu_item_name": row.menu_item_name,\n                "item_type": row.item_type,\n                "is_bundle": row.is_bundle,\n                "direct_ordered": 0,\n                "from_sets": 0,\n                "total_sales": Decimal("0.00"),\n                "from_set_breakdown": [],\n            },\n        )\n\n        quantity_from_set = int(row.quantity_from_set)\n        entry["from_sets"] += quantity_from_set\n        entry["from_set_breakdown"].append(\n            SessionSummarySetSource(\n                set_menu_item_id=row.set_menu_item_id,\n                set_menu_item_name=set_names.get(\n                    row.set_menu_item_id,\n                    f"Set #{row.set_menu_item_id}",\n                ),\n                set_quantity_ordered=int(row.set_quantity_ordered),\n                component_quantity_per_set=int(\n                    row.component_quantity_per_set\n                ),\n                quantity_from_set=quantity_from_set,\n            )\n        )\n\n    set_component_map: dict[int, list[SessionSummarySetComponent]] = {}\n\n    for row in component_rows:\n        set_entry = item_map.get(row.set_menu_item_id)\n        set_total_ordered = (\n            set_entry["direct_ordered"]\n            if set_entry\n            else int(row.set_quantity_ordered)\n        )\n\n        set_component_map.setdefault(row.set_menu_item_id, []).append(\n            SessionSummarySetComponent(\n                menu_item_id=row.menu_item_id,\n                menu_item_name=row.menu_item_name,\n                item_type=row.item_type,\n                quantity_per_set=int(row.component_quantity_per_set),\n                total_quantity_from_set=(\n                    set_total_ordered\n                    * int(row.component_quantity_per_set)\n                ),\n            )\n        )\n\n    maid_rows = db.execute(\n        select(\n            MenuItem.id.label("menu_item_id"),\n            Maid.id.label("maid_id"),\n            Maid.name.label("maid_name"),\n            func.count(OrderItemMaid.id).label("total_ordered"),\n        )\n        .join(OrderItem, OrderItem.id == OrderItemMaid.order_item_id)\n        .join(MenuItem, MenuItem.id == OrderItem.menu_item_id)\n        .join(Order, Order.id == OrderItem.order_id)\n        .join(Bill, Bill.id == Order.bill_id)\n        .join(SessionTable, SessionTable.id == Bill.session_table_id)\n        .join(Maid, Maid.id == OrderItemMaid.maid_id)\n        .where(\n            SessionTable.session_id == session_id,\n            MenuItem.item_type == "maid_service",\n        )\n        .group_by(MenuItem.id, Maid.id, Maid.name)\n        .order_by(MenuItem.id.asc(), Maid.name.asc())\n    ).all()\n\n    maid_map: dict[int, list[SessionSummaryMaidCount]] = {}\n\n    for row in maid_rows:\n        maid_map.setdefault(row.menu_item_id, []).append(\n            SessionSummaryMaidCount(\n                maid_id=row.maid_id,\n                maid_name=row.maid_name,\n                total_ordered=row.total_ordered,\n            )\n        )\n\n    items = []\n\n    for entry in item_map.values():\n        direct_ordered = int(entry["direct_ordered"])\n        from_sets = int(entry["from_sets"])\n\n        items.append(\n            SessionSummaryItem(\n                menu_item_id=entry["menu_item_id"],\n                menu_item_name=entry["menu_item_name"],\n                item_type=entry["item_type"],\n                is_bundle=entry["is_bundle"],\n                direct_ordered=direct_ordered,\n                from_sets=from_sets,\n                total_ordered=direct_ordered + from_sets,\n                total_sales=entry["total_sales"],\n                maid_breakdown=maid_map.get(entry["menu_item_id"], []),\n                set_components=set_component_map.get(\n                    entry["menu_item_id"], []\n                ),\n                from_set_breakdown=entry["from_set_breakdown"],\n            )\n        )\n\n    items.sort(\n        key=lambda item: (\n            not item.is_bundle,\n            item.menu_item_name.lower(),\n        )\n    )\n\n    return SessionSummaryResponse(\n        session_id=session_obj.id,\n        session_name=session_obj.name,\n        items=items,\n    )\n'
text = text[:match.start()] + new_endpoint + text[match.end():]
checkout_file.write_text(text, encoding="utf-8")

types_text = types_file.read_text(encoding="utf-8")
types_pattern = re.compile(
    r'export type SessionSummaryMaidCount.*?'
    r'export type SessionSummaryResponse\s*=\s*\{.*?\};',
    flags=re.S,
)

types_match = types_pattern.search(types_text)
if not types_match:
    raise SystemExit("Could not locate SessionSummary types.")

new_types = 'export type SessionSummaryMaidCount = {\n  maid_id: number;\n  maid_name: string;\n  total_ordered: number;\n};\n\nexport type SessionSummarySetSource = {\n  set_menu_item_id: number;\n  set_menu_item_name: string;\n  set_quantity_ordered: number;\n  component_quantity_per_set: number;\n  quantity_from_set: number;\n};\n\nexport type SessionSummarySetComponent = {\n  menu_item_id: number;\n  menu_item_name: string;\n  item_type: string;\n  quantity_per_set: number;\n  total_quantity_from_set: number;\n};\n\nexport type SessionSummaryItem = {\n  menu_item_id: number;\n  menu_item_name: string;\n  item_type: string;\n  is_bundle: boolean;\n  total_ordered: number;\n  direct_ordered: number;\n  from_sets: number;\n  total_sales: string;\n  maid_breakdown: SessionSummaryMaidCount[];\n  set_components: SessionSummarySetComponent[];\n  from_set_breakdown: SessionSummarySetSource[];\n};\n\nexport type SessionSummaryResponse = {\n  session_id: number;\n  session_name: string;\n  items: SessionSummaryItem[];\n};'
types_text = (
    types_text[:types_match.start()]
    + new_types
    + types_text[types_match.end():]
)
types_file.write_text(types_text, encoding="utf-8")

print("Session Summary Set patch installed.")
