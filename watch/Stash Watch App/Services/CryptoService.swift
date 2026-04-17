import Foundation
import CryptoKit

/// E2E encryption using the same wire format as stash_lib::team (Rust).
///
/// Format (base64-encoded):
///   ephemeral_public_key(32) + nonce(12) + ciphertext+tag
///
/// The shared AES key is derived as:
///   SHA256(X25519(ephemeral_private, recipient_public))
///
/// This matches Stash's existing team-sharing encryption so the Rust daemon
/// can encrypt-for and the watch can decrypt-with matching keys.
enum CryptoService {

    // MARK: - Keypair Management

    /// Generate a new X25519 keypair for this device.
    /// Returns (privateKeyBase64, publicKeyBase64) — both 32 bytes encoded.
    static func generateKeypair() -> (privateKey: String, publicKey: String) {
        let privateKey = Curve25519.KeyAgreement.PrivateKey()
        let publicKey = privateKey.publicKey

        let privateB64 = privateKey.rawRepresentation.base64EncodedString()
        let publicB64 = publicKey.rawRepresentation.base64EncodedString()
        return (privateB64, publicB64)
    }

    /// Load a private key from its base64 representation.
    static func loadPrivateKey(from base64: String) -> Curve25519.KeyAgreement.PrivateKey? {
        guard let data = Data(base64Encoded: base64),
              let key = try? Curve25519.KeyAgreement.PrivateKey(rawRepresentation: data)
        else { return nil }
        return key
    }

    // MARK: - Decryption

    enum DecryptionError: Error, LocalizedError {
        case invalidBase64
        case ciphertextTooShort
        case invalidEphemeralKey
        case invalidNonce
        case invalidTag
        case decryptionFailed

        var errorDescription: String? {
            switch self {
            case .invalidBase64: return "Invalid base64"
            case .ciphertextTooShort: return "Ciphertext too short"
            case .invalidEphemeralKey: return "Invalid ephemeral key"
            case .invalidNonce: return "Invalid nonce"
            case .invalidTag: return "Invalid tag"
            case .decryptionFailed: return "Decryption failed"
            }
        }
    }

    /// Decrypt a value that was encrypted by stash_lib::team::encrypt_for_recipient.
    ///
    /// - Parameters:
    ///   - encryptedBase64: The base64-encoded packed ciphertext.
    ///   - privateKey: Our X25519 private key (this device's key).
    /// - Returns: The plaintext UTF-8 string, or throws on any failure.
    static func decrypt(_ encryptedBase64: String, with privateKey: Curve25519.KeyAgreement.PrivateKey) throws -> String {
        guard let packed = Data(base64Encoded: encryptedBase64) else {
            throw DecryptionError.invalidBase64
        }

        // Minimum: 32 (ephemeral pub) + 12 (nonce) + 16 (GCM tag) = 60 bytes
        guard packed.count >= 60 else {
            throw DecryptionError.ciphertextTooShort
        }

        // Unpack
        let ephemeralPubRaw = packed[0..<32]
        let nonceRaw = packed[32..<44]
        let ciphertextWithTag = packed[44...]

        // Ephemeral public key
        guard let ephemeralPub = try? Curve25519.KeyAgreement.PublicKey(
            rawRepresentation: Data(ephemeralPubRaw)
        ) else {
            throw DecryptionError.invalidEphemeralKey
        }

        // Derive shared secret via ECDH, then SHA256 to get the AES key.
        // This matches team.rs which does:
        //   shared = ephemeral_secret.diffie_hellman(recipient_public)
        //   key = SHA256(shared.as_bytes())
        let sharedSecret: SharedSecret
        do {
            sharedSecret = try privateKey.sharedSecretFromKeyAgreement(with: ephemeralPub)
        } catch {
            throw DecryptionError.decryptionFailed
        }

        // sharedSecret is 32 bytes (X25519 output). SHA256 it to get the symmetric key.
        let symmetricKey = sharedSecret.withUnsafeBytes { rawBuffer -> SymmetricKey in
            let hash = SHA256.hash(data: Data(rawBuffer))
            return SymmetricKey(data: Data(hash))
        }

        // Split ciphertext + GCM tag (last 16 bytes)
        guard ciphertextWithTag.count >= 16 else {
            throw DecryptionError.invalidTag
        }
        let tagStart = ciphertextWithTag.endIndex - 16
        let ciphertext = ciphertextWithTag[..<tagStart]
        let tag = ciphertextWithTag[tagStart...]

        // Nonce
        guard let nonce = try? AES.GCM.Nonce(data: Data(nonceRaw)) else {
            throw DecryptionError.invalidNonce
        }

        // Build sealed box and decrypt
        let sealedBox: AES.GCM.SealedBox
        do {
            sealedBox = try AES.GCM.SealedBox(
                nonce: nonce,
                ciphertext: Data(ciphertext),
                tag: Data(tag)
            )
        } catch {
            throw DecryptionError.decryptionFailed
        }

        let plaintextData: Data
        do {
            plaintextData = try AES.GCM.open(sealedBox, using: symmetricKey)
        } catch {
            throw DecryptionError.decryptionFailed
        }

        guard let plaintext = String(data: plaintextData, encoding: .utf8) else {
            throw DecryptionError.decryptionFailed
        }
        return plaintext
    }
}
