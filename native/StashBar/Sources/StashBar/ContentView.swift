import SwiftUI
import AppKit

private let accent = Color(red: 0.851, green: 0.690, blue: 0.322) // #D9B052 vault gold

struct ContentView: View {
    @Environment(StashStore.self) private var store

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            content
            Divider()
            footer
        }
        .frame(width: 340, height: 460)
        .tint(accent)
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: store.vaultUnlocked ? "lock.open.fill" : "lock.fill")
                .font(.system(size: 14))
                .foregroundStyle(store.vaultUnlocked ? accent : .secondary)
            Text("STASH").font(.system(size: 13, weight: .semibold)).tracking(3)
            Spacer()
            Text(store.vaultUnlocked ? "Unlocked" : "Locked")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(store.vaultUnlocked ? accent : .secondary)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    @ViewBuilder
    private var content: some View {
        if store.rows.isEmpty {
            Text("No Stash projects yet.")
                .font(.system(size: 12)).foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(Array(store.rows.enumerated()), id: \.element.id) { idx, r in
                        ProjectRowView(row: r)
                        if idx < store.rows.count - 1 { Divider().padding(.horizontal, 12) }
                    }
                }
                .padding(.vertical, 6)
            }
        }
    }

    private var footer: some View {
        HStack {
            Button("Open Stash") { openStash() }
                .buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(accent)
            Spacer()
            Button("Quit") { NSApplication.shared.terminate(nil) }
                .buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
    }

    private func openStash() {
        if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.mattssoftware.stash") {
            NSWorkspace.shared.openApplication(at: url, configuration: .init())
        }
    }
}

private struct ProjectRowView: View {
    let row: ProjectRow

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.name).font(.system(size: 12, weight: .semibold))
                Text(detail).font(.system(size: 10)).foregroundStyle(.secondary)
            }
            Spacer()
            Text(row.activeProfile)
                .font(.system(size: 9, weight: .medium))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Color(red: 0.851, green: 0.690, blue: 0.322).opacity(0.16))
                .foregroundStyle(.tint)
                .clipShape(Capsule())
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .contentShape(Rectangle())
        .onTapGesture {
            NSWorkspace.shared.activateFileViewerSelecting(
                [URL(fileURLWithPath: row.path)])
        }
        .help(row.path)
    }

    private var detail: String {
        guard row.hasLock else { return "no .stash.lock" }
        var parts = ["\(row.memberCount) member\(row.memberCount == 1 ? "" : "s")",
                     "\(row.profileCount) profile\(row.profileCount == 1 ? "" : "s")"]
        if let v = row.activeVarCount { parts.append("\(v) vars") }
        return parts.joined(separator: " · ")
    }
}
