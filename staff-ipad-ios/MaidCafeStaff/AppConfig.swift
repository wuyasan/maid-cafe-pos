import Foundation

enum AppConfig {
    /*
     Staff Web URL — inject per build configuration instead of hardcoding.
     Set a `STAFF_DASHBOARD_URL` key in Info.plist (e.g. wired to a
     `$(STAFF_DASHBOARD_URL)` xcconfig build setting per Debug/Release).
     Falls back to the local dev URL when the key is absent or empty.

     Local example:
     http://192.168.1.25:3000/staff
     */
    private static let fallbackURL = "http://192.168.1.25:3000/staff"

    static let staffDashboardURL: URL = {
        let configured = (Bundle.main.object(
            forInfoDictionaryKey: "STAFF_DASHBOARD_URL"
        ) as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)

        let raw = (configured?.isEmpty == false) ? configured! : fallbackURL
        return URL(string: raw) ?? URL(string: fallbackURL)!
    }()
}
