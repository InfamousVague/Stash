import React, { useState, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import {
  useTheme,
  VStack,
  HStack,
  Text,
  Spinner,
  Icon,
  icons,
  Card,
  Badge,
  Separator,
  Indicator,
  Button,
} from '@mattssoftware/base-rn';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useQuery } from '../hooks/useApi';
import type { Workspace } from '../types/models';

const ACCENT = '#34D399';

export function SettingsScreen() {
  const { colors, spacing } = useTheme();
  const { signOut } = useAuth();

  // Relay health
  const healthQuery = useQuery(() => api.healthCheck(), []);
  const isRelayOnline = healthQuery.data?.status === 'ok';

  // Linked devices
  const devicesQuery = useQuery(() => api.getLinkedDevices(), []);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await signOut();
        },
      },
    ]);
  }, [signOut]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Are you absolutely sure?', 'All projects, variables, and keys will be deleted.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete Forever',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await api.deleteAccount();
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch (e) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  }
                },
              },
            ]);
          },
        },
      ],
    );
  }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}>
      <VStack gap={4} style={{ padding: spacing[4] }}>
        {/* Relay Status */}
        <VStack gap={2}>
          <Text variant="caption" color={colors.textMuted} style={{ paddingLeft: spacing[1] }}>
            Relay
          </Text>
          <Card>
            <HStack gap={3} align="center" justify="between">
              <HStack gap={2} align="center">
                <Indicator color={isRelayOnline ? ACCENT : colors.error} />
                <Text variant="body">{isRelayOnline ? 'Connected' : 'Offline'}</Text>
              </HStack>
              {healthQuery.data?.version && (
                <Text variant="caption" color={colors.textMuted}>
                  v{healthQuery.data.version}
                </Text>
              )}
            </HStack>
          </Card>
        </VStack>

        {/* Linked Devices */}
        <VStack gap={2}>
          <Text variant="caption" color={colors.textMuted} style={{ paddingLeft: spacing[1] }}>
            Linked Devices
          </Text>
          <Card>
            {devicesQuery.loading ? (
              <Spinner size="sm" />
            ) : devicesQuery.error ? (
              <Text variant="caption" color={colors.error}>
                {devicesQuery.error}
              </Text>
            ) : (
              <VStack gap={0}>
                {(devicesQuery.data ?? []).map((device, idx) => (
                  <React.Fragment key={device.device_id}>
                    {idx > 0 && <Separator />}
                    <DeviceRow device={device} />
                  </React.Fragment>
                ))}
                {(devicesQuery.data ?? []).length === 0 && (
                  <Text variant="caption" color={colors.textMuted}>
                    No devices linked
                  </Text>
                )}
              </VStack>
            )}
          </Card>
        </VStack>

        {/* Actions */}
        <VStack gap={2}>
          <Text variant="caption" color={colors.textMuted} style={{ paddingLeft: spacing[1] }}>
            Account
          </Text>
          <Card>
            <VStack gap={0}>
              <TouchableOpacity onPress={handleSignOut} style={{ paddingVertical: spacing[3] }}>
                <HStack gap={2} align="center">
                  <Icon svg={icons.logOut} size={18} color={colors.text} />
                  <Text variant="body">Sign Out</Text>
                </HStack>
              </TouchableOpacity>
              <Separator />
              <TouchableOpacity onPress={handleDeleteAccount} style={{ paddingVertical: spacing[3] }}>
                <HStack gap={2} align="center">
                  <Icon svg={icons.trash} size={18} color={colors.error} />
                  <Text variant="body" color={colors.error}>
                    Delete Account
                  </Text>
                </HStack>
              </TouchableOpacity>
            </VStack>
          </Card>
        </VStack>

        {/* Version */}
        <Text variant="caption" color={colors.textMuted} align="center" style={{ marginTop: spacing[4] }}>
          Stash v1.0.0
        </Text>
      </VStack>
    </ScrollView>
  );
}

// ── Device Row ──────────────────────────────────────────────────────────

function DeviceRow({ device }: { device: Workspace }) {
  const { colors, spacing } = useTheme();
  const label = device.label || device.device_type;
  const icon =
    device.device_type === 'mac'
      ? icons.laptop
      : device.device_type === 'ios'
        ? icons.smartphone
        : device.device_type === 'watch'
          ? icons.watch
          : icons.shield;

  return (
    <HStack gap={3} align="center" justify="between" style={{ paddingVertical: spacing[3] }}>
      <HStack gap={2} align="center" style={{ flex: 1 }}>
        <Icon svg={icon} size={18} color={colors.textMuted} />
        <VStack gap={0}>
          <Text variant="body">{label}</Text>
          <Text variant="caption" color={colors.textMuted}>
            {device.device_type}
          </Text>
        </VStack>
      </HStack>
      {device.lan_ip && (
        <Badge variant="default">
          <Text variant="caption" style={{ color: ACCENT }}>
            LAN
          </Text>
        </Badge>
      )}
    </HStack>
  );
}
