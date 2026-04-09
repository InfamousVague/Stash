import LocalAuthentication
import Foundation

let context = LAContext()
context.localizedCancelTitle = "Cancel"

// Check-only mode
if CommandLine.arguments.contains("--check") {
    var error: NSError?
    // Try biometrics first, fall back to device owner (password)
    if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
        exit(0)
    }
    // Also accept device owner auth (Touch ID or system password)
    if context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) {
        exit(0)
    }
    exit(1)
}

let reason = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "Authenticate with Stash"

// Use deviceOwnerAuthentication which supports Touch ID, Apple Watch, or system password
let policy: LAPolicy = .deviceOwnerAuthentication

var error: NSError?
guard context.canEvaluatePolicy(policy, error: &error) else {
    fputs("Authentication not available: \(error?.localizedDescription ?? "unknown")\n", stderr)
    exit(1)
}

let semaphore = DispatchSemaphore(value: 0)
var success = false
var authError: String?

context.evaluatePolicy(policy, localizedReason: reason) { result, err in
    success = result
    if let err = err {
        authError = err.localizedDescription
    }
    semaphore.signal()
}

semaphore.wait()

if success {
    exit(0)
} else {
    fputs(authError ?? "Authentication failed", stderr)
    fputs("\n", stderr)
    exit(2)
}
