import SwiftUI
import WidgetKit

@main
struct StashApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .onAppear {
                    // Mirror keychain credentials to shared UserDefaults
                    // so the widget extension can access them
                    KeychainService.shared.syncToSharedDefaults()

                    // Tell WidgetKit to discover and reload all complications
                    WidgetCenter.shared.reloadAllTimelines()
                }
        }
    }
}
