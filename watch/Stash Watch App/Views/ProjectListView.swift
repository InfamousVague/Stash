import SwiftUI

private let relativeDateFormatter: RelativeDateTimeFormatter = {
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .abbreviated
    return f
}()

/// Standalone version with its own NavigationStack (for non-tab use)
struct ProjectListView: View {
    var body: some View {
        NavigationStack {
            ProjectListContent()
        }
    }
}

/// Content without NavigationStack (for embedding in TabView)
struct ProjectListContent: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Group {
            if appState.filteredProjects.isEmpty && !appState.isLoading {
                EmptyProjectsView()
            } else {
                List {
                    // If viewing all workspaces and there are multiple, group by workspace
                    if appState.selectedWorkspaceId == nil && appState.workspaces.count > 1 {
                        ForEach(appState.workspaces) { workspace in
                            let wsProjects = appState.projects.filter { $0.sourceDeviceId == workspace.id }
                            if !wsProjects.isEmpty {
                                Section {
                                    ForEach(wsProjects) { project in
                                        NavigationLink(destination: ProjectDetailView(project: project)) {
                                            ProjectCard(project: project)
                                        }
                                    }
                                } header: {
                                    HStack(spacing: 6) {
                                        Image(systemName: "laptopcomputer")
                                            .font(.system(size: 10))
                                        Text(workspace.displayName)
                                            .font(.system(size: 11, weight: .semibold))
                                            .lineLimit(1)
                                            .truncationMode(.tail)
                                        if appState.lanReachable[workspace.id] == true {
                                            Image(systemName: "wifi")
                                                .font(.system(size: 8))
                                                .foregroundStyle(.stashGreen)
                                        }
                                    }
                                    .foregroundStyle(.stashGreen)
                                }
                            }
                        }
                    } else {
                        // Single workspace or filtered view — flat list
                        ForEach(appState.filteredProjects) { project in
                            NavigationLink(destination: ProjectDetailView(project: project)) {
                                ProjectCard(project: project)
                            }
                        }
                    }

                    // Sync info footer
                    if let lastSync = appState.lastSyncTime {
                        HStack(spacing: 4) {
                            Spacer()
                            if !appState.lastSyncPath.isEmpty {
                                Image(systemName: appState.lastSyncPath == "lan" ? "wifi" : "globe")
                                    .font(.system(size: 8))
                                    .foregroundStyle(.secondary)
                            }
                            Text("Synced \(lastSync, formatter: relativeDateFormatter)")
                                .font(.system(size: 9))
                                .foregroundStyle(.secondary)
                            Spacer()
                        }
                        .listRowBackground(Color.clear)
                    }
                }
            }
        }
        .navigationTitle(appState.selectedWorkspaceId != nil ? appState.selectedWorkspaceLabel : "Projects")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task {
                        await appState.refreshProjects()
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .symbolEffect(.pulse, value: appState.isLoading)
                }
            }
        }
        .overlay {
            if appState.isLoading && appState.projects.isEmpty {
                ProgressView()
                    .tint(.stashGreen)
            }
        }
    }
}

// MARK: - Workspace Chip

/// Tappable chip that opens a workspace picker sheet.
struct WorkspaceChip: View {
    @EnvironmentObject var appState: AppState
    @State private var showWorkspacePicker = false

    var body: some View {
        Button {
            showWorkspacePicker = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: appState.selectedWorkspaceId == nil ? "rectangle.stack.fill" : "laptopcomputer")
                    .font(.system(size: 11))
                    .foregroundStyle(.stashGreen)
                Text(appState.selectedWorkspaceLabel)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                if let wsId = appState.selectedWorkspaceId,
                   appState.lanReachable[wsId] == true {
                    Image(systemName: "wifi")
                        .font(.system(size: 9))
                        .foregroundStyle(.stashGreen)
                }
                Spacer(minLength: 4)
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(.stashGreen.opacity(0.12))
                    .overlay(
                        Capsule()
                            .stroke(.stashGreen.opacity(0.3), lineWidth: 0.5)
                    )
            )
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showWorkspacePicker) {
            WorkspacePickerSheet(isPresented: $showWorkspacePicker)
        }
    }
}

// MARK: - Workspace Picker Sheet

struct WorkspacePickerSheet: View {
    @EnvironmentObject var appState: AppState
    @Binding var isPresented: Bool

