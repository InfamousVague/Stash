import SwiftUI
import WidgetKit

@MainActor
class AppState: ObservableObject {
    @Published var isConfigured: Bool = false
    @Published var projects: [Project] = []
    @Published var workspaces: [Workspace] = []
    @Published var selectedWorkspaceId: String? = nil  // nil = "All Workspaces"
    @Published var linkedDeviceCount: Int = 0
    @Published var isLoading: Bool = false
    @Published var error: String?
    @Published var lanReachable: [String: Bool] = [:]  // device_id -> reachable
    @Published var lastSyncTime: Date?
    @Published var lastSyncPath: String = "" // "lan" or "relay" or ""

    /// True if this account has at least one Mac/device pushing data to the relay.
    var hasLinkedMac: Bool { !workspaces.isEmpty }

    /// Projects filtered by the selected workspace (or all if none selected)
    var filteredProjects: [Project] {
        guard let workspaceId = selectedWorkspaceId else { return projects }
        return projects.filter { $0.sourceDeviceId == workspaceId }
    }

    /// Display name for the currently selected workspace ("All" if none)
    var selectedWorkspaceLabel: String {
        guard let id = selectedWorkspaceId else { return "All Workspaces" }
        return workspaces.first(where: { $0.id == id })?.displayName ?? "Unknown"
    }

    private let keychain = KeychainService.shared
    private var apiClient: APIClient?

    init() {
        if let url = keychain.getRelayURL(),
           let token = keychain.getToken(),
           !url.isEmpty, !token.isEmpty {
            self.apiClient = APIClient(baseURL: url, token: token)
            self.isConfigured = true
            // Load cached projects so the UI isn't empty while network loads
            loadCachedProjects()
            // Make sure the device key is registered on every launch.
            // Idempotent — upsert on relay side.
            Task { await self.ensureDeviceKeyRegistered() }
        }
    }

    // MARK: - Offline Cache

    private func cacheProjects() {
        if let data = try? JSONEncoder().encode(projects) {
            UserDefaults.standard.set(data, forKey: "cached_projects")
        }
    }

    private func loadCachedProjects() {
        if let data = UserDefaults.standard.data(forKey: "cached_projects"),
           let cached = try? JSONDecoder().decode([Project].self, from: data) {
            self.projects = cached
        }
    }

    // MARK: - Auth

