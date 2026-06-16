import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationStack {
            StaffWebView(
                url: AppConfig.staffDashboardURL
            )
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle("Maid Cafe POS")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
