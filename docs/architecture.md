# Architecture Notes

## Modules
- backend: API and business logic (FastAPI + SQLAlchemy + Alembic + Postgres)
- web: single Next.js app serving customer ordering (`/order`), staff ops (`/staff`),
  and admin (`/admin`) via a BFF over the backend. Replaces the retired
  `customer-web` / `staff-web` apps.
- staff-ipad-ios: staff cashier shell (WKWebView) that loads the web app's `/staff`
  (URL injected via `STAFF_DASHBOARD_URL`) and bridges Square deep links for Reader payments.

## Core entities
- sessions
- tables
- maids
- menu_items
- bills (incl. discount + tip fields)
- orders
- order_items
- payments
- staff_users
