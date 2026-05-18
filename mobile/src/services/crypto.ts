import 'react-native-get-random-values';
import nacl from 'tweetnacl';
import { sha256 } from 'js-sha256';
import { gcm } from '@noble/ciphers/aes';

// Base64 helpers
function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Generate an X25519 keypair for E2E encryption.
 * Returns base64-encoded private and public keys.
 */
export function generateKeypair(): { privateKey: string; publicKey: string } {
  const keyPair = nacl.box.keyPair();
  return {
    privateKey: bytesToB64(keyPair.secretKey),
    publicKey: bytesToB64(keyPair.publicKey),
  };
}

/**
 * Decrypt a value encrypted for this device.
 *
 * Wire format: base64(ephemeral_pub[32] + nonce[12] + ciphertext + gcm_tag[16])
 * Algorithm: X25519 ECDH -> SHA256 -> AES-256-GCM
 */
export function decrypt(encryptedB64: string, privateKeyB64: string): string {
  const packed = b64ToBytes(encryptedB64);
  if (packed.length < 60) throw new Error('Ciphertext too short');

  const ephemeralPub = packed.slice(0, 32);
  const nonce = packed.slice(32, 44);
  const ciphertextWithTag = packed.slice(44);

  // X25519 shared secret
  const privateKey = b64ToBytes(privateKeyB64);
  const sharedSecret = nacl.scalarMult(privateKey, ephemeralPub);

  // SHA256 to derive AES key
  const aesKeyHex = sha256(sharedSecret);
  const aesKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    aesKey[i] = parseInt(aesKeyHex.substring(i * 2, i * 2 + 2), 16);
  }

  // AES-256-GCM decrypt
  const aes = gcm(aesKey, nonce);
  const plaintext = aes.decrypt(ciphertextWithTag);
  return new TextDecoder().decode(plaintext);
}
