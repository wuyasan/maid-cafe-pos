from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models.menu import MenuCategory, MenuItem, MaidServicePricing
from app.schemas.menu import (
    MenuCategoryCreate,
    MenuCategoryRead,
    MenuItemCreate,
    MenuItemRead,
    MenuItemUpdate,
    MaidServicePricingCreate, 
    MaidServicePricingRead, 
    MaidServicePricingUpdate,
    MenuItemWithPricingCreate,
    MenuItemWithPricingRead,
    MenuItemWithPricingUpdate,
)
from app.models.enums import MenuItemType

router = APIRouter(prefix="/menu", tags=["menu"])


@router.get("/categories", response_model=list[MenuCategoryRead])
def list_menu_categories(db: Session = Depends(get_db)):
    categories = list(
        db.execute(
            select(MenuCategory).order_by(MenuCategory.display_order.asc(), MenuCategory.id.asc())
        )
        .scalars()
        .all()
    )

    result = []
    for category in categories:
        item_count = len(category.items) if category.items is not None else 0
        result.append(
            MenuCategoryRead(
                id=category.id,
                name=category.name,
                display_order=category.display_order,
                created_at=category.created_at,
                item_count=item_count,
            )
        )
    return result


@router.post("/categories", response_model=MenuCategoryRead)
def create_menu_category(payload: MenuCategoryCreate, db: Session = Depends(get_db)):
    category = MenuCategory(
        name=payload.name,
        display_order=payload.display_order,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/categories/{category_id}", response_model=MenuCategoryRead)
def update_menu_category(category_id: int, payload: MenuCategoryCreate, db: Session = Depends(get_db)):
    category = db.get(MenuCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")

    category.name = payload.name
    category.display_order = payload.display_order

    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
def delete_menu_category(category_id: int, db: Session = Depends(get_db)):
    category = db.get(MenuCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")

    item_count = len(category.items) if category.items is not None else 0
    if item_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f'Cannot delete category "{category.name}" because it still has {item_count} menu item(s).',
        )

    db.delete(category)
    db.commit()
    return {"success": True, "deleted_id": category_id} 


@router.get("/items", response_model=list[MenuItemRead])
def list_menu_items(db: Session = Depends(get_db)):
    stmt = (
        select(MenuItem)
        .options(joinedload(MenuItem.maid_service_pricing))
        .order_by(MenuItem.id.desc())
    )
    return list(db.execute(stmt).scalars().all())


@router.post("/items", response_model=MenuItemRead)
def create_menu_item(payload: MenuItemCreate, db: Session = Depends(get_db)):
    if payload.category_id is not None:
        category = db.get(MenuCategory, payload.category_id)
        if not category:
            raise HTTPException(status_code=404, detail="Category not found.")

    item = MenuItem(
        name=payload.name,
        description=payload.description,
        price=payload.price,
        image_url=payload.image_url,
        category_id=payload.category_id,
        item_type=payload.item_type,
        is_active=payload.is_active,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=MenuItemRead)
def update_menu_item(item_id: int, payload: MenuItemUpdate, db: Session = Depends(get_db)):
    item = db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")

    update_data = payload.model_dump(exclude_unset=True)

    if "category_id" in update_data and update_data["category_id"] is not None:
        category = db.get(MenuCategory, update_data["category_id"])
        if not category:
            raise HTTPException(status_code=404, detail="Category not found.")

    for key, value in update_data.items():
        setattr(item, key, value)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}")
def delete_menu_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")

    db.delete(item)
    db.commit()
    return {"success": True, "deleted_id": item_id}

@router.get("/maid-service-pricing", response_model=list[MaidServicePricingRead])
def list_maid_service_pricing(db: Session = Depends(get_db)):
    stmt = (
        select(MaidServicePricing)
        .options(joinedload(MaidServicePricing.menu_item))
        .order_by(MaidServicePricing.id.desc())
    )
    return list(db.execute(stmt).scalars().all())


@router.post("/maid-service-pricing", response_model=MaidServicePricingRead)
def create_maid_service_pricing(payload: MaidServicePricingCreate, db: Session = Depends(get_db)):
    item = db.get(MenuItem, payload.menu_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")

    if item.item_type != MenuItemType.maid_service:
        raise HTTPException(status_code=400, detail="Pricing can only be set for maid_service items.")

    existing = db.execute(
        select(MaidServicePricing).where(MaidServicePricing.menu_item_id == payload.menu_item_id)
    ).scalars().first()

    if existing:
        raise HTTPException(status_code=400, detail="Pricing already exists for this menu item.")

    pricing = MaidServicePricing(
        menu_item_id=payload.menu_item_id,
        single_price=payload.single_price,
        additional_maid_price=payload.additional_maid_price,
        all_maids_price=payload.all_maids_price,
    )
    db.add(pricing)
    db.commit()
    db.refresh(pricing)
    return pricing


@router.patch("/maid-service-pricing/{pricing_id}", response_model=MaidServicePricingRead)
def update_maid_service_pricing(
    pricing_id: int,
    payload: MaidServicePricingUpdate,
    db: Session = Depends(get_db),
):
    pricing = db.get(MaidServicePricing, pricing_id)
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found.")

    update_data = payload.model_dump(exclude_unset=True)

    if "menu_item_id" in update_data and update_data["menu_item_id"] is not None:
        item = db.get(MenuItem, update_data["menu_item_id"])
        if not item:
            raise HTTPException(status_code=404, detail="Menu item not found.")
        if item.item_type != MenuItemType.maid_service:
            raise HTTPException(status_code=400, detail="Pricing can only be set for maid_service items.")

        existing = db.execute(
            select(MaidServicePricing).where(
                MaidServicePricing.menu_item_id == update_data["menu_item_id"],
                MaidServicePricing.id != pricing_id,
            )
        ).scalars().first()

        if existing:
            raise HTTPException(status_code=400, detail="Another pricing already exists for this menu item.")

    for key, value in update_data.items():
        setattr(pricing, key, value)

    db.commit()
    db.refresh(pricing)
    return pricing


@router.delete("/maid-service-pricing/{pricing_id}")
def delete_maid_service_pricing(pricing_id: int, db: Session = Depends(get_db)):
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
    if payload.category_id is not None:
        category = db.get(MenuCategory, payload.category_id)
        if not category:
            raise HTTPException(status_code=404, detail="Category not found.")

    item = MenuItem(
        name=payload.name,
        description=payload.description,
        price=payload.price,
        image_url=payload.image_url,
        category_id=payload.category_id,
        item_type=payload.item_type,
        is_active=payload.is_active,
    )
    db.add(item)
    db.flush()

    if payload.item_type == MenuItemType.maid_service:
        pricing = MaidServicePricing(
            menu_item_id=item.id,
            additional_maid_price=payload.additional_maid_price or 0,
            all_maids_price=payload.all_maids_price,
        )
        db.add(pricing)

    db.commit()

    item = (
        db.execute(
            select(MenuItem)
            .options(joinedload(MenuItem.maid_service_pricing))
            .where(MenuItem.id == item.id)
        )
        .scalars()
        .first()
    )
    return item


@router.patch("/items-with-pricing/{item_id}", response_model=MenuItemWithPricingRead)
def update_menu_item_with_pricing(
    item_id: int,
    payload: MenuItemWithPricingUpdate,
    db: Session = Depends(get_db),
):
    item = db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")

    update_data = payload.model_dump(exclude_unset=True)

    if "category_id" in update_data and update_data["category_id"] is not None:
        category = db.get(MenuCategory, update_data["category_id"])
        if not category:
            raise HTTPException(status_code=404, detail="Category not found.")

    item_fields = {
        "name",
        "description",
        "price",
        "image_url",
        "category_id",
        "item_type",
        "is_active",
    }

    for key, value in update_data.items():
        if key in item_fields:
            setattr(item, key, value)

    final_item_type = item.item_type

    existing_pricing = (
        db.execute(
            select(MaidServicePricing).where(MaidServicePricing.menu_item_id == item.id)
        )
        .scalars()
        .first()
    )

    if final_item_type == MenuItemType.maid_service:
        if existing_pricing:
            if "additional_maid_price" in update_data and update_data["additional_maid_price"] is not None:
                existing_pricing.additional_maid_price = update_data["additional_maid_price"]
            if "all_maids_price" in update_data:
                existing_pricing.all_maids_price = update_data["all_maids_price"]
        else:
            pricing = MaidServicePricing(
                menu_item_id=item.id,
                additional_maid_price=update_data.get("additional_maid_price") or 0,
                all_maids_price=update_data.get("all_maids_price"),
            )
            db.add(pricing)
    else:
        if existing_pricing:
            db.delete(existing_pricing)

    db.commit()

    item = (
        db.execute(
            select(MenuItem)
            .options(joinedload(MenuItem.maid_service_pricing))
            .where(MenuItem.id == item.id)
        )
        .scalars()
        .first()
    )
    return item