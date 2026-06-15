from decimal import Decimal

from app.models.enums import MenuItemType
from app.models.menu import MenuItem


def calculate_order_item_price(
    menu_item: MenuItem,
    quantity: int,
    selected_maid_count: int = 0,
    total_available_maid_count: int = 0,
):
    if menu_item.item_type == MenuItemType.regular:
        unit_price = Decimal(menu_item.price)
        total_price = unit_price * quantity
        return unit_price, total_price

    pricing = menu_item.maid_service_pricing
    if pricing is None:
        raise ValueError("Maid service item missing pricing config.")

    if selected_maid_count <= 0:
        raise ValueError("Maid service requires at least one maid.")

    base_price = Decimal(menu_item.price)
    additional_price = Decimal(pricing.additional_maid_price or 0)

    counted_price = base_price + (Decimal(selected_maid_count - 1) * additional_price)

    unit_price = counted_price

    # 只有“选中了全部当前可用女仆”时，才允许套用 all_maids_price
    if (
        pricing.all_maids_price is not None
        and total_available_maid_count > 0
        and selected_maid_count == total_available_maid_count
    ):
        all_maids_price = Decimal(pricing.all_maids_price)
        unit_price = min(counted_price, all_maids_price)

    total_price = unit_price * quantity
    return unit_price, total_price