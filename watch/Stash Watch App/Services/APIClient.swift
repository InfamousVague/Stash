import Foundation

actor APIClient {
    private let baseURL: String
    private let token: String
    private let session: URLSession
    private let decoder: JSONDecoder

    // LAN endpoints, keyed by device_id
    private var lanEndpoints: [String: (ip: String, port: Int)] = [:]

    /// Which path the last project fetch used: "lan" or "relay"
    private(set) var lastFetchPath: String = "relay"

    init(baseURL: String, token: String) {
        self.baseURL = baseURL.hasSuffix("/") ? String(baseURL.dropLast()) : baseURL
        self.token = token
        self.session = URLSession(configuration: .default)

        // Using explicit CodingKeys in models instead of convertFromSnakeCase
        // because the two don't play well together when mixed.
        self.decoder = JSONDecoder()
    }

    // MARK: - LAN Endpoints

    func updateLanEndpoints(from workspaces: [Workspace]) {
        var endpoints: [String: (ip: String, port: Int)] = [:]
        for ws in workspaces {
            if let ip = ws.lanIP, let port = ws.lanPort, !ip.isEmpty {
                endpoints[ws.id] = (ip: ip, port: port)
            }
        }
        lanEndpoints = endpoints
    }

    private func getFromLAN<T: Decodable>(_ lanBaseURL: String, path: String) async throws -> T {
        guard let url = URL(string: "\(lanBaseURL)\(path)") else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 2.0  // Short timeout for LAN

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.serverError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return try decoder.decode(T.self, from: data)
    }

    func getProjectsLocalFirst(sourceDeviceId: String?) async throws -> [Project] {
        // If we have a specific workspace and a LAN endpoint for it, try local first
        if let wsId = sourceDeviceId, let endpoint = lanEndpoints[wsId] {
            let lanURL = "http://\(endpoint.ip):\(endpoint.port)"
            do {
                let projects: [Project] = try await getFromLAN(lanURL, path: "/projects")
                lastFetchPath = "lan"
                return projects
            } catch {
                // LAN failed — fall through to relay
                print("[Stash] LAN fetch failed for \(endpoint.ip): \(error.localizedDescription)")
            }
        }
        // Relay fallback
        lastFetchPath = "relay"
        return try await getProjects(sourceDeviceId: sourceDeviceId)
    }

    func checkLanReachable(ip: String, port: Int) async -> Bool {
        guard let url = URL(string: "http://\(ip):\(port)/health") else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1.5
        do {
            let (_, response) = try await session.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    // MARK: - Projects

    func getProjects(sourceDeviceId: String? = nil) async throws -> [Project] {
        var path = "/projects"
        if let id = sourceDeviceId {
            let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
            path += "?source_device_id=\(encoded)"
        }
        return try await get(path)
    }

    // MARK: - Profiles

    func getProfiles(projectId: String) async throws -> [Profile] {
        return try await get("/projects/\(projectId)/profiles")
    }

    // MARK: - Variables

    func getVariables(projectId: String) async throws -> [EnvVariable] {
        let response: VariablesResponse = try await get("/projects/\(projectId)/vars")
        return response.variables
    }

    func getVariables(projectId: String, profile: String) async throws -> [EnvVariable] {
        let encodedProfile = profile.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? profile
        let response: VariablesResponse = try await get("/projects/\(projectId)/vars/\(encodedProfile)")
        return response.variables
    }

    // MARK: - Switch Profile

    func switchProfile(projectId: String, profile: String) async throws -> SwitchStatus {
        let body = SwitchRequest(profile: profile)
        return try await post("/projects/\(projectId)/switch", body: body)
    }

    // MARK: - Device Linking

    func generateLinkCode() async throws -> LinkCodeResponse {
        return try await post("/auth/link-code", body: EmptyBody())
    }

    func getLinkedDevices() async throws -> LinkedDevicesResponse {
        return try await get("/auth/devices")
    }

    /// Fetch all workspaces (linked Macs) for this account.
    func getWorkspaces() async throws -> [Workspace] {
        let response: DeviceKeysResponse = try await get("/auth/device-keys")
        // Filter to "mac" device types — these are the workspaces
        return response.devices.filter { $0.deviceType == "mac" }
    }

    // MARK: - Device Key (E2E)

    /// Upload this device's X25519 public key so other devices can
    /// encrypt values for it.
    func uploadDeviceKey(deviceId: String, publicKey: String, deviceType: String, label: String?) async throws {
        let body = UpsertDeviceKeyRequest(
            deviceId: deviceId,
            publicKey: publicKey,
            deviceType: deviceType,
            label: label
        )
        let (_, response) = try await request("POST", path: "/auth/device-key", body: try JSONEncoder().encode(body))
        try validateResponse(response)
    }

    // MARK: - Unlink Device

    func deleteDeviceKey(deviceId: String) async throws {
        let encodedId = deviceId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? deviceId
        let (_, response) = try await request("DELETE", path: "/auth/device-key/\(encodedId)")
        try validateResponse(response)
    }

    // MARK: - Account

    func deleteAccount() async throws {
        let (_, response) = try await request("DELETE", path: "/auth/user")
        try validateResponse(response)
    }

    // MARK: - Private

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let (data, response) = try await request("GET", path: path)
        try validateResponse(response)
        return try decoder.decode(T.self, from: data)
    }

    private func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        // Using explicit CodingKeys in models instead of convertToSnakeCase.
        let encoder = JSONEncoder()
        let bodyData = try encoder.encode(body)
        let (data, response) = try await request("POST", path: path, body: bodyData)
        try validateResponse(response)
        return try decoder.decode(T.self, from: data)
    }

    private func request(_ method: String, path: String, body: Data? = nil) async throws -> (Data, URLResponse) {
        guard let url = URL(string: "\(baseURL)\(path)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        if let body = body {
            request.httpBody = body
        }

        return try await session.data(for: request)
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        switch http.statusCode {
        case 200...299: return
        case 401: throw APIError.unauthorized
        case 404: throw APIError.notFound
        default: throw APIError.serverError(http.statusCode)
        }
    }
}

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case notFound
    case serverError(Int)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid relay URL"
        case .invalidResponse: return "Invalid response from relay"
        case .unauthorized: return "Invalid or expired token"
        case .notFound: return "Resource not found"
        case .serverError(let code): return "Server error (\(code))"
        }
    }
}
