import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        if appState.isConfigured {
            MainTabView()
                .environmentObject(appState)
                .task {
                    await appState.refreshProjects()
                    // Poll every 30 seconds for updates (new Macs linking, project changes)
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .seconds(30))
                        if !Task.isCancelled {
                            await appState.refreshProjects()
                        }
                    }
                }
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .active {
                        Task {
                            await appState.refreshProjects()
                        }
                    }
                }
        } else {
            SetupView()
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab = 0

    var body: some View {
        NavigationStack {
            TabView(selection: $selectedTab) {
                ProjectListContent()
                    .tag(0)
                SettingsView()
                    .tag(1)
            }
            .tabViewStyle(.verticalPage)
        }
        .overlay(alignment: .top) {
            if let error = appState.error {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 11))
                    Text(error)
                        .font(.system(size: 10))
                        .lineLimit(2)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Capsule().fill(.red.opacity(0.85)))
                .padding(.top, 4)
                .transition(.move(edge: .top).combined(with: .opacity))
                .onTapGesture { appState.error = nil }
            }
        }
        .animation(.spring(response: 0.3), value: appState.error)
    }
}

struct LinkCodeSheetData: Identifiable {
    let id = UUID()
    let code: String
    let expiresAt: Date
}

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var showDeleteConfirmation = false
    @State private var showSignOutConfirmation = false
    @State private var linkCodeSheet: LinkCodeSheetData?
    @State private var isGeneratingCode = false
    @State private var linkError: String?
    @State private var relayOnline: Bool? = nil // nil = checking

    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(.stashGreen.opacity(0.15))
                            .frame(width: 36, height: 36)
                        Image(systemName: "lock.shield.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(.stashGreen)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Stash")
                            .font(.headline)
                        Text("v1.0")
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            Section {
                HStack {
                    Text("Relay")
                        .font(.body)
                    Spacer()
                    HStack(spacing: 4) {
                        Circle()
                            .fill(relayOnline == nil ? .gray : (relayOnline == true ? .green : .red))
                            .frame(width: 6, height: 6)
                            .shadow(color: (relayOnline == true ? Color.green : Color.clear).opacity(0.5), radius: 3)
                        Text(relayOnline == nil ? "Checking..." : (relayOnline == true ? "Connected" : "Offline"))
                            .font(.caption)
                            .foregroundStyle(relayOnline == nil ? .gray : (relayOnline == true ? .green : .red))
                    }
                }
                .padding(.vertical, 4)

                HStack {
                    Text("Projects")
                        .font(.body)
                    Spacer()
                    Text("\(appState.projects.count)")
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(.stashGreen)
                }
                .padding(.vertical, 4)
            }

            // Workspaces section — only show if there are linked Macs
            if !appState.workspaces.isEmpty {
                Section("Linked Macs") {
                    ForEach(appState.workspaces) { workspace in
                        HStack(spacing: 10) {
                            Image(systemName: "laptopcomputer")
                                .foregroundStyle(.stashGreen)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(workspace.displayName)
                                    .font(.body)
                                Text("\(appState.projects.filter { $0.sourceDeviceId == workspace.id }.count) projects")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task { await appState.unlinkWorkspace(deviceId: workspace.id) }
                            } label: {
                                Label("Unlink", systemImage: "trash")
                            }
                        }
                    }
                }
            }

            Section("Device Linking") {
                Button {
                    Task { @MainActor in
                        isGeneratingCode = true
                        linkError = nil
                        let response = await appState.generateLinkCode()
                        isGeneratingCode = false
                        if let response = response {
                            linkCodeSheet = LinkCodeSheetData(
                                code: response.code,
                                expiresAt: Date().addingTimeInterval(TimeInterval(response.expiresIn))
                            )
                        } else {
                            linkError = appState.error ?? "Failed to generate code"
                        }
                    }
                } label: {
                    HStack(spacing: 12) {
                        if isGeneratingCode {
                            ProgressView()
                                .scaleEffect(0.7)
                                .frame(width: 18, height: 18)
                        } else {
                            Image(systemName: "laptopcomputer")
                                .font(.system(size: 16))
                                .foregroundStyle(.stashGreen)
                                .frame(width: 18, height: 18)
                        }
                        Text("Link Mac")
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .disabled(isGeneratingCode)

                if let linkError {
                    Text(linkError)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
            }

            Section {
                Button(role: .destructive) {
                    showSignOutConfirmation = true
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .foregroundStyle(.red)
                        Text("Sign Out")
                            .foregroundStyle(.red)
                            .lineLimit(1)
                    }
                }
            }

            Section {
                Button(role: .destructive) {
                    showDeleteConfirmation = true
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "trash.fill")
                            .foregroundStyle(.red)
                        Text("Delete Account")
                            .foregroundStyle(.red)
                            .lineLimit(1)
                    }
                }
            }
        }
        .navigationTitle("Settings")
        .alert("Sign Out", isPresented: $showSignOutConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Sign Out", role: .destructive) {
                appState.disconnect()
            }
        } message: {
            Text("This unlinks your watch from Stash. You'll need to sign in and link a Mac again to sync projects.")
        }
        .alert("Delete Account", isPresented: $showDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task {
                    await appState.deleteAccount()
                }
            }
        } message: {
            Text("Are you sure? This will permanently delete your account and all data.")
        }
        .sheet(item: $linkCodeSheet) { data in
            LinkCodeSheet(code: data.code, expiresAt: data.expiresAt) {
                linkCodeSheet = nil
            }
        }
        .task {
            relayOnline = await appState.checkRelayHealth()
        }
    }
}

