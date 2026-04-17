import WidgetKit
import SwiftUI

// MARK: - Timeline Provider

struct HealthProvider: TimelineProvider {
    private let defaults = UserDefaults(suiteName: "group.com.mattssoftware.stash.watchkitapp")

    func placeholder(in context: Context) -> HealthEntry {
        HealthEntry(
            date: Date(),
            totalProjects: 3,
            healthyProjects: 2,
            staleCount: 1,
            expiringCount: 0,
            exposedCount: 1
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (HealthEntry) -> Void) {
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HealthEntry>) -> Void) {
        let entry = currentEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func currentEntry() -> HealthEntry {
        let total = defaults?.integer(forKey: "widget_total_projects") ?? 0
        let healthy = defaults?.integer(forKey: "widget_healthy_projects") ?? 0
        let stale = defaults?.integer(forKey: "widget_total_stale") ?? 0
        let expiring = defaults?.integer(forKey: "widget_total_expiring") ?? 0
        let exposed = defaults?.integer(forKey: "widget_total_exposed") ?? 0

        return HealthEntry(
            date: Date(),
            totalProjects: total,
            healthyProjects: healthy,
            staleCount: stale,
            expiringCount: expiring,
            exposedCount: exposed
        )
    }
}

// MARK: - Entry

struct HealthEntry: TimelineEntry {
    let date: Date
    let totalProjects: Int
    let healthyProjects: Int
    let staleCount: Int
    let expiringCount: Int
    let exposedCount: Int

    var healthyPercent: Double {
        guard totalProjects > 0 else { return 1.0 }
        return Double(healthyProjects) / Double(totalProjects)
    }

    var totalIssues: Int {
        staleCount + expiringCount + exposedCount
    }
}

// MARK: - Widget Views

struct HealthCircularView: View {
    let entry: HealthEntry

    var body: some View {
        Gauge(value: entry.healthyPercent) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 9))
        } currentValueLabel: {
            Text("\(Int(entry.healthyPercent * 100))")
                .font(.system(size: 14, weight: .bold, design: .monospaced))
        }
        .gaugeStyle(.accessoryCircular)
        .tint(gaugeGradient)
    }

    private var gaugeGradient: Gradient {
        Gradient(colors: [.red, .orange, .green])
    }
}

struct HealthRectangularView: View {
    let entry: HealthEntry

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: entry.totalIssues == 0 ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
                .font(.system(size: 14))
                .foregroundStyle(entry.totalIssues == 0 ? .green : .orange)

            VStack(alignment: .leading, spacing: 2) {
                if entry.totalIssues == 0 {
                    Text("All Healthy")
                        .font(.system(size: 12, weight: .semibold))
                    Text("\(entry.totalProjects) projects")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                } else {
                    Text("\(entry.totalIssues) Issues")
                        .font(.system(size: 12, weight: .semibold))

                    HStack(spacing: 6) {
                        if entry.staleCount > 0 {
                            Text("\(entry.staleCount)s")
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundStyle(.orange)
                        }
                        if entry.expiringCount > 0 {
                            Text("\(entry.expiringCount)e")
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundStyle(.yellow)
                        }
                        if entry.exposedCount > 0 {
                            Text("\(entry.exposedCount)x")
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundStyle(.red)
                        }
                    }
                }
            }

            Spacer()
        }
    }
}

// MARK: - Widget Definition

struct HealthWidget: Widget {
    let kind: String = "HealthWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HealthProvider()) { entry in
            switch entry.date {
            default:
                HealthCircularView(entry: entry)
            }
        }
        .configurationDisplayName("Env Health")
        .description("Shows the health of your environment variables.")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
        ])
    }
}

// MARK: - Previews

#Preview("Circular", as: .accessoryCircular) {
    HealthWidget()
} timeline: {
    HealthEntry(date: Date(), totalProjects: 3, healthyProjects: 2, staleCount: 1, expiringCount: 0, exposedCount: 1)
}

#Preview("Rectangular", as: .accessoryRectangular) {
    HealthWidget()
} timeline: {
    HealthEntry(date: Date(), totalProjects: 3, healthyProjects: 2, staleCount: 1, expiringCount: 0, exposedCount: 1)
}
