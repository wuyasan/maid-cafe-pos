from fastapi import APIRouter
from app.api.v1.endpoints import sessions, tables, menu, maids, bills, customer_orders, staff_checkout, session_maids

api_router = APIRouter()
api_router.include_router(sessions.router)
api_router.include_router(tables.router)
api_router.include_router(menu.router)
api_router.include_router(maids.router)
api_router.include_router(bills.router, prefix="/bills", tags=["bills"])
api_router.include_router(customer_orders.router, prefix="/customer-orders", tags=["customer-orders"])
api_router.include_router(staff_checkout.router)
api_router.include_router(session_maids.router)
