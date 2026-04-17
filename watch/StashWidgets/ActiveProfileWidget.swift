import WidgetKit
import SwiftUI

// MARK: - Shared Widget Project (decoded from app's JSON)

struct WidgetProject: Codable {
    let id: String
    let name: String
    let activeProfile: String
    let framework: String?
    let staleCount: Int
    let expiringCount: Int
    let exposedCount: Int

    var totalIssues: Int { staleCount + expiringCount + exposedCount }
}

// MARK: - Timeline Provider

struct ActiveProfileProvider: TimelineProvider {
    private let defaults = UserDefaults(suiteName: "group.com.mattssoftware.stash.watchkitapp")

    func placeholder(in context: Context) -> ActiveProfileEntry {
        ActiveProfileEntry(
            date: Date(),
            projectName: "my-api",
            activeProfile: ".env.production",
            allProjects: []
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (ActiveProfileEntry) -> Void) {
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ActiveProfileEntry>) -> Void) {
        let entry = currentEntry()
        // Refresh every 30 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func currentEntry() -> ActiveProfileEntry {
        let projectName = defaults?.string(forKey: "widget_first_project_name") ?? "No project"
        let activeProfile = defaults?.string(forKey: "widget_first_active_profile") ?? "--"

        var allProjects: [WidgetProject] = []
        if let data = defaults?.data(forKey: "widget_projects_json"),
           let decoded = try? JSONDecoder().decode([WidgetProject].self, from: data) {
            allProjects = decoded
        }

        return ActiveProfileEntry(
            date: Date(),
            projectName: projectName,
            activeProfile: activeProfile,
            allProjects: allProjects
        )
    }
}

// MARK: - Entry

struct ActiveProfileEntry: TimelineEntry {
    let date: Date
    let projectName: String
    let activeProfile: String
    let allProjects: [WidgetProject]

    /// Abbreviation for circular widget (first 3 chars of profile name without dot)
    var abbreviation: String {
        let clean = activeProfile.replacingOccurrences(of: ".env", with: "")
            .replacingOccurrences(of: ".", with: "")
        if clean.isEmpty { return "ENV" }
        return String(clean.prefix(3)).uppercased()
    }
}

// MARK: - Widget Views

struct ActiveProfileCircularView: View {
    let entry: ActiveProfileEntry

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 1) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 10))
                Text(entry.abbreviation)
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
            }
        }
    }
}

struct ActiveProfileRectangularView: View {
    let entry: ActiveProfileEntry

    var body: some View {
        if entry.allProjects.isEmpty {
            // Fallback to single project display
            HStack(spacing: 6) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 14))

                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.projectName)
                        .font(.system(size: 12, weight: .semibold))
                        .lineLimit(1)
                    Text(entry.activeProfile)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()
            }
        } else {
            // Show up to 3 projects with active profiles
            VStack(alignment: .leading, spacing: 2) {
                ForEach(entry.allProjects.prefix(3), id: \.id) { project in
                    HStack(spacing: 4) {
                        Text(project.name)
                            .font(.system(size: 10, weight: .semibold))
                            .lineLimit(1)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 7))
                            .foregroundStyle(.secondary)
                        Text(project.activeProfile)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
        }
    }
}

struct ActiveProfileInlineView: View {
    let entry: ActiveProfileEntry

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "lock.shield.fill")
            Text("\(entry.projectName): \(entry.activeProfile)")
        }
    }
}

// MARK: - Widget Definition

struct ActiveProfileWidget: Widget {
    let kind: String = "ActiveProfileWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ActiveProfileProvider()) { entry in
            switch entry.date {
            default:
                ActiveProfileCircularView(entry: entry)
            }
        }
        .configurationDisplayName("Active Profile")
        .description("Shows the active .env profile for your project.")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}

// MARK: - Previews

#Preview("Circular", as: .accessoryCircular) {
    ActiveProfileWidget()
} timeline: {
    ActiveProfileEntry(date: Date(), projectName: "my-api", activeProfile: ".env.production", allProjects: [])
}

#Preview("Rectangular", as: .accessoryRectangular) {
    ActiveProfileWidget()
} timeline: {
    ActiveProfileEntry(date: Date(), projectName: "my-api", activeProfile: ".env.production", allProjects: [])
}
