from fastapi import APIRouter

from app.api.v1.endpoints import (
    bills,
    customer_orders,
    maids,
    menu,
    production,
    session_maids,
    sessions,
    staff_checkout,
    tables,
    uploads,

    staff_order_items,
)

api_router = APIRouter()
api_router.include_router(sessions.router)
api_router.include_router(tables.router)
api_router.include_router(menu.router)
api_router.include_router(maids.router)
api_router.include_router(bills.router, prefix="/bills", tags=["bills"])
api_router.include_router(
    customer_orders.router,
    prefix="/customer-orders",
    tags=["customer-orders"],
)
api_router.include_router(staff_checkout.router)
api_router.include_router(staff_order_items.router)
api_router.include_router(session_maids.router)
api_router.include_router(production.router)
api_router.include_router(uploads.router)
