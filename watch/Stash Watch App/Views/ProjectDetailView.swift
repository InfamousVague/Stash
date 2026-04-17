import SwiftUI

private let relativeDateFormatter: RelativeDateTimeFormatter = {
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .abbreviated
    return f
}()

struct ProjectDetailView: View {
    let project: Project
    @EnvironmentObject var appState: AppState
    @State private var profiles: [Profile] = []
    @State private var isLoadingProfiles = false
    @State private var isSwitching = false
    @State private var selectedProfile: String = ""

    var body: some View {
        List {
            // Active profile section
            Section {
                HStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(.stashGreen.opacity(0.15))
                            .frame(width: 36, height: 36)

                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(.stashGreen)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Active Profile")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundStyle(.secondary)
                            .textCase(.uppercase)

                        Text(project.activeProfile)
                            .font(.system(.body, design: .monospaced))
                            .fontWeight(.semibold)
                            .foregroundStyle(.stashGreen)
                    }
                }
                .padding(.vertical, 4)
            }

            // Framework & stats
            Section {
                if let framework = project.framework {
                    HStack {
                        Text("Framework")
                            .font(.caption)
                        Spacer()
                        Text(framework)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.stashGreen)
                    }
                }

                HStack {
                    Text("Variables")
                        .font(.caption)
                    Spacer()
                    Text("\(project.variableCount)")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.stashGreen)
                }

                HStack {
                    Text("Profiles")
                        .font(.caption)
                    Spacer()
                    Text("\(project.profileCount)")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }

            // Health section
            if let health = project.health, !health.isHealthy {
                Section {
                    if health.staleCount > 0 {
                        NavigationLink(destination: VariableListView(projectId: project.id, profileName: project.activeProfile)) {
                            HStack(spacing: 8) {
                                Image(systemName: "clock.badge.exclamationmark")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                                    .frame(width: 18)
                                Text("Stale")
                                    .font(.caption)
                                Spacer()
                                Text("\(health.staleCount)")
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(.orange)
                            }
                        }
                    }

                    if health.expiringCount > 0 {
                        NavigationLink(destination: VariableListView(projectId: project.id, profileName: project.activeProfile)) {
                            HStack(spacing: 8) {
                                Image(systemName: "hourglass")
                                    .font(.caption)
                                    .foregroundStyle(.yellow)
                                    .frame(width: 18)
                                Text("Expiring")
                                    .font(.caption)
                                Spacer()
                                Text("\(health.expiringCount)")
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(.yellow)
                            }
                        }
                    }

                    if health.exposedCount > 0 {
                        NavigationLink(destination: VariableListView(projectId: project.id, profileName: project.activeProfile)) {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.shield.fill")
                                    .font(.caption)
                                    .foregroundStyle(.red)
                                    .frame(width: 18)
                                Text("Exposed")
                                    .font(.caption)
                                Spacer()
                                Text("\(health.exposedCount)")
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(.red)
                            }
                        }
                    }

                    NavigationLink(destination: VariableListView(projectId: project.id, profileName: project.activeProfile)) {
                        HStack(spacing: 8) {
                            Image(systemName: "list.bullet.rectangle")
                                .font(.caption)
                                .foregroundStyle(.stashGreen)
                                .frame(width: 18)
                            Text("View All Issues")
                                .font(.caption)
                                .foregroundStyle(.stashGreen)
                        }
                    }
                } header: {
                    Label("Health Issues", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                } footer: {
                    if let lastSync = appState.lastSyncTime {
                        Text("Health checked \(lastSync, formatter: relativeDateFormatter)")
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }
            }

            // Switch profile section
            Section {
                if isLoadingProfiles {
                    HStack {
                        Spacer()
                        ProgressView()
                            .tint(.stashGreen)
                        Spacer()
                    }
                } else if profiles.isEmpty {
                    Text("No other profiles available")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(profiles) { profile in
                        Button {
                            selectedProfile = profile.name
                            Task {
                                isSwitching = true
                                HapticService.shared.play(.start)
                                _ = await appState.switchProfile(projectId: project.id, profile: profile.name)
                                isSwitching = false
                            }
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: profile.name == project.activeProfile ? "circle.inset.filled" : "circle")
                                    .font(.caption)
                                    .foregroundStyle(profile.name == project.activeProfile ? .stashGreen : .secondary)
                                    .frame(width: 18)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(profile.name)
                                        .font(.system(.caption, design: .monospaced))
                                        .foregroundStyle(profile.name == project.activeProfile ? .stashGreen : .primary)

                                    Text("\(profile.variableCount) vars")
                                        .font(.system(size: 9, design: .monospaced))
                                        .foregroundStyle(.secondary)
                                }

                                Spacer()

                                if profile.name == project.activeProfile {
                                    Text("Active")
                                        .font(.system(size: 9, weight: .medium))
                                        .foregroundStyle(.stashGreen)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(
                                            Capsule()
                                                .fill(.stashGreen.opacity(0.15))
                                        )
                                }
                            }
                            .padding(.vertical, 2)
                        }
                        .disabled(profile.name == project.activeProfile || isSwitching)
                    }
                }
            } header: {
                Label("Switch Profile", systemImage: "arrow.triangle.2.circlepath")
                    .font(.caption2)
                    .foregroundStyle(.stashGreen)
            }

            // View variables
            Section {
                NavigationLink(destination: VariableListView(projectId: project.id, profileName: project.activeProfile)) {
                    HStack(spacing: 8) {
                        Image(systemName: "list.bullet.rectangle")
                            .font(.caption)
                            .foregroundStyle(.stashGreen)
                            .frame(width: 18)
                        Text("View Variables")
                            .font(.body)
                        Spacer()
                        Text("\(project.variableCount)")
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle(project.name)
        .task {
            await loadProfiles()
        }
        .overlay {
            if isSwitching {
                ZStack {
                    Color.black.opacity(0.4)
                        .ignoresSafeArea()
                    VStack(spacing: 8) {
                        ProgressView()
                            .tint(.stashGreen)
                        Text("Switching...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func loadProfiles() async {
        isLoadingProfiles = true
        defer { isLoadingProfiles = false }
        profiles = await appState.getProfiles(projectId: project.id)
    }
}
