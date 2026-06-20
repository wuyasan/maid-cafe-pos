# Maid Cafe Staff iPad App + Square Reader

This version uses:

- your Staff Web interface inside a SwiftUI `WKWebView`
- Square Point of Sale installed on the same iPad
- a Square Reader paired inside Square Point of Sale

## Important architecture

The payment flow is:

1. Staff opens a table in the Maid Cafe iPad app.
2. Staff taps **Pay with iPad Square Reader**.
3. The iPad opens Square Point of Sale.
4. Square Point of Sale sends the amount to the paired Square Reader.
5. The customer taps or inserts the card.
6. Square returns to the configured web callback.
7. Maid Cafe POS marks the bill paid and clears the table.

The custom Maid Cafe app does not directly communicate with the Reader.
Square Point of Sale manages the Reader pairing and payment.

## Xcode setup

1. Open Xcode.
2. Create a new iOS App named `MaidCafeStaff`.
3. Interface: SwiftUI.
4. Language: Swift.
5. Target iPadOS 16 or newer.
6. Add the files from `staff-ipad-ios/MaidCafeStaff/`.
7. Add the keys from `Info.plist.snippet.xml` to the target Info settings.
8. Set the Staff Web URL via the `STAFF_DASHBOARD_URL` key in the target's Info.plist
   (wire it to a `$(STAFF_DASHBOARD_URL)` xcconfig build setting, one value per
   Debug/Release). `AppConfig.staffDashboardURL` reads that key at launch and falls
   back to the local dev URL when it's unset. Use an `https://` URL in Release.
9. Build and install on the iPad.

## iPad setup

1. Install **Square Point of Sale** from the App Store.
2. Log in to the Square seller account.
3. In Square Point of Sale, open:
   Settings -> Hardware -> Square Readers
4. Pair the Square Contactless and Chip Reader.
5. Complete a small test payment in Square itself first.
6. Open the Maid Cafe Staff app and test its checkout button.

## Square Developer setup

Create or open a Square application.

Under Point of Sale API -> Web:

- register this callback URL:

  `https://YOUR-DOMAIN/staff/square-callback`

It must exactly match:

`NEXT_PUBLIC_SQUARE_CALLBACK_URL`

## Local development warning

The Staff Web and API can be accessed by iPad through the computer's LAN IP,
but Square's web callback should use a registered HTTPS URL for reliable
automatic return.

During early local testing, you can still:

1. open Square from the iPad,
2. complete payment,
3. return to Maid Cafe POS,
4. use **Square Paid · Mark Bill Paid** manually.
