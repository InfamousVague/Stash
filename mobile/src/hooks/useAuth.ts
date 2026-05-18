import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { api } from '../services/api';
import { generateKeypair } from '../services/crypto';

interface AuthState {
  isReady: boolean;
  isAuthenticated: boolean;
  signInWithApple: (identityToken: string, userIdentifier: string, email?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState>({
  isReady: false,
  isAuthenticated: false,
  signInWithApple: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthProvider(): AuthState {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    api.initialize().then((configured) => {
      setIsAuthenticated(configured);
      setIsReady(true);
    });
  }, []);

  const signInWithApple = useCallback(
    async (identityToken: string, userIdentifier: string, email?: string) => {
      await api.signInWithApple(identityToken, userIdentifier, email);

      // Generate X25519 keypair for E2E encryption and register with relay
      const existingKey = await api.getPrivateKey();
      if (!existingKey) {
        const { privateKey, publicKey } = generateKeypair();
        // Use Apple user identifier as device ID (deterministic per account)
        const deviceId = `ios-${userIdentifier.substring(0, 12)}`;
        await api.setKeypair(privateKey, publicKey);
        await api.setDeviceId(deviceId);
        await api.uploadDeviceKey(deviceId, publicKey, 'ios', 'iPhone');
      }

      setIsAuthenticated(true);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await api.signOut();
    setIsAuthenticated(false);
  }, []);

  return { isReady, isAuthenticated, signInWithApple, signOut };
}
