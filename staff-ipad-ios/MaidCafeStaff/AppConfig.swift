import Foundation

enum AppConfig {
    /*
     Use your deployed HTTPS Staff Web URL in production.

     Local example:
     http://192.168.1.25:3000/staff
     */
    static let staffDashboardURL = URL(
        string: "http://192.168.1.25:3000/staff"
    )!
}
