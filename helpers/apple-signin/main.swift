import Cocoa
import AuthenticationServices

// Minimal Swift helper that presents the native Sign in with Apple sheet
// and prints the identity token as JSON to stdout.
//
// Usage: invoked as a subprocess by the Stash Tauri app.
// Success output: {"identity_token": "...", "user_identifier": "...", "email": "..."}
// Error output:   {"error": "message"}
// Exit code: 0 on success, 1 on failure/cancel.

class AppleSignInDelegate: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    var window: NSWindow!
    var exitCode: Int32 = 1

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return window
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            printError("Unexpected credential type")
            finish()
            return
        }
        guard let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            printError("No identity token in credential")
            finish()
            return
        }

        let userIdentifier = credential.user
        let email = credential.email ?? ""

        let payload: [String: String] = [
            "identity_token": identityToken,
            "user_identifier": userIdentifier,
            "email": email
        ]

        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let json = String(data: data, encoding: .utf8) {
            FileHandle.standardOutput.write(json.data(using: .utf8) ?? Data())
            FileHandle.standardOutput.write("\n".data(using: .utf8) ?? Data())
            exitCode = 0
        } else {
            printError("Failed to encode response")
        }
        finish()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        printError(error.localizedDescription)
        finish()
    }

    private func printError(_ message: String) {
        let payload: [String: String] = ["error": message]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let json = String(data: data, encoding: .utf8) {
            FileHandle.standardError.write(json.data(using: .utf8) ?? Data())
            FileHandle.standardError.write("\n".data(using: .utf8) ?? Data())
        }
    }

    private func finish() {
        DispatchQueue.main.async {
            NSApp.stop(nil)
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let window = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: 1, height: 1),
    styleMask: [.borderless],
    backing: .buffered,
    defer: false
)
window.level = .floating
window.orderFrontRegardless()

let delegate = AppleSignInDelegate()
delegate.window = window

let provider = ASAuthorizationAppleIDProvider()
let request = provider.createRequest()
request.requestedScopes = [.email]

let controller = ASAuthorizationController(authorizationRequests: [request])
controller.delegate = delegate
controller.presentationContextProvider = delegate

// Start the request on the next main-loop tick so the window is ready.
DispatchQueue.main.async {
    NSApp.activate(ignoringOtherApps: true)
    controller.performRequests()
}

app.run()
exit(delegate.exitCode)
