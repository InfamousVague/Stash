import React, { useCallback } from 'react';
import { View, FlatList, TouchableOpacity, RefreshControl, Share } from 'react-native';
import {
  useTheme,
  VStack,
  HStack,
  Text,
  Card,
  Badge,
  Icon,
  icons,
  Separator,
  Spinner,
  Button,
} from '@mattssoftware/base-rn';
import * as Clipboard from 'expo-clipboard';
import { api } from '../services/api';
import { useQuery } from '../hooks/useApi';

const ACCENT = '#34D399';
const CYAN = '#06B6D4';

export function PeopleScreen() {
  const { colors, spacing } = useTheme();

  const devicesQuery = useQuery(() => api.getLinkedDevices(), []);
  const publicKeyQuery = useQuery(() => api.getPublicKey(), []);

  const myKey = publicKeyQuery.data;

  const handleCopyKey = useCallback(async () => {
    if (myKey) {
      await Clipboard.setStringAsync(myKey);
    }
  }, [myKey]);

  const handleShareKey = useCallback(async () => {
    if (myKey) {
      await Share.share({
        message: `My Stash public key: ${myKey}`,
      });
    }
  }, [myKey]);

  const devices = devicesQuery.data ?? [];
  // Group by device_type to show who has access
  const people = devices.filter((d) => d.device_type !== 'ios' || d.label);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Your Identity */}
      <View style={{ padding: spacing[4] }}>
        <Card>
          {myKey ? (
            <VStack gap={3}>
              <HStack gap={2} align="center">
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: ACCENT,
                  }}
                />
                <Text variant="caption" color={colors.textMuted}>
                  Your Identity
                </Text>
              </HStack>
              <Text
                variant="caption"
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: colors.textMuted,
                }}
                numberOfLines={1}
              >
                {myKey.slice(0, 32)}...{myKey.slice(-8)}
              </Text>
              <HStack gap={2}>
                <Button variant="secondary" size="sm" onPress={handleCopyKey}>
                  Copy Key
                </Button>
                <Button variant="secondary" size="sm" onPress={handleShareKey}>
                  Share
                </Button>
              </HStack>
            </VStack>
          ) : (
            <VStack gap={3} align="center" style={{ paddingVertical: spacing[4] }}>
              <Icon svg={icons.key} size={32} color={colors.textMuted} />
              <Text variant="body" color={colors.textMuted} align="center">
                No identity key found
              </Text>
              <Text variant="caption" color={colors.textMuted} align="center">
                Generate a keypair from the desktop app to share vaults
              </Text>
            </VStack>
          )}
        </Card>
      </View>

      {/* Linked Devices / People */}
      <View style={{ paddingHorizontal: spacing[4], paddingBottom: spacing[2] }}>
        <HStack gap={2} align="center" justify="between">
          <Text variant="caption" color={colors.textMuted}>
            Linked Devices
          </Text>
          {devices.length > 0 && (
            <Badge variant="default">
              <Text variant="caption">{devices.length}</Text>
            </Badge>
          )}
        </HStack>
      </View>

      {devicesQuery.loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Spinner size="lg" />
        </View>
      ) : devices.length === 0 ? (
        <VStack gap={3} align="center" style={{ flex: 1, justifyContent: 'center' }}>
          <Icon svg={icons.users} size={48} color={colors.textMuted} />
          <Text variant="body" style={{ fontWeight: '600' }} color={colors.textMuted}>
            No people yet
          </Text>
          <Text variant="caption" color={colors.textMuted} align="center" style={{ paddingHorizontal: spacing[8] }}>
            Share your public key with others to collaborate on vaults
          </Text>
        </VStack>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.device_id}
          contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: spacing[8] }}
          refreshControl={
            <RefreshControl
              refreshing={devicesQuery.loading}
              onRefresh={devicesQuery.refetch}
              tintColor={ACCENT}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing[2] }} />}
          renderItem={({ item }) => {
            const deviceIcon =
              item.device_type === 'mac'
                ? icons.laptop
                : item.device_type === 'ios'
                  ? icons.smartphone
                  : item.device_type === 'watch'
                    ? icons.watch
                    : icons.shield;

            return (
              <Card>
                <HStack gap={3} align="center">
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: CYAN + '22',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon svg={deviceIcon} size={20} color={CYAN} />
                  </View>
                  <VStack gap={1} style={{ flex: 1 }}>
                    <Text variant="body" style={{ fontWeight: '600' }}>
                      {item.label || item.device_type}
                    </Text>
                    <Text variant="caption" color={colors.textMuted}>
                      {item.device_type} device
                    </Text>
                  </VStack>
                  {item.lan_ip && (
                    <Badge variant="default" style={{ backgroundColor: ACCENT + '22' }}>
                      <Text variant="caption" style={{ color: ACCENT, fontSize: 11 }}>
                        LAN
                      </Text>
                    </Badge>
                  )}
                </HStack>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
