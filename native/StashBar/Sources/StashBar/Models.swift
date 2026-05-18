import Foundation
import Observation

// MARK: - On-disk shapes (read-only; StashBar never owns the vault)

struct Project: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let path: String
    var activeProfile: String?
    var profiles: [String] = []
    var localOnly: Bool = false
}

private struct Session: Codable {
    let key: String
    let expires: Double
}

private struct LockMember: Codable { let name: String }

private struct LockFile: Codable {
    let version: Int
    var members: [LockMember] = []
    var profiles: [String: [String: [String: String]]] = [:]
}

/// Derived per-project summary shown in the menu bar.
struct ProjectRow: Identifiable, Hashable {
    let id: String
    let name: String
    let path: String
    let activeProfile: String
    let profileCount: Int
    let memberCount: Int
    let activeVarCount: Int?
    let hasLock: Bool
}

enum StashReader {
    private static var stashDir: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".stash", isDirectory: true)
    }

    private static var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    /// Vault is "unlocked" while a non-expired session token exists.
    static func vaultUnlocked() -> Bool {
        let url = stashDir.appendingPathComponent("session.json")
        guard let data = try? Data(contentsOf: url),
              let s = try? decoder.decode(Session.self, from: data) else { return false }
        return s.expires > Date().timeIntervalSince1970
    }

    static func projects() -> [Project] {
        let url = stashDir.appendingPathComponent("projects.json")
        guard let data = try? Data(contentsOf: url),
              let list = try? decoder.decode([Project].self, from: data) else { return [] }
        return list
    }

    static func row(for project: Project) -> ProjectRow {
        let lockURL = URL(fileURLWithPath: project.path).appendingPathComponent(".stash.lock")
        var members = 0
        var profiles: [String: [String: [String: String]]] = [:]
        var hasLock = false
        if let data = try? Data(contentsOf: lockURL),
           let lock = try? decoder.decode(LockFile.self, from: data) {
            hasLock = true
            members = lock.members.count
            profiles = lock.profiles
        }
        let active = project.activeProfile ?? "—"
        let activeVars = profiles[active]?.count
        return ProjectRow(
            id: project.id,
            name: project.name,
            path: project.path,
            activeProfile: active,
            profileCount: max(profiles.count, project.profiles.count),
            memberCount: members,
            activeVarCount: activeVars,
            hasLock: hasLock
        )
    }
}

// MARK: - Store

@MainActor
@Observable
final class StashStore {
    var vaultUnlocked = false
    var rows: [ProjectRow] = []

    @ObservationIgnored var onStateChange: (() -> Void)?

    func refresh() {
        let wasUnlocked = vaultUnlocked
        vaultUnlocked = StashReader.vaultUnlocked()
        rows = StashReader.projects().map(StashReader.row(for:))
        if wasUnlocked != vaultUnlocked { onStateChange?() }
    }
}
