from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import get_db
from app.models.enums import MenuItemType, ProductionStation
from app.models.menu import (
    MaidServicePricing,
    MenuCategory,
    MenuItem,
    MenuItemComponent,
)
from app.schemas.menu import (
    BundleComponentRead,
    BundleComponentWrite,
    MaidServicePricingCreate,
    MaidServicePricingRead,
    MaidServicePricingUpdate,
    MenuCategoryCreate,
    MenuCategoryRead,
    MenuCategoryUpdate,
    MenuItemCreate,
    MenuItemRead,
    MenuItemUpdate,
    MenuItemWithPricingCreate,
    MenuItemWithPricingRead,
    MenuItemWithPricingUpdate,
)

router = APIRouter(prefix="/menu", tags=["menu"])


def _item_query():
    return select(MenuItem).options(
        joinedload(MenuItem.maid_service_pricing),
        joinedload(MenuItem.category),
        selectinload(MenuItem.bundle_components)
        .joinedload(MenuItemComponent.component_menu_item)
        .joinedload(MenuItem.category),
    )


def _component_reads(item: MenuItem) -> list[BundleComponentRead]:
    result: list[BundleComponentRead] = []
    for link in item.bundle_components:
        component = link.component_menu_item
        station = (
            component.category.production_station
            if component.category is not None
            else ProductionStation.none
        )
        result.append(
            BundleComponentRead(
                id=link.id,
                menu_item_id=component.id,
                menu_item_name=component.name,
                quantity=link.quantity,
                production_station=station,
                item_type=component.item_type,
            )
        )
    return result


def _item_read(item: MenuItem) -> MenuItemWithPricingRead:
    return MenuItemWithPricingRead(
        id=item.id,
        name=item.name,
        description=item.description,
        price=item.price,
        image_url=item.image_url,
        category_id=item.category_id,
        item_type=item.item_type,
        is_active=item.is_active,
        is_bundle=item.is_bundle,
        created_at=item.created_at,
        maid_service_pricing=item.maid_service_pricing,
        components=_component_reads(item),
        requires_maid_selection=(
            item.item_type == MenuItemType.maid_service
            or any(
                link.component_menu_item.item_type == MenuItemType.maid_service
                for link in item.bundle_components
            )
        ),
    )


def _load_item(db: Session, item_id: int) -> MenuItem | None:
    return (
        db.execute(_item_query().where(MenuItem.id == item_id))
        .unique()
        .scalars()
        .first()
    )


def _validate_category(db: Session, category_id: int | None) -> None:
    if category_id is None:
        return
    if db.get(MenuCategory, category_id) is None:
        raise HTTPException(status_code=404, detail="Category not found.")


def _normalize_components(
    components: list[BundleComponentWrite] | list[dict] | None,
) -> list[BundleComponentWrite]:
    if not components:
        return []
    return [
        component
        if isinstance(component, BundleComponentWrite)
        else BundleComponentWrite.model_validate(component)
        for component in components
    ]


def _validate_bundle_components(
    db: Session,
    parent_item_id: int | None,
    components: list[BundleComponentWrite],
) -> None:
    components = _normalize_components(components)
    if not components:
        raise HTTPException(
            status_code=400,
            detail="A bundle must contain at least one component.",
        )

    seen: set[int] = set()
    for component in components:
        if component.menu_item_id in seen:
            raise HTTPException(
                status_code=400,
                detail="The same component cannot be added twice.",
            )
        seen.add(component.menu_item_id)

        if parent_item_id is not None and component.menu_item_id == parent_item_id:
            raise HTTPException(
                status_code=400,
                detail="A bundle cannot contain itself.",
            )

        component_item = db.get(MenuItem, component.menu_item_id)
        if not component_item:
            raise HTTPException(
                status_code=404,
                detail=f"Component menu item {component.menu_item_id} not found.",
            )
        if component_item.is_bundle:
            raise HTTPException(
                status_code=400,
                detail="Nested bundles are not supported.",
            )


def _replace_components(
    db: Session,
    item: MenuItem,
    components: list[BundleComponentWrite],
) -> None:
    components = _normalize_components(components)
    for existing in list(item.bundle_components):
        db.delete(existing)
    db.flush()

    for component in components:
        db.add(
            MenuItemComponent(
                parent_menu_item_id=item.id,
                component_menu_item_id=component.menu_item_id,
                quantity=component.quantity,
            )
        )


