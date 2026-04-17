import SwiftUI
import CryptoKit

struct VariableListView: View {
    let projectId: String
    let profileName: String

    @EnvironmentObject var appState: AppState
    @State private var variables: [EnvVariable] = []
    @State private var decryptedValues: [String: String] = [:]  // key → plaintext
    @State private var isLoading = true
    @State private var revealedKeys: Set<String> = []
    @State private var revealTimers: [String: Timer] = [:]
    @State private var revealStartTimes: [String: Date] = [:]

    var body: some View {
        Group {
            if isLoading {
                VStack {
                    ProgressView()
                        .tint(.stashGreen)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if variables.isEmpty {
                EmptyStateView(
                    icon: "key",
                    title: "No Variables",
                    message: "This profile has no variables."
                )
            } else {
                List {
                    ForEach(variables) { variable in
                        VariableRow(
                            variable: variable,
                            isRevealed: revealedKeys.contains(variable.key),
                            decryptedValue: decryptedValues[variable.key],
                            revealedAt: revealStartTimes[variable.key],
                            onTap: {
                                toggleReveal(for: variable)
                            }
                        )
                    }
                }
            }
        }
        .navigationTitle(profileName)
        .task {
            await loadVariables()
        }
        .onDisappear {
            revealTimers.values.forEach { $0.invalidate() }
            revealTimers.removeAll()
            // Wipe decrypted values from memory when leaving the screen
            decryptedValues.removeAll()
        }
    }

    private func loadVariables() async {
        isLoading = true
        defer { isLoading = false }
        variables = await appState.getVariables(projectId: projectId, profile: profileName)
    }

    private func toggleReveal(for variable: EnvVariable) {
        let key = variable.key
        if revealedKeys.contains(key) {
            // Hide immediately
            revealedKeys.remove(key)
            decryptedValues.removeValue(forKey: key)
            revealTimers[key]?.invalidate()
            revealTimers.removeValue(forKey: key)
            revealStartTimes.removeValue(forKey: key)
            return
        }

        // Decrypt the ciphertext for THIS device
        guard let deviceId = KeychainService.shared.getDeviceId(),
              let ciphertext = variable.ciphertext(for: deviceId),
              let privateKeyB64 = KeychainService.shared.getPrivateKey(),
              let privateKey = CryptoService.loadPrivateKey(from: privateKeyB64)
        else {
            print("[Stash] reveal: missing keys for decryption")
            HapticService.shared.play(.failure)
            return
        }

        do {
            let plaintext = try CryptoService.decrypt(ciphertext, with: privateKey)
            decryptedValues[key] = plaintext
            revealedKeys.insert(key)
            revealStartTimes[key] = Date()
            HapticService.shared.play(.confirm)

            let timer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: false) { _ in
                DispatchQueue.main.async {
                    withAnimation(.easeOut(duration: 0.3)) {
                        revealedKeys.remove(key)
                        decryptedValues.removeValue(forKey: key)
                    }
                    revealTimers.removeValue(forKey: key)
                    revealStartTimes.removeValue(forKey: key)
                }
            }
            revealTimers[key] = timer
        } catch {
            print("[Stash] decrypt failed: \(error)")
            HapticService.shared.play(.failure)
        }
    }
}

// MARK: - Variable Row

struct VariableRow: View {
    let variable: EnvVariable
    let isRevealed: Bool
    let decryptedValue: String?
    let revealedAt: Date?
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 4) {
                Text(variable.key)
                    .font(.system(.caption, design: .monospaced))
                    .fontWeight(.bold)
                    .foregroundStyle(.stashGreen)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                if variable.isVaultLocked {
                    HStack(spacing: 4) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 10))
                        Text("Vault locked")
                            .font(.system(size: 11))
                    }
                    .foregroundStyle(.orange)
                } else if isRevealed, let value = decryptedValue {
                    Text(value)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.primary)
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true)
                        .transition(.opacity)

                    if let revealedAt {
                        CountdownBar(startedAt: revealedAt, duration: 30)
                    }
                } else {
                    HStack(spacing: 2) {
                        Text(String(repeating: "\u{2022}", count: 12))
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Image(systemName: "eye")
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.vertical, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        .disabled(variable.isVaultLocked)
        .animation(.easeInOut(duration: 0.2), value: isRevealed)
    }
}

// MARK: - Countdown Bar

struct CountdownBar: View {
    let startedAt: Date
    let duration: TimeInterval
    @State private var remaining: TimeInterval = 30

    var body: some View {
        GeometryReader { geo in
            Capsule()
                .fill(.stashGreen.opacity(0.3))
                .frame(height: 3)
                .overlay(alignment: .leading) {
                    Capsule()
                        .fill(.stashGreen)
                        .frame(width: geo.size.width * max(0, remaining / duration), height: 3)
                }
        }
        .frame(height: 3)
        .task {
            while !Task.isCancelled && remaining > 0 {
                try? await Task.sleep(for: .milliseconds(500))
                remaining = max(0, duration - Date().timeIntervalSince(startedAt))
            }
        }
    }
}
