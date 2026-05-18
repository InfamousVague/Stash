import SwiftUI
import AppKit

@main
struct StashBarApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        Settings { EmptyView() }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let store = StashStore()
    private var statusItem: NSStatusItem!
    private let popover = NSPopover()
    private var timer: Timer?

    /// When bundled inside Stash.app it lives and dies with Stash. Pass
    /// --standalone (or STASHBAR_STANDALONE=1) to run it on its own.
    private var standalone: Bool {
        CommandLine.arguments.contains("--standalone")
            || ProcessInfo.processInfo.environment["STASHBAR_STANDALONE"] == "1"
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.action = #selector(togglePopover(_:))
            button.target = self
        }

        popover.behavior = .transient
        popover.contentViewController = NSHostingController(
            rootView: ContentView().environment(store)
        )

        store.onStateChange = { [weak self] in self?.updateIcon() }
        store.refresh()
        updateIcon()

        timer = Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func tick() {
        store.refresh()
        if !standalone && !stashRunning() {
            NSApplication.shared.terminate(nil)
        }
    }

    private func stashRunning() -> Bool {
        NSWorkspace.shared.runningApplications.contains {
            $0.bundleIdentifier == "com.mattssoftware.stash"
        }
    }

    private func updateIcon() {
        guard let button = statusItem.button else { return }
        let name = store.vaultUnlocked ? "lock.open.fill" : "lock.fill"
        let img = NSImage(systemSymbolName: name, accessibilityDescription: "Stash")
        img?.isTemplate = true
        button.image = img
    }

    @objc private func togglePopover(_ sender: Any?) {
        if popover.isShown {
            popover.performClose(sender)
        } else if let button = statusItem.button {
            store.refresh()
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            NSApp.activate(ignoringOtherApps: true)
        }
    }
}