@router.get("/categories", response_model=list[MenuCategoryRead])
def list_menu_categories(db: Session = Depends(get_db)):
    categories = list(
        db.execute(
            select(MenuCategory).order_by(
                MenuCategory.display_order.asc(), MenuCategory.id.asc()
            )
        )
        .scalars()
        .all()
    )
    return [
        MenuCategoryRead(
            id=category.id,
            name=category.name,
            display_order=category.display_order,
            production_station=category.production_station,
            created_at=category.created_at,
            item_count=len(category.items or []),
        )
        for category in categories
    ]


@router.post("/categories", response_model=MenuCategoryRead)
def create_menu_category(
    payload: MenuCategoryCreate,
    db: Session = Depends(get_db),
):
    category = MenuCategory(**payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return MenuCategoryRead(
        id=category.id,
        name=category.name,
        display_order=category.display_order,
        production_station=category.production_station,
        created_at=category.created_at,
        item_count=0,
    )


@router.patch("/categories/{category_id}", response_model=MenuCategoryRead)
def update_menu_category(
    category_id: int,
    payload: MenuCategoryUpdate,
    db: Session = Depends(get_db),
):
    category = db.get(MenuCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return MenuCategoryRead(
        id=category.id,
        name=category.name,
        display_order=category.display_order,
        production_station=category.production_station,
        created_at=category.created_at,
        item_count=len(category.items or []),
    )


@router.delete("/categories/{category_id}")
def delete_menu_category(category_id: int, db: Session = Depends(get_db)):
    category = db.get(MenuCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")
    item_count = len(category.items or [])
    if item_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f'Cannot delete category "{category.name}" because it still has '
                f"{item_count} menu item(s)."
            ),
        )
    db.delete(category)
    db.commit()
    return {"success": True, "deleted_id": category_id}


@router.get("/items", response_model=list[MenuItemWithPricingRead])
def list_menu_items(db: Session = Depends(get_db)):
    items = list(
        db.execute(_item_query().order_by(MenuItem.id.desc()))
        .unique()
        .scalars()
        .all()
    )
    return [_item_read(item) for item in items]


@router.post("/items", response_model=MenuItemRead)
def create_menu_item(payload: MenuItemCreate, db: Session = Depends(get_db)):
    _validate_category(db, payload.category_id)
    if payload.item_type == MenuItemType.maid_service and payload.is_bundle:
        raise HTTPException(status_code=400, detail="Maid service cannot be a bundle.")
    if payload.is_bundle:
        _validate_bundle_components(db, None, payload.components)

    item_data = payload.model_dump(exclude={"components"})
    item = MenuItem(**item_data)
    db.add(item)
    db.flush()
    if payload.is_bundle:
        _replace_components(db, item, payload.components)
    db.commit()
    loaded = _load_item(db, item.id)
    return _item_read(loaded)


@router.patch("/items/{item_id}", response_model=MenuItemRead)
def update_menu_item(
    item_id: int,
    payload: MenuItemUpdate,
    db: Session = Depends(get_db),
):
    item = _load_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")

    update_data = payload.model_dump(exclude_unset=True)
    components = update_data.pop("components", None)
    if components is not None:
        components = _normalize_components(components)
    _validate_category(db, update_data.get("category_id", item.category_id))

    final_item_type = update_data.get("item_type", item.item_type)
    final_is_bundle = update_data.get("is_bundle", item.is_bundle)
    if final_item_type == MenuItemType.maid_service and final_is_bundle:
        raise HTTPException(status_code=400, detail="Maid service cannot be a bundle.")
    if final_is_bundle:
        final_components = components if components is not None else [
            BundleComponentWrite(
                menu_item_id=link.component_menu_item_id,
                quantity=link.quantity,
            )
            for link in item.bundle_components
        ]
        _validate_bundle_components(db, item.id, final_components)

    for key, value in update_data.items():
        setattr(item, key, value)

    if not final_is_bundle:
        _replace_components(db, item, [])
    elif components is not None:
        _replace_components(db, item, components)

    db.commit()
    return _item_read(_load_item(db, item.id))


@router.delete("/items/{item_id}")
def delete_menu_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    used_count = len(item.used_in_bundles or [])
    if used_count:
        raise HTTPException(
            status_code=400,
            detail="This item is used by a bundle. Remove it from the bundle first.",
        )
    db.delete(item)
    db.commit()
    return {"success": True, "deleted_id": item_id}


@router.get("/maid-service-pricing", response_model=list[MaidServicePricingRead])
def list_maid_service_pricing(db: Session = Depends(get_db)):
    return list(
        db.execute(select(MaidServicePricing).order_by(MaidServicePricing.id.desc()))
        .scalars()
        .all()
    )


@router.post("/maid-service-pricing", response_model=MaidServicePricingRead)
def create_maid_service_pricing(
    payload: MaidServicePricingCreate,
    db: Session = Depends(get_db),
):
    item = db.get(MenuItem, payload.menu_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    if item.item_type != MenuItemType.maid_service:
        raise HTTPException(
            status_code=400,
            detail="Pricing can only be set for maid_service items.",
        )
    existing = db.execute(
        select(MaidServicePricing).where(
            MaidServicePricing.menu_item_id == payload.menu_item_id
        )
    ).scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail="Pricing already exists.")
    pricing = MaidServicePricing(**payload.model_dump())
    db.add(pricing)
    db.commit()
    db.refresh(pricing)
    return pricing


@router.patch(
    "/maid-service-pricing/{pricing_id}",
    response_model=MaidServicePricingRead,
)
def update_maid_service_pricing(
    pricing_id: int,
    payload: MaidServicePricingUpdate,
    db: Session = Depends(get_db),
):
    pricing = db.get(MaidServicePricing, pricing_id)
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(pricing, key, value)
    db.commit()
    db.refresh(pricing)
    return pricing


@router.delete("/maid-service-pricing/{pricing_id}")
def delete_maid_service_pricing(
    pricing_id: int,
    db: Session = Depends(get_db),
):
    pricing = db.get(MaidServicePricing, pricing_id)
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found.")
    db.delete(pricing)
    db.commit()
    return {"success": True, "deleted_id": pricing_id}


@router.post("/items-with-pricing", response_model=MenuItemWithPricingRead)
def create_menu_item_with_pricing(
    payload: MenuItemWithPricingCreate,
    db: Session = Depends(get_db),
):
    _validate_category(db, payload.category_id)
    if payload.item_type == MenuItemType.maid_service and payload.is_bundle:
        raise HTTPException(status_code=400, detail="Maid service cannot be a bundle.")
    if payload.is_bundle:
        _validate_bundle_components(db, None, payload.components)

    item = MenuItem(
        name=payload.name,
        description=payload.description,
        price=payload.price,
        image_url=payload.image_url,
        category_id=payload.category_id,
        item_type=payload.item_type,
        is_active=payload.is_active,
        is_bundle=payload.is_bundle,
    )
    db.add(item)
    db.flush()

    if payload.item_type == MenuItemType.maid_service:
        db.add(
            MaidServicePricing(
                menu_item_id=item.id,
                additional_maid_price=payload.additional_maid_price or 0,
                all_maids_price=payload.all_maids_price,
            )
        )
    if payload.is_bundle:
        _replace_components(db, item, payload.components)

    db.commit()
    return _item_read(_load_item(db, item.id))


@router.patch(
    "/items-with-pricing/{item_id}",
    response_model=MenuItemWithPricingRead,
)
def update_menu_item_with_pricing(
    item_id: int,
    payload: MenuItemWithPricingUpdate,
    db: Session = Depends(get_db),
):
    item = _load_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")

    update_data = payload.model_dump(exclude_unset=True)
    components = update_data.pop("components", None)
    if components is not None:
        components = _normalize_components(components)
    additional_maid_price = update_data.pop("additional_maid_price", None)
    all_maids_price_was_sent = "all_maids_price" in payload.model_fields_set
    all_maids_price = update_data.pop("all_maids_price", None)

    _validate_category(db, update_data.get("category_id", item.category_id))
    final_item_type = update_data.get("item_type", item.item_type)
    final_is_bundle = update_data.get("is_bundle", item.is_bundle)

    if final_item_type == MenuItemType.maid_service and final_is_bundle:
        raise HTTPException(status_code=400, detail="Maid service cannot be a bundle.")
    if final_is_bundle:
        final_components = components if components is not None else [
            BundleComponentWrite(
                menu_item_id=link.component_menu_item_id,
                quantity=link.quantity,
            )
            for link in item.bundle_components
        ]
        _validate_bundle_components(db, item.id, final_components)

    for key, value in update_data.items():
        setattr(item, key, value)

    existing_pricing = item.maid_service_pricing
    if final_item_type == MenuItemType.maid_service:
        if existing_pricing:
            if additional_maid_price is not None:
                existing_pricing.additional_maid_price = additional_maid_price
            if all_maids_price_was_sent:
                existing_pricing.all_maids_price = all_maids_price
        else:
            db.add(
                MaidServicePricing(
                    menu_item_id=item.id,
                    additional_maid_price=additional_maid_price or 0,
                    all_maids_price=all_maids_price,
                )
            )
    elif existing_pricing:
        db.delete(existing_pricing)

    if not final_is_bundle:
        _replace_components(db, item, [])
    elif components is not None:
        _replace_components(db, item, components)

    db.commit()
    return _item_read(_load_item(db, item.id))
