import Foundation
import SwiftUI

// MARK: - Project

struct Project: Codable, Identifiable {
    let id: String
    /// Which Mac (workspace) pushed this project
    let sourceDeviceId: String
    let name: String
    let path: String
    let framework: String?
    let activeProfile: String
    let profiles: [String]
    let variableCounts: [String: Int]
    let health: ProjectHealth?

    /// Number of profiles for this project.
    var profileCount: Int { profiles.count }

    /// Number of variables in the active profile (falls back to max across profiles).
    var variableCount: Int {
        if let c = variableCounts[activeProfile] { return c }
        return variableCounts.values.max() ?? 0
    }

    enum CodingKeys: String, CodingKey {
        case id, name, path, framework
        case sourceDeviceId = "source_device_id"
        case activeProfile = "active_profile"
        case profiles
        case variableCounts = "variable_counts"
        case health
    }

    init(id: String, sourceDeviceId: String = "", name: String, path: String, framework: String? = nil,
         activeProfile: String = ".env", profiles: [String] = [],
         variableCounts: [String: Int] = [:], health: ProjectHealth? = nil) {
        self.id = id; self.sourceDeviceId = sourceDeviceId
        self.name = name; self.path = path
        self.framework = framework; self.activeProfile = activeProfile
        self.profiles = profiles
        self.variableCounts = variableCounts
        self.health = health
    }
}

// MARK: - Workspace (a linked Mac)

struct Workspace: Codable, Identifiable, Hashable {
    let id: String          // device_id
    let publicKey: String
    let deviceType: String
    let label: String?
    let lanIP: String?
    let lanPort: Int?
    let lanUpdatedAt: String?

    /// Display name — uses label, or falls back to "Mac" / device_type
    var displayName: String {
        if let label = label, !label.isEmpty {
            return label
        }
        return deviceType.capitalized
    }

    enum CodingKeys: String, CodingKey {
        case id = "device_id"
        case publicKey = "public_key"
        case deviceType = "device_type"
        case label
        case lanIP = "lan_ip"
        case lanPort = "lan_port"
        case lanUpdatedAt = "lan_updated_at"
    }
}

struct DeviceKeysResponse: Codable {
    let devices: [Workspace]
}

// MARK: - Project Health

struct ProjectHealth: Codable {
    let staleCount: Int
    let expiringCount: Int
    let exposedCount: Int

    var totalIssues: Int { staleCount + expiringCount + exposedCount }
    var isHealthy: Bool { totalIssues == 0 }

    enum CodingKeys: String, CodingKey {
        case staleCount = "stale_count"
        case expiringCount = "expiring_count"
        case exposedCount = "exposed_count"
    }

    init(staleCount: Int = 0, expiringCount: Int = 0, exposedCount: Int = 0) {
        self.staleCount = staleCount
        self.expiringCount = expiringCount
        self.exposedCount = exposedCount
    }
}

// MARK: - Profile

struct Profile: Codable, Identifiable {
    var id: String { name }
    let name: String
    let variableCount: Int

    enum CodingKeys: String, CodingKey {
        case name
        case variableCount = "variable_count"
    }

    init(name: String, variableCount: Int = 0) {
        self.name = name
        self.variableCount = variableCount
    }
}

// MARK: - Environment Variable

struct EnvVariable: Codable, Identifiable {
    var id: String { key }
    let key: String
    /// Map of device_id → base64 ciphertext. Each entry is encrypted for
    /// a specific peer device using X25519 + AES-256-GCM (E2E).
    /// If vault is locked on the Mac, contains { "__locked__": "vault_locked" }.
    let encryptedFor: [String: String]

    /// Derived: the daemon writes `{"__locked__": "vault_locked"}` when the Mac's vault is locked.
    var isVaultLocked: Bool { encryptedFor["__locked__"] == "vault_locked" }

    /// Get the ciphertext addressed to this device's ID.
    func ciphertext(for deviceId: String) -> String? {
        encryptedFor[deviceId]
    }

    enum CodingKeys: String, CodingKey {
        case key
        case encryptedFor = "encrypted_for"
    }

    init(key: String, encryptedFor: [String: String] = [:]) {
        self.key = key
        self.encryptedFor = encryptedFor
    }
}

/// Wrapper returned by GET /projects/:id/vars and /vars/:profile
struct VariablesResponse: Codable {
    let profile: String
    let variables: [EnvVariable]
}

// MARK: - Switch Profile Request / Status

struct SwitchRequest: Codable {
    let profile: String
}

/// Response from POST /projects/:id/switch — the relay creates a pending action
/// that the Mac daemon picks up. We just need to know the request was accepted.
struct SwitchStatus: Codable {
    let id: String
    let actionType: String
    let projectId: String
    let profile: String

    enum CodingKeys: String, CodingKey {
        case id
        case actionType = "action_type"
        case projectId = "project_id"
        case profile
    }
}

// MARK: - Projects Response

struct ProjectsResponse: Codable {
    let projects: [Project]
}

// MARK: - Profiles Response

struct ProfilesResponse: Codable {
    let profiles: [Profile]
}

// MARK: - Device Linking

struct LinkCodeResponse: Codable {
    let code: String
    let expiresIn: Int

    enum CodingKeys: String, CodingKey {
        case code
        case expiresIn = "expires_in"
    }
}

struct LinkedDevicesResponse: Codable {
    let count: Int
}

struct UpsertDeviceKeyRequest: Codable {
    let deviceId: String
    let publicKey: String
    let deviceType: String
    let label: String?

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case publicKey = "public_key"
        case deviceType = "device_type"
        case label
    }
}

struct EmptyBody: Codable {}
