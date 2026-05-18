import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import {
  useTheme,
  VStack,
  HStack,
  Text,
  Spinner,
  Icon,
  icons,
  Badge,
  Progress,
  Button,
  Separator,
} from '@mattssoftware/base-rn';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { api } from '../services/api';
import { decrypt } from '../services/crypto';
import { useQuery } from '../hooks/useApi';
import type { EnvVariable } from '../types/models';

const ACCENT = '#34D399';
const REVEAL_DURATION = 30; // seconds

// Profile colors matching desktop
const PROFILE_COLORS: Record<string, string> = {
  production: '#ef4444',
  prod: '#ef4444',
  staging: '#f59e0b',
  stage: '#f59e0b',
  development: '#22c55e',
  dev: '#22c55e',
  local: '#3b82f6',
  test: '#8b5cf6',
  default: '#6b7280',
  apple: '#6b7280',
};

function getProfileColor(profile: string): string {
  return PROFILE_COLORS[profile.toLowerCase()] || '#6b7280';
}

interface Props {
  projectId: string;
  profile: string;
  onBack: () => void;
}

interface RevealedVar {
  key: string;
  value: string;
  timer: number;
}

// ── Animated masked dots (matches desktop) ──────────────────────────────

function MaskedDots({ count }: { count: number }) {
  const { colors } = useTheme();
  const dotCount = Math.min(count || 8, 24);
  const anims = useRef(
    Array.from({ length: dotCount }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    anims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: 1,
        delay: i * 15,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', height: 20 }}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.textMuted,
            opacity: anim,
            transform: [
              {
                scale: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

// ── EnvVarRow (matches desktop layout) ──────────────────────────────────

function EnvVarRow({
  variable,
  revealed,
  onReveal,
  onCopy,
}: {
  variable: EnvVariable;
  revealed: RevealedVar | undefined;
  onReveal: (v: EnvVariable) => void;
  onCopy: (value: string) => void;
}) {
  const { colors, spacing } = useTheme();
  const isRevealed = !!revealed;
  const locked = variable.encrypted_for['__locked__'] === 'vault_locked';
  const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

  return (
    <View
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      {/* Key section */}
      <View
        style={{
          paddingHorizontal: spacing[3],
          paddingTop: spacing[3],
          paddingBottom: spacing[2],
        }}
      >
        <HStack gap={2} align="center">
          <Text
            variant="caption"
            style={{
              fontFamily: mono,
              color: ACCENT,
              fontWeight: '600',
              fontSize: 13,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {variable.key}
          </Text>
          {locked && (
            <Badge variant="default" style={{ backgroundColor: '#F59E0B22' }}>
              <Text variant="caption" style={{ color: '#F59E0B', fontSize: 10 }}>
                LOCKED
              </Text>
            </Badge>
          )}
        </HStack>
      </View>

      {/* Value section */}
      <View
        style={{
          paddingHorizontal: spacing[3],
          paddingBottom: spacing[2],
        }}
      >
        <TouchableOpacity
          onPress={() => onReveal(variable)}
          activeOpacity={0.6}
          disabled={locked}
        >
          {isRevealed ? (
            <Text
              variant="body"
              style={{
                fontFamily: mono,
                fontSize: 13,
                lineHeight: 20,
              }}
              selectable
            >
              {revealed.value}
            </Text>
          ) : (
            <MaskedDots count={12} />
          )}
        </TouchableOpacity>
      </View>

      {/* Actions bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingHorizontal: spacing[1],
        }}
      >
        <TouchableOpacity
          onPress={() => onReveal(variable)}
          disabled={locked}
          style={{ padding: spacing[2] }}
        >
          <Icon
            svg={isRevealed ? icons.eyeOff : icons.eye}
            size={16}
            color={isRevealed ? ACCENT : colors.textMuted}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (isRevealed) onCopy(revealed.value);
          }}
          disabled={!isRevealed}
          style={{ padding: spacing[2], opacity: isRevealed ? 1 : 0.3 }}
        >
          <Icon svg={icons.copy} size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {isRevealed && revealed && (
          <HStack gap={2} align="center" style={{ paddingRight: spacing[2] }}>
            <Text variant="caption" color={colors.textMuted} style={{ fontSize: 11 }}>
              {revealed.timer}s
            </Text>
            <View style={{ width: 60 }}>
              <Progress
                value={(revealed.timer / REVEAL_DURATION) * 100}
                size="sm"
                color={revealed.timer <= 5 ? '#EF4444' : ACCENT}
              />
            </View>
          </HStack>
        )}
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────

export function VariablesScreen({ projectId, profile, onBack }: Props) {
  const { colors, spacing } = useTheme();
  const [revealed, setRevealed] = useState<Record<string, RevealedVar>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const intervals = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const { data, loading, error } = useQuery(
    () => api.listVariables(projectId, profile),
    [projectId, profile],
  );

  const profileColor = getProfileColor(profile);

  // Clean up intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(intervals.current).forEach(clearInterval);
    };
  }, []);

  const handleCopy = useCallback(async (value: string) => {
    await Clipboard.setStringAsync(value);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedKey(value);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  const handleReveal = useCallback(
    async (variable: EnvVariable) => {
      // Toggle off if already revealed
      if (revealed[variable.key]) {
        clearInterval(intervals.current[variable.key]);
        delete intervals.current[variable.key];
        setRevealed((prev) => {
          const next = { ...prev };
          delete next[variable.key];
          return next;
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      if (variable.encrypted_for['__locked__'] === 'vault_locked') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      const deviceId = await api.getDeviceId();
      const privateKey = await api.getPrivateKey();
      if (!deviceId || !privateKey) return;

      const ciphertext = variable.encrypted_for[deviceId];
      if (!ciphertext) return;

      try {
        const plaintext = decrypt(ciphertext, privateKey);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        setRevealed((prev) => ({
          ...prev,
          [variable.key]: { key: variable.key, value: plaintext, timer: REVEAL_DURATION },
        }));

        const id = setInterval(() => {
          setRevealed((prev) => {
            const entry = prev[variable.key];
            if (!entry) {
              clearInterval(intervals.current[variable.key]);
              delete intervals.current[variable.key];
              return prev;
            }
            const newTimer = entry.timer - 1;
            if (newTimer <= 0) {
              clearInterval(intervals.current[variable.key]);
              delete intervals.current[variable.key];
              const next = { ...prev };
              delete next[variable.key];
              return next;
            }
            return { ...prev, [variable.key]: { ...entry, timer: newTimer } };
          });
        }, 1000);

        intervals.current[variable.key] = id;
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [revealed],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: spacing[4],
          paddingTop: spacing[2],
          paddingBottom: spacing[3],
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <HStack gap={3} align="center">
          <TouchableOpacity onPress={onBack} hitSlop={8}>
            <Icon svg={icons.chevronLeft} size={24} color={colors.text} />
          </TouchableOpacity>
          <VStack gap={1} style={{ flex: 1 }}>
            <Text variant="subheading">Variables</Text>
            <HStack gap={2} align="center">
              {/* Profile color dot (matches desktop ProfileSwitcher) */}
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: profileColor,
                }}
              />
              <Text variant="caption" style={{ color: profileColor }}>
                {profile === 'default' ? '.env' : `.env.${profile}`}
              </Text>
            </HStack>
          </VStack>
          <Badge variant="default">
            <Text variant="caption">{data?.variables?.length ?? 0}</Text>
          </Badge>
        </HStack>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Spinner size="lg" />
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing[6] }}>
          <Text variant="body" color={colors.error} align="center">
            {error}
          </Text>
        </View>
      ) : (
        <FlatList
          data={data?.variables ?? []}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ padding: spacing[4], gap: spacing[2] }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <EnvVarRow
              variable={item}
              revealed={revealed[item.key]}
              onReveal={handleReveal}
              onCopy={handleCopy}
            />
          )}
          ListEmptyComponent={
            <VStack gap={3} align="center" style={{ paddingTop: spacing[8] }}>
              <Icon svg={icons.key} size={40} color={colors.textMuted} />
              <Text variant="body" color={colors.textMuted}>
                No variables in this profile
              </Text>
            </VStack>
          }
        />
      )}
    </View>
  );
}