struct LinkCodeSheet: View {
    let code: String
    let expiresAt: Date
    let onDismiss: () -> Void

    @EnvironmentObject var appState: AppState
    @State private var isLinked = false

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if isLinked {
                    // Success state
                    ZStack {
                        Circle()
                            .fill(.stashGreen.opacity(0.18))
                            .frame(width: 72, height: 72)
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 52))
                            .foregroundStyle(.stashGreen)
                            .symbolEffect(.bounce, value: isLinked)
                    }
                    .padding(.top, 8)

                    Text("Linked!")
                        .font(.title3)
                        .fontWeight(.bold)
                        .multilineTextAlignment(.center)

                    Text("Your Mac is now syncing")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                } else {
                    // Waiting state
                    Image(systemName: "laptopcomputer.and.iphone")
                        .font(.system(size: 28))
                        .foregroundStyle(.stashGreen)
                        .padding(.top, 4)

                    Text("Enter on your Mac")
                        .font(.headline)
                        .multilineTextAlignment(.center)

                    Text(code)
                        .font(.system(size: 32, weight: .bold, design: .monospaced))
                        .foregroundStyle(.stashGreen)
                        .tracking(3)
                        .padding(.vertical, 4)

                    LinkCodeCountdown(expiresAt: expiresAt, onExpired: onDismiss)

                    Button("Done", action: onDismiss)
                        .buttonStyle(.borderedProminent)
                        .tint(.stashGreen)
                        .padding(.top, 6)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 8)
            .animation(.spring(response: 0.4, dampingFraction: 0.7), value: isLinked)
        }
        .task {
            // Poll only the device count (cheap + doesn't touch project state,
            // so the parent view doesn't re-render).
            let baselineCount = await appState.fetchDeviceCount() ?? appState.linkedDeviceCount
            while !Task.isCancelled && !isLinked {
                try? await Task.sleep(for: .seconds(2))
                if Task.isCancelled { break }
                if let current = await appState.fetchDeviceCount(), current > baselineCount {
                    // Success! A new device was added.
                    isLinked = true
                    HapticService.shared.playLinkSuccess()
                    // Refresh projects in the background so they're ready
                    Task { await appState.refreshProjects() }
                    // Brief success state, then dismiss
                    try? await Task.sleep(for: .milliseconds(1800))
                    onDismiss()
                    break
                }
            }
        }
    }
}

struct LinkCodeCountdown: View {
    let expiresAt: Date
    let onExpired: () -> Void

    @State private var remaining: Int = 0

    var body: some View {
        Text(timeString)
            .font(.system(.caption, design: .monospaced))
            .foregroundStyle(remaining <= 60 ? .red : .secondary)
            .onAppear { updateRemaining() }
            .task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(1))
                    updateRemaining()
                }
            }
    }

    private var timeString: String {
        let minutes = remaining / 60
        let seconds = remaining % 60
        return String(format: "Expires in %d:%02d", minutes, seconds)
    }

    private func updateRemaining() {
        let secs = Int(expiresAt.timeIntervalSinceNow)
        if secs <= 0 {
            remaining = 0
            onExpired()
        } else {
            remaining = secs
        }
    }
}