    func signInWithApple(identityToken: String, userIdentifier: String, email: String?) async {
        let url = AppConfig.relayURL
        guard let requestURL = URL(string: "\(url)/auth/apple") else { return }

        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "identity_token": identityToken,
            "user_identifier": userIdentifier,
            "email": email ?? ""
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                print("[Stash] Sign-in: no HTTP response")
                self.error = "No response from relay"
                return
            }
            print("[Stash] Sign-in response: \(httpResponse.statusCode)")
            guard (200...299).contains(httpResponse.statusCode) else {
                let body = String(data: data, encoding: .utf8) ?? "no body"
                print("[Stash] Sign-in failed: \(httpResponse.statusCode) - \(body)")
                self.error = "Sign in failed (\(httpResponse.statusCode))"
                return
            }
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard let token = json?["token"] as? String else {
                print("[Stash] Sign-in: no token in response")
                self.error = "Invalid response from relay"
                return
            }
            configure(relayURL: url, token: token)
            HapticService.shared.play(.success)
            // After sign-in, ensure this device has a keypair and upload its public key
            await ensureDeviceKeyRegistered()
        } catch {
            print("[Stash] Sign-in error: \(error)")
            self.error = error.localizedDescription
        }
    }

    func configure(relayURL: String, token: String) {
        keychain.setRelayURL(relayURL)
        keychain.setToken(token)
        self.apiClient = APIClient(baseURL: relayURL, token: token)
        self.isConfigured = true
    }

    /// Make sure this watch has an X25519 keypair and that the public key is
    /// registered with the relay so the Mac can encrypt values for it.
    func ensureDeviceKeyRegistered() async {
        guard let client = apiClient else { return }

        let deviceId = keychain.getOrCreateDeviceId()

        // Generate keypair if missing
        let publicKey: String
        if let existingPrivate = keychain.getPrivateKey(),
           let privateKey = CryptoService.loadPrivateKey(from: existingPrivate) {
            publicKey = privateKey.publicKey.rawRepresentation.base64EncodedString()
            print("[Stash] Using existing device keypair")
        } else {
            let keypair = CryptoService.generateKeypair()
            keychain.setPrivateKey(keypair.privateKey)
            publicKey = keypair.publicKey
            print("[Stash] Generated new device keypair")
        }

        // Upload to relay
        do {
            try await client.uploadDeviceKey(
                deviceId: deviceId,
                publicKey: publicKey,
                deviceType: "watch",
                label: "Apple Watch"
            )
            print("[Stash] Device key registered: \(deviceId.prefix(8))")
        } catch {
            print("[Stash] Failed to register device key: \(error)")
        }
    }

    func checkRelayHealth() async -> Bool {
        guard let client = apiClient else { return false }
        do {
            _ = try await client.getLinkedDevices()
            return true
        } catch {
            return false
        }
    }

    func disconnect() {
        keychain.clearAll()
        self.apiClient = nil
        self.isConfigured = false
        self.projects = []
    }

    // MARK: - Projects

    func refreshProjects() async {
        guard let client = apiClient else { return }
        isLoading = true
        defer { isLoading = false }

        // Fetch workspaces and linked devices in parallel (projects after LAN endpoints are set)
        async let workspacesResult = client.getWorkspaces()
        async let devicesResult = client.getLinkedDevices()

        // Update workspaces first so we can set LAN endpoints before fetching projects
        let previousWorkspaceCount = self.workspaces.count
        if let workspaces = try? await workspacesResult {
            // Detect newly linked Mac
            if workspaces.count > previousWorkspaceCount && previousWorkspaceCount > 0 {
                let newMacs = workspaces.filter { ws in
                    !self.workspaces.contains(where: { $0.id == ws.id })
                }
                if let newMac = newMacs.first {
                    HapticService.shared.playLinkSuccess()
                    self.error = nil
                    // Brief notification that a Mac just linked
                    print("[Stash] New Mac linked: \(newMac.displayName)")
                }
            }

            self.workspaces = workspaces
            await client.updateLanEndpoints(from: workspaces)

            // If selected workspace no longer exists, reset to All
            if let selected = selectedWorkspaceId,
               !workspaces.contains(where: { $0.id == selected }) {
                self.selectedWorkspaceId = nil
            }

            // Check LAN reachability for each workspace (in parallel, non-blocking)
            Task {
                var reachability: [String: Bool] = [:]
                for ws in workspaces {
                    if let ip = ws.lanIP, let port = ws.lanPort {
                        reachability[ws.id] = await client.checkLanReachable(ip: ip, port: port)
                    }
                }
                await MainActor.run { self.lanReachable = reachability }
            }
        }

        // Now fetch projects using local-first routing
        do {
            let projects = try await client.getProjectsLocalFirst(sourceDeviceId: selectedWorkspaceId)
            self.projects = projects
            self.error = nil
            self.lastSyncTime = Date()
            self.lastSyncPath = await client.lastFetchPath
            cacheProjects()
            syncProjectsToWidget()
        } catch APIError.unauthorized {
            disconnect()
            return
        } catch {
            self.error = error.localizedDescription
            print("[Stash] Projects refresh failed: \(error)")
        }

        // Update linked device count (non-fatal if it fails)
        if let devices = try? await devicesResult {
            self.linkedDeviceCount = devices.count
        }

        // Re-register our device key on each refresh to ensure it exists.
        // If someone unlinked this watch from the desktop, this re-registers it.
        await ensureDeviceKeyRegistered()
    }

    /// Cycle to the next workspace (All → first → second → ... → All)
    func cycleWorkspace() {
        guard !workspaces.isEmpty else { return }
        if selectedWorkspaceId == nil {
            selectedWorkspaceId = workspaces.first?.id
        } else {
            let currentIdx = workspaces.firstIndex(where: { $0.id == selectedWorkspaceId }) ?? -1
            let nextIdx = currentIdx + 1
            if nextIdx >= workspaces.count {
                selectedWorkspaceId = nil  // back to All
            } else {
                selectedWorkspaceId = workspaces[nextIdx].id
            }
        }
        HapticService.shared.play(.confirm)
    }

    // MARK: - Unlink Workspace

    func unlinkWorkspace(deviceId: String) async {
        guard let client = apiClient else { return }
        do {
            try await client.deleteDeviceKey(deviceId: deviceId)
            workspaces.removeAll { $0.id == deviceId }
            projects.removeAll { $0.sourceDeviceId == deviceId }
            if selectedWorkspaceId == deviceId { selectedWorkspaceId = nil }
            HapticService.shared.play(.success)
            syncProjectsToWidget()
        } catch {
            print("[Stash] Failed to unlink workspace: \(error)")
            HapticService.shared.play(.failure)
            self.error = error.localizedDescription
        }
    }

    // MARK: - Switch Profile

    /// Request a profile switch and poll until the Mac daemon confirms it.
    /// Returns true on confirmed switch, false on timeout or error.
    func switchProfile(projectId: String, profile: String) async -> Bool {
        guard let client = apiClient else { return false }

        // Step 1: ask the relay to queue the switch action
        do {
            _ = try await client.switchProfile(projectId: projectId, profile: profile)
        } catch {
            print("[Stash] switchProfile request failed: \(error)")
            HapticService.shared.play(.failure)
            self.error = error.localizedDescription
            return false
        }

        // Step 2: poll /projects until the active profile reflects the change.
        // Daemon polls /pending every 10s; give it up to 20s to execute.
        let startTime = Date()
        let timeout: TimeInterval = 20

        while Date().timeIntervalSince(startTime) < timeout {
            try? await Task.sleep(for: .milliseconds(800))
            await refreshProjects()
            if let updated = projects.first(where: { $0.id == projectId }),
               updated.activeProfile == profile {
                HapticService.shared.play(.success)
                return true
            }
        }

        // Timed out — daemon didn't pick up the action
        print("[Stash] switchProfile timeout — daemon didn't confirm")
        HapticService.shared.play(.failure)
        self.error = "Switch timed out — is your Mac online?"
        return false
    }

    // MARK: - Variables

    func getVariables(projectId: String) async -> [EnvVariable] {
        guard let client = apiClient else { return [] }

        do {
            return try await client.getVariables(projectId: projectId)
        } catch {
            self.error = error.localizedDescription
            return []
        }
    }

    func getVariables(projectId: String, profile: String) async -> [EnvVariable] {
        guard let client = apiClient else { return [] }

        do {
            return try await client.getVariables(projectId: projectId, profile: profile)
        } catch {
            self.error = error.localizedDescription
            return []
        }
    }

    // MARK: - Profiles

    func getProfiles(projectId: String) async -> [Profile] {
        guard let client = apiClient else { return [] }

        do {
            return try await client.getProfiles(projectId: projectId)
        } catch {
            self.error = error.localizedDescription
            return []
        }
    }

    // MARK: - Device Linking

    func generateLinkCode() async -> LinkCodeResponse? {
        print("[Stash] generateLinkCode: start")
        guard let client = apiClient else {
            print("[Stash] generateLinkCode: no apiClient")
            self.error = "Not signed in"
            return nil
        }

        do {
            print("[Stash] generateLinkCode: calling API")
            let response = try await client.generateLinkCode()
            print("[Stash] generateLinkCode: got code=\(response.code) expires=\(response.expiresIn)")
            self.error = nil
            HapticService.shared.play(.success)
            return response
        } catch {
            print("[Stash] generateLinkCode: ERROR \(error)")
            self.error = error.localizedDescription
            HapticService.shared.play(.failure)
            return nil
        }
    }

    /// Fetch just the linked device count without touching projects state.
    /// Used by the LinkCodeSheet to detect when a new device (Mac) joins.
    func fetchDeviceCount() async -> Int? {
        guard let client = apiClient else { return nil }
        do {
            let response = try await client.getLinkedDevices()
            return response.count
        } catch {
            return nil
        }
    }

    // MARK: - Account

    func deleteAccount() async {
        guard let client = apiClient else { return }
        do {
            try await client.deleteAccount()
            disconnect()
            HapticService.shared.play(.success)
        } catch {
            self.error = error.localizedDescription
            HapticService.shared.play(.failure)
        }
    }

    // MARK: - Widget Sync

    private func syncProjectsToWidget() {
        guard let defaults = UserDefaults(suiteName: "group.com.mattssoftware.stash.watchkitapp") else {
            print("[Stash] Widget sync FAILED: could not open shared UserDefaults")
            return
        }

        let total = projects.count
        let healthy = projects.filter { $0.health?.isHealthy ?? true }.count
        let withIssues = total - healthy

        defaults.set(total, forKey: "widget_total_projects")
        defaults.set(healthy, forKey: "widget_healthy_projects")
        defaults.set(withIssues, forKey: "widget_issues_projects")

        // Store first project info for the active profile widget
        if let first = projects.first {
            defaults.set(first.name, forKey: "widget_first_project_name")
            defaults.set(first.activeProfile, forKey: "widget_first_active_profile")
        }

        // Store health summary
        let totalStale = projects.compactMap { $0.health?.staleCount }.reduce(0, +)
        let totalExpiring = projects.compactMap { $0.health?.expiringCount }.reduce(0, +)
        let totalExposed = projects.compactMap { $0.health?.exposedCount }.reduce(0, +)
        defaults.set(totalStale, forKey: "widget_total_stale")
        defaults.set(totalExpiring, forKey: "widget_total_expiring")
        defaults.set(totalExposed, forKey: "widget_total_exposed")

        // Full project JSON for widgets (id, name, activeProfile, health, framework)
        let widgetProjects = projects.map { p in
            WidgetProject(
                id: p.id, name: p.name, activeProfile: p.activeProfile,
                framework: p.framework,
                staleCount: p.health?.staleCount ?? 0,
                expiringCount: p.health?.expiringCount ?? 0,
                exposedCount: p.health?.exposedCount ?? 0
            )
        }
        if let jsonData = try? JSONEncoder().encode(widgetProjects) {
            defaults.set(jsonData, forKey: "widget_projects_json")
        }

        // Workspace label & totals
        defaults.set(selectedWorkspaceLabel, forKey: "widget_workspace_label")
        defaults.set(totalStale + totalExpiring + totalExposed, forKey: "widget_total_health_issues")

        defaults.set(Date().timeIntervalSince1970, forKey: "widget_last_updated")
        defaults.synchronize()
        WidgetCenter.shared.reloadAllTimelines()
        print("[Stash] Widget sync: \(total) projects, \(healthy) healthy")
    }
}

/// Lightweight project data shared with widgets via UserDefaults
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
