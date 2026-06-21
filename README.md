# Maid Cafe POS

A session-based maid cafe ordering and payment system.

## Apps
- `backend/` FastAPI backend (business logic, API, Postgres + Alembic)
- `web/` single Next.js app: customer QR ordering (`/order`), staff ops (`/staff`), and admin (`/admin`), via a BFF over the backend
- `staff-ipad-ios/` iPad cashier shell (WKWebView) that loads `web`'s `/staff` and bridges Square Reader payments
- `docs/` architecture & feature notes
