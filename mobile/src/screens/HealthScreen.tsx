import React, { useState, useMemo, useCallback } from 'react';
import { View, FlatList, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import {
  useTheme,
  VStack,
  HStack,
  Text,
  Card,
  Badge,
  Icon,
  icons,
  Spinner,
} from '@mattssoftware/base-rn';
import { api } from '../services/api';
import { useQuery } from '../hooks/useApi';
import type { Project } from '../types/models';

const ACCENT = '#34D399';

type IssueType = 'stale' | 'duplicate' | 'overlap' | 'format' | 'expiring';

interface HealthIssue {
  type: IssueType;
  severity: 'critical' | 'warning' | 'info';
  projectName: string;
  projectId: string;
  key: string;
  details: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444',
  warning: '#F59E0B',
  info: '#6B7280',
};

const TYPE_LABELS: Record<string, string> = {
  stale: 'Stale',
  duplicate: 'Duplicate',
  overlap: 'Overlap',
  format: 'Format',
  expiring: 'Expiring',
};

export function HealthScreen() {
  const { colors, spacing } = useTheme();
  const [filter, setFilter] = useState<'all' | IssueType>('all');

  const projectsQuery = useQuery(() => api.listProjects(), []);

  // Derive health issues from project data
  const issues = useMemo(() => {
    const projects = projectsQuery.data ?? [];
    const result: HealthIssue[] = [];

    for (const project of projects) {
      if (!project.health) continue;

      if (project.health.stale_count > 0) {
        result.push({
          type: 'stale',
          severity: 'warning',
          projectName: project.name,
          projectId: project.id,
          key: `${project.health.stale_count} variable${project.health.stale_count > 1 ? 's' : ''}`,
          details: 'Not updated recently',
        });
      }
      if (project.health.expiring_count > 0) {
        result.push({
          type: 'expiring',
          severity: 'warning',
          projectName: project.name,
          projectId: project.id,
          key: `${project.health.expiring_count} variable${project.health.expiring_count > 1 ? 's' : ''}`,
          details: 'Expiring soon',
        });
      }
      if (project.health.exposed_count > 0) {
        result.push({
          type: 'format',
          severity: 'critical',
          projectName: project.name,
          projectId: project.id,
          key: `${project.health.exposed_count} variable${project.health.exposed_count > 1 ? 's' : ''}`,
          details: 'Potentially exposed in git',
        });
      }
    }

    return result;
  }, [projectsQuery.data]);

  const filtered = useMemo(() => {
    if (filter === 'all') return issues;
    return issues.filter((i) => i.type === filter);
  }, [issues, filter]);

  const summary = useMemo(() => {
    let critical = 0, warning = 0, info = 0;
    for (const issue of issues) {
      if (issue.severity === 'critical') critical++;
      else if (issue.severity === 'warning') warning++;
      else info++;
    }
    return { critical, warning, info, total: issues.length };
  }, [issues]);

  const filters: { value: 'all' | IssueType; label: string }[] = [
    { value: 'all', label: `All (${summary.total})` },
    { value: 'stale', label: 'Stale' },
    { value: 'duplicate', label: 'Duplicates' },
    { value: 'expiring', label: 'Expiring' },
    { value: 'format', label: 'Exposed' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Summary cards */}
      <HStack gap={3} style={{ padding: spacing[4], paddingBottom: spacing[2] }}>
        <View
          style={{
            flex: 1,
            backgroundColor: summary.critical > 0 ? '#EF444422' : colors.bgMuted,
            borderRadius: 12,
            padding: spacing[3],
            alignItems: 'center',
          }}
        >
          <Text variant="display" style={{ color: summary.critical > 0 ? '#EF4444' : colors.textMuted, fontSize: 28 }}>
            {summary.critical}
          </Text>
          <Text variant="caption" color={colors.textMuted}>Critical</Text>
        </View>
        <View
          style={{
            flex: 1,
            backgroundColor: summary.warning > 0 ? '#F59E0B22' : colors.bgMuted,
            borderRadius: 12,
            padding: spacing[3],
            alignItems: 'center',
          }}
        >
          <Text variant="display" style={{ color: summary.warning > 0 ? '#F59E0B' : colors.textMuted, fontSize: 28 }}>
            {summary.warning}
          </Text>
          <Text variant="caption" color={colors.textMuted}>Warning</Text>
        </View>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.bgMuted,
            borderRadius: 12,
            padding: spacing[3],
            alignItems: 'center',
          }}
        >
          <Text variant="display" style={{ color: colors.textMuted, fontSize: 28 }}>
            {summary.info}
          </Text>
          <Text variant="caption" color={colors.textMuted}>Info</Text>
        </View>
      </HStack>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: spacing[3], gap: 8 }}
      >
        {filters.map((f) => (
          <TouchableOpacity
            key={f.value}
            onPress={() => setFilter(f.value)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: filter === f.value ? ACCENT : colors.bgMuted,
            }}
          >
            <Text
              variant="caption"
              style={{ color: filter === f.value ? '#fff' : colors.text, fontWeight: '600' }}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Issues list */}
      {projectsQuery.loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Spinner size="lg" />
        </View>
      ) : filtered.length === 0 ? (
        <VStack gap={3} align="center" style={{ flex: 1, justifyContent: 'center' }}>
          <Icon svg={icons.check} size={48} color={ACCENT} />
          <Text variant="body" style={{ fontWeight: '600' }}>
            {summary.total === 0 ? 'All Healthy' : 'No Matching Issues'}
          </Text>
          <Text variant="caption" color={colors.textMuted} align="center">
            {summary.total === 0
              ? 'No health issues found across your vaults'
              : 'Try adjusting the filter'}
          </Text>
        </VStack>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: spacing[8] }}
          refreshControl={
            <RefreshControl
              refreshing={projectsQuery.loading}
              onRefresh={projectsQuery.refetch}
              tintColor={ACCENT}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing[2] }} />}
          renderItem={({ item }) => (
            <Card>
              <VStack gap={2}>
                <HStack gap={2} align="center">
                  <Badge
                    variant="default"
                    style={{ backgroundColor: SEVERITY_COLORS[item.severity] + '22' }}
                  >
                    <Text variant="caption" style={{ color: SEVERITY_COLORS[item.severity], fontWeight: '600', fontSize: 11 }}>
                      {item.severity.toUpperCase()}
                    </Text>
                  </Badge>
                  <Badge variant="default" style={{ backgroundColor: ACCENT + '22' }}>
                    <Text variant="caption" style={{ color: ACCENT, fontSize: 11 }}>
                      {TYPE_LABELS[item.type] || item.type}
                    </Text>
                  </Badge>
                </HStack>
                <Text variant="body" style={{ fontWeight: '600' }}>{item.key}</Text>
                <HStack gap={2} align="center" justify="between">
                  <Text variant="caption" color={colors.textMuted}>{item.projectName}</Text>
                  <Text variant="caption" color={colors.textMuted}>{item.details}</Text>
                </HStack>
              </VStack>
            </Card>
          )}
        />
      )}
    </View>
  );
}