    var body: some View {
        List {
            // "All Workspaces" row
            Button {
                appState.selectedWorkspaceId = nil
                HapticService.shared.play(.confirm)
                isPresented = false
            } label: {
                HStack {
                    Image(systemName: "rectangle.stack.fill")
                        .foregroundStyle(.stashGreen)
                        .frame(width: 22)
                    Text("All Workspaces")
                    Spacer()
                    if appState.selectedWorkspaceId == nil {
                        Image(systemName: "checkmark")
                            .foregroundStyle(.stashGreen)
                    }
                    Text("\(appState.projects.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // One row per workspace
            ForEach(appState.workspaces) { workspace in
                Button {
                    appState.selectedWorkspaceId = workspace.id
                    HapticService.shared.play(.confirm)
                    isPresented = false
                } label: {
                    HStack {
                        Image(systemName: "laptopcomputer")
                            .foregroundStyle(.stashGreen)
                            .frame(width: 22)
                        Text(workspace.displayName)
                        if appState.lanReachable[workspace.id] == true {
                            Image(systemName: "wifi")
                                .font(.system(size: 10))
                                .foregroundStyle(.stashGreen)
                        }
                        Spacer()
                        if appState.selectedWorkspaceId == workspace.id {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.stashGreen)
                        }
                        Text("\(appState.projects.filter { $0.sourceDeviceId == workspace.id }.count)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Workspaces")
    }
}

// MARK: - Empty State

struct EmptyProjectsView: View {
    @EnvironmentObject var appState: AppState
    @State private var linkCodeSheet: LinkCodeSheetData?
    @State private var isGeneratingCode = false
    @State private var linkError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if appState.hasLinkedMac {
                    // Auto-poll for projects while in "waiting" state
                    Color.clear
                        .frame(height: 0)
                        .task {
                            while !Task.isCancelled && appState.projects.isEmpty {
                                try? await Task.sleep(for: .seconds(4))
                                if Task.isCancelled { break }
                                await appState.refreshProjects()
                            }
                        }
                    // Linked but no projects yet — waiting for sync
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 32))
                        .foregroundStyle(.stashGreen)
                        .symbolEffect(.pulse, options: .repeating)
                        .padding(.top, 4)

                    Text("Waiting for Sync")
                        .font(.headline)
                        .multilineTextAlignment(.center)

                    Text("Mac is linked but hasn't pushed any projects yet. Make sure Stash is running on your Mac.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 4)

                    Button {
                        Task { await appState.refreshProjects() }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.clockwise")
                            Text("Refresh")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.stashGreen)
                    .padding(.top, 4)
                } else {
                    // Not linked yet — show link CTA
                    Image(systemName: "laptopcomputer.and.iphone")
                        .font(.system(size: 32))
                        .foregroundStyle(.stashGreen)
                        .padding(.top, 4)

                    Text("Link Your Mac")
                        .font(.headline)
                        .multilineTextAlignment(.center)

                    Text("Generate a code here, then enter it in Stash on your Mac to sync your projects.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 4)

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
                        HStack(spacing: 8) {
                            ZStack {
                                if isGeneratingCode {
                                    ProgressView()
                                        .scaleEffect(0.7)
                                } else {
                                    Image(systemName: "laptopcomputer")
                                        .font(.system(size: 14))
                                }
                            }
                            .frame(width: 18, height: 18)
                            Text("Link Mac")
                                .fontWeight(.semibold)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.stashGreen)
                    .disabled(isGeneratingCode)
                    .padding(.top, 4)

                    if let linkError {
                        Text(linkError)
                            .font(.caption2)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }
                }
            }
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity)
        }
        .sheet(item: $linkCodeSheet) { data in
            LinkCodeSheet(code: data.code, expiresAt: data.expiresAt) {
                linkCodeSheet = nil
            }
        }
    }
}

/// Reusable empty state view — centered vertically and horizontally, uniform spacing
struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 32))
                .foregroundStyle(.stashGreen)

            Text(title)
                .font(.headline)
                .multilineTextAlignment(.center)

            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 12)
    }
}

// MARK: - Project Card

struct ProjectCard: View {
    @EnvironmentObject var appState: AppState
    let project: Project

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header: name + framework badge
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(project.name)
                        .font(.headline)
                        .lineLimit(1)

                    if let framework = project.framework {
                        Text(framework)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(.stashGreen)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(.stashGreen.opacity(0.15))
                            )
                    }
                }

                Spacer()

                // Vault lock indicator
                if project.variableCount == 0 && project.profileCount > 0 {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(.orange)
                }

                // Health indicator
                if let health = project.health {
                    if health.isHealthy {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(.green)
                    } else {
                        HStack(spacing: 2) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 10))
                                .foregroundStyle(health.exposedCount > 0 ? .red : .orange)
                            Text("\(health.totalIssues)")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(health.exposedCount > 0 ? .red : .orange)
                        }
                    }
                }
            }

            // Active profile
            HStack(spacing: 6) {
                HealthDot(isHealthy: project.health?.isHealthy ?? true)

                Text(project.activeProfile)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.stashGreen)
                    .lineLimit(1)

                Spacer()

                Text("\(project.variableCount) vars")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            // Profile count
            HStack(spacing: 4) {
                Image(systemName: "doc.on.doc")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                Text("\(project.profileCount) profiles")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }

            // Workspace label
            if let workspace = appState.workspaces.first(where: { $0.id == project.sourceDeviceId }) {
                HStack(spacing: 4) {
                    Image(systemName: "laptopcomputer")
                        .font(.system(size: 8))
                        .foregroundStyle(.secondary)
                    Text(workspace.displayName)
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Health Dot

struct HealthDot: View {
    let isHealthy: Bool
    @State private var isPulsing = false

    var body: some View {
        ZStack {
            if !isHealthy {
                Circle()
                    .fill(Color.orange.opacity(0.3))
                    .frame(width: 14, height: 14)
                    .scaleEffect(isPulsing ? 1.4 : 1.0)
                    .opacity(isPulsing ? 0.0 : 0.6)
                    .animation(
                        .easeInOut(duration: 1.5).repeatForever(autoreverses: false),
                        value: isPulsing
                    )
            }

            Circle()
                .fill(isHealthy ? Color.green : Color.orange)
                .frame(width: 8, height: 8)
                .shadow(color: (isHealthy ? Color.green : Color.orange).opacity(0.5), radius: isHealthy ? 3 : 0)
        }
        .onAppear {
            if !isHealthy {
                isPulsing = true
            }
        }
    }
}
