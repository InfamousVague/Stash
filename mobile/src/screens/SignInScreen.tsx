import React, { useState } from 'react';
import { View, Image, useColorScheme, TextInput, Pressable } from 'react-native';
import { useTheme, VStack, Text, Button } from '@mattssoftware/base-rn';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../hooks/useAuth';

const stashLogo = require('../../assets/icon.png');

const ACCENT = '#34D399';

export function SignInScreen() {
  const { colors, spacing } = useTheme();
  const colorScheme = useColorScheme();
  const { signInWithApple } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDevInput, setShowDevInput] = useState(false);
  const [devToken, setDevToken] = useState('');

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[Auth] Starting Apple Sign-In...');

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });

      console.log('[Auth] Got credential, user:', credential.user?.substring(0, 12));
      console.log('[Auth] Has identity token:', !!credential.identityToken);

      if (!credential.identityToken) {
        setError('Could not get identity token.');
        return;
      }

      console.log('[Auth] Calling relay /auth/apple...');
      await signInWithApple(credential.identityToken, credential.user, credential.email ?? undefined);
      console.log('[Auth] Sign-in complete!');
    } catch (e: any) {
      console.error('[Auth] Error:', e.code, e.message);
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        setError('Sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Dev-only: manually paste a relay token to bypass Apple Sign-In in simulator
  const handleDevTokenSignIn = async () => {
    if (!devToken.trim()) return;
    try {
      setLoading(true);
      setError(null);
      await SecureStore.setItemAsync('stash_token', devToken.trim());
      // Force a reload by setting auth state — we need to re-initialize
      const { api } = require('../services/api');
      await api.initialize();
      // Verify the token works
      await api.healthCheck();
      // Trigger re-render by navigating — simplest: just reload
      const { Updates } = require('expo-updates').default ?? {};
      // Can't use Updates in dev, so just tell user to reload
      setError('Token saved! Press Cmd+R to reload the app.');
    } catch (e: any) {
      setError('Token invalid: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing[8] }}>
      <VStack gap={6} align="center">
        <Pressable onLongPress={() => __DEV__ && setShowDevInput(true)}>
          <Image source={stashLogo} style={{ width: 96, height: 96, borderRadius: 22 }} />
        </Pressable>
        <Text variant="display" align="center">Stash</Text>
        <View style={{ height: spacing[8] }} />

        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={
            colorScheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={12}
          style={{ width: '100%', height: 50 }}
          onPress={handleAppleSignIn}
        />

        {__DEV__ && showDevInput && (
          <VStack gap={3} style={{ width: '100%' }}>
            <Text variant="caption" color={colors.textMuted} align="center">
              Dev: Paste relay token from desktop app
            </Text>
            <TextInput
              value={devToken}
              onChangeText={setDevToken}
              placeholder="Paste token here..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                backgroundColor: colors.bgMuted,
                color: colors.text,
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                fontFamily: 'monospace',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
            <Button variant="primary" onPress={handleDevTokenSignIn} loading={loading}>
              Use Token
            </Button>
          </VStack>
        )}

        {error && (
          <Text variant="caption" color={colors.error} align="center">
            {error}
          </Text>
        )}
      </VStack>
    </View>
  );
}
