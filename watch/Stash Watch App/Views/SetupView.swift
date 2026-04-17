import SwiftUI
import AuthenticationServices

struct SetupView: View {
    @EnvironmentObject var appState: AppState
    @State private var isSigningIn = false
    @State private var errorMessage: String?
    @State private var showLogo = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Animated logo
                    ZStack {
                        // Glow
                        Circle()
                            .fill(.stashGreen.opacity(0.15))
                            .frame(width: 70, height: 70)
                            .blur(radius: 10)

                        Image(systemName: "lock.shield.fill")
                            .font(.system(size: 40))
                            .foregroundStyle(.stashGreen)
                            .shadow(color: .stashGreen.opacity(0.4), radius: 8)
                            .symbolEffect(.bounce, value: showLogo)
                    }
                    .padding(.top, 8)

                    Text("View and switch your .env profiles, right from your wrist.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    if isSigningIn {
                        ProgressView()
                            .tint(.stashGreen)
                            .padding()
                    } else {
                        SignInWithAppleButton(.signIn) { request in
                            request.requestedScopes = [.email]
                        } onCompletion: { result in
                            handleSignIn(result)
                        }
                        .signInWithAppleButtonStyle(.white)
                        .frame(height: 45)
                        .cornerRadius(10)
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption2)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding()
            }
            .navigationTitle("Stash")
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    showLogo = true
                }
            }
        }
    }

    private func handleSignIn(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let identityToken = credential.identityToken,
                  let tokenString = String(data: identityToken, encoding: .utf8) else {
                errorMessage = "Could not read Apple ID credentials."
                return
            }

            isSigningIn = true
            errorMessage = nil

            Task {
                await appState.signInWithApple(
                    identityToken: tokenString,
                    userIdentifier: credential.user,
                    email: credential.email
                )
                if !appState.isConfigured {
                    errorMessage = "Sign in failed. Please try again."
                    HapticService.shared.play(.failure)
                }
                isSigningIn = false
            }

        case .failure(let error):
            if (error as NSError).code == ASAuthorizationError.canceled.rawValue {
                return
            }
            errorMessage = "Sign in failed."
        }
    }
}

// MARK: - Stash Green Color Extension

extension Color {
    static let stashGreen = Color(red: 52/255, green: 211/255, blue: 153/255) // #34D399
}

extension ShapeStyle where Self == Color {
    static var stashGreen: Color { .stashGreen }
}
