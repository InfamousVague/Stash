import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Platform,
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
  Card,
  Separator,
} from '@mattssoftware/base-rn';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
import { useQuery, useMutation } from '../hooks/useApi';
import { VariablesScreen } from './VariablesScreen';
import type { Project, Workspace, Profile } from '../types/models';

const ACCENT = '#34D399';

// ── Profile colors (matches desktop) ───────────────────────────────────
const PROFILE_COLORS: Record<string, string> = {
  production: '#ef4444', prod: '#ef4444',
  staging: '#f59e0b', stage: '#f59e0b',
  development: '#22c55e', dev: '#22c55e',
  local: '#3b82f6', test: '#8b5cf6',
  default: '#6b7280', apple: '#6b7280',
};
function getProfileColor(name: string): string {
  return PROFILE_COLORS[name.toLowerCase()] || '#6b7280';
}

// ── Framework badge colors ──────────────────────────────────────────────
const frameworkColors: Record<string, string> = {
  next: '#000',
  react: '#61DAFB',
  vue: '#4FC08D',
  nuxt: '#00DC82',
  svelte: '#FF3E00',
  node: '#339933',
  python: '#3776AB',
  ruby: '#CC342D',
  go: '#00ADD8',
  rust: '#DEA584',
};

// ── Main Screen ─────────────────────────────────────────────────────────

export function ProjectsScreen() {
  const { colors, spacing } = useTheme();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showVariables, setShowVariables] = useState(false);

  // Fetch workspaces + projects
  const workspacesQuery = useQuery(() => api.getWorkspaces(), []);
  const projectsQuery = useQuery(() => api.listProjects(), []);

  const refreshing = workspacesQuery.loading || projectsQuery.loading;

  const handleRefresh = useCallback(() => {
    workspacesQuery.refetch();
    projectsQuery.refetch();
  }, []);

  // Group projects by workspace
  const sections = useMemo(() => {
    const workspaces = workspacesQuery.data ?? [];
    const projects = projectsQuery.data ?? [];

    // Build a map of device_id -> workspace
    const wsMap = new Map<string, Workspace>();
    for (const ws of workspaces) wsMap.set(ws.device_id, ws);

    // Group projects by source_device_id
    const grouped = new Map<string, Project[]>();
    for (const p of projects) {
      const list = grouped.get(p.source_device_id) ?? [];
      list.push(p);
      grouped.set(p.source_device_id, list);
    }

    return Array.from(grouped.entries()).map(([deviceId, data]) => {
      const ws = wsMap.get(deviceId);
      return {
        title: ws?.label || ws?.device_type || 'Unknown',
        hasLan: !!ws?.lan_ip,
        data,
      };
    });
  }, [workspacesQuery.data, projectsQuery.data]);

  // ── Variables sub-screen ──────────────────────────────────────────────
  if (showVariables && selectedProject) {
    return (
      <VariablesScreen
        projectId={selectedProject.id}
        profile={selectedProject.active_profile}
        onBack={() => setShowVariables(false)}
      />
    );
  }

  // ── Project detail sub-screen ─────────────────────────────────────────
  if (selectedProject) {
    return (
      <ProjectDetailScreen
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
        onShowVariables={() => setShowVariables(true)}
        onProjectUpdated={handleRefresh}
      />
    );
  }

  // ── Project list ──────────────────────────────────────────────────────
  const error = workspacesQuery.error || projectsQuery.error;

  if (!refreshing && error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing[6] }}>
        <Text variant="body" color={colors.error} align="center">
          {error}
        </Text>
      </View>
    );
  }

  if (!refreshing && sections.length === 0) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ flex: 1, justifyContent: 'center', padding: spacing[6] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} />}
      >
        <VStack gap={3} align="center">
          <Icon svg={icons.folderOpen} size={48} color={colors.textMuted} />
          <Text variant="body" color={colors.textMuted} align="center">
            No vaults yet. Add a vault from the Stash desktop app.
          </Text>
        </VStack>
      </ScrollView>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: spacing[8] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} />}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <HStack
          gap={2}
          align="center"
          style={{
            paddingHorizontal: spacing[4],
            paddingTop: spacing[5],
            paddingBottom: spacing[2],
          }}
        >
          <Text variant="subheading" color={colors.textMuted}>
            {section.title}
          </Text>
          {section.hasLan && <Icon svg={icons.wifi} size={14} color={ACCENT} />}
        </HStack>
      )}
      renderItem={({ item }) => (
        <ProjectCard
          project={item}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedProject(item);
          }}
        />
      )}
    />
  );
}

// ── Project Card ────────────────────────────────────────────────────────

function ProjectCard({ project, onPress }: { project: Project; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  const varCount =
    project.variable_counts[project.active_profile] ??
    Math.max(...Object.values(project.variable_counts), 0);
  const health = project.health;
  const totalIssues = health
    ? health.stale_count + health.expiring_count + health.exposed_count
    : 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={{ marginHorizontal: spacing[4], marginBottom: spacing[2] }}>
        <HStack gap={3} align="center" justify="between">
          <VStack gap={1} style={{ flex: 1 }}>
            <HStack gap={2} align="center">
              <Text variant="body" style={{ fontWeight: '600' }}>
                {project.name}
              </Text>
              {project.framework && (
                <Badge
                  variant="default"
                  style={{
                    backgroundColor: frameworkColors[project.framework.toLowerCase()] ?? colors.bgElevated,
                  }}
                >
                  {project.framework}
                </Badge>
              )}
            </HStack>
            <HStack gap={2} align="center">
              <Badge variant="default" style={{ backgroundColor: ACCENT + '22' }}>
                <Text variant="caption" style={{ color: ACCENT }}>
                  {project.active_profile}
                </Text>
              </Badge>
              <Text variant="caption" color={colors.textMuted}>
                {varCount} var{varCount !== 1 ? 's' : ''}
              </Text>
              {totalIssues > 0 && (
                <Badge variant="destructive">
                  {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
                </Badge>
              )}
            </HStack>
          </VStack>
          <Icon svg={icons.chevronRight} size={18} color={colors.textMuted} />
        </HStack>
      </Card>
    </TouchableOpacity>
  );
}

// ── Project Detail ──────────────────────────────────────────────────────

function ProjectDetailScreen({
  project,
  onBack,
  onShowVariables,
  onProjectUpdated,
}: {
  project: Project;
  onBack: () => void;
  onShowVariables: () => void;
  onProjectUpdated: () => void;
}) {
  const { colors, spacing } = useTheme();

  const profilesQuery = useQuery(() => api.listProfiles(project.id), [project.id]);
  const switchMutation = useMutation((profile: string) => api.switchProfile(project.id, profile));

  const handleSwitchProfile = useCallback(
    async (profileName: string) => {
      if (profileName === project.active_profile) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await switchMutation.execute(profileName);
      onProjectUpdated();
    },
    [project.active_profile, switchMutation, onProjectUpdated],
  );

  const varCount =
    project.variable_counts[project.active_profile] ??
    Math.max(...Object.values(project.variable_counts), 0);
  const health = project.health;
  const totalIssues = health
    ? health.stale_count + health.expiring_count + health.exposed_count
    : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <HStack
        gap={3}
        align="center"
        style={{
          paddingHorizontal: spacing[4],
          paddingTop: spacing[2],
          paddingBottom: spacing[3],
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Icon svg={icons.chevronLeft} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text variant="subheading" style={{ flex: 1 }}>
          {project.name}
        </Text>
        {project.framework && (
          <Badge
            variant="default"
            style={{
              backgroundColor: frameworkColors[project.framework.toLowerCase()] ?? colors.bgElevated,
            }}
          >
            {project.framework}
          </Badge>
        )}
      </HStack>

      <VStack gap={4} style={{ padding: spacing[4] }}>
        {/* Active profile */}
        <Card>
          <HStack gap={2} align="center" justify="between">
            <VStack gap={1}>
              <Text variant="caption" color={colors.textMuted}>
                Active Profile
              </Text>
              <HStack gap={2} align="center">
                <Icon svg={icons.check} size={16} color={ACCENT} />
                <Text variant="body" style={{ fontWeight: '600', color: ACCENT }}>
                  {project.active_profile}
                </Text>
              </HStack>
            </VStack>
          </HStack>
        </Card>

        {/* Variables link */}
        <TouchableOpacity onPress={onShowVariables} activeOpacity={0.7}>
          <Card>
            <HStack gap={3} align="center" justify="between">
              <HStack gap={2} align="center">
                <Icon svg={icons.key} size={18} color={ACCENT} />
                <Text variant="body">Variables</Text>
              </HStack>
              <HStack gap={2} align="center">
                <Badge variant="default">{varCount}</Badge>
                <Icon svg={icons.chevronRight} size={18} color={colors.textMuted} />
              </HStack>
            </HStack>
          </Card>
        </TouchableOpacity>

        {/* Health section */}
        {health && totalIssues > 0 && (
          <Card>
            <VStack gap={2}>
              <HStack gap={2} align="center">
                <Icon svg={icons.alertTriangle} size={16} color="#F59E0B" />
                <Text variant="caption" color={colors.textMuted}>
                  Health Issues
                </Text>
              </HStack>
              {health.stale_count > 0 && (
                <HStack gap={2} align="center">
                  <Text variant="body">
                    {health.stale_count} stale variable{health.stale_count !== 1 ? 's' : ''}
                  </Text>
                </HStack>
              )}
              {health.expiring_count > 0 && (
                <HStack gap={2} align="center">
                  <Text variant="body">
                    {health.expiring_count} expiring variable{health.expiring_count !== 1 ? 's' : ''}
                  </Text>
                </HStack>
              )}
              {health.exposed_count > 0 && (
                <HStack gap={2} align="center">
                  <Text variant="body" color={colors.error}>
                    {health.exposed_count} exposed variable{health.exposed_count !== 1 ? 's' : ''}
                  </Text>
                </HStack>
              )}
            </VStack>
          </Card>
        )}

        {/* Profile list */}
        <VStack gap={2}>
          <Text variant="caption" color={colors.textMuted} style={{ paddingLeft: spacing[1] }}>
            Profiles
          </Text>
          <Card>
            {profilesQuery.loading ? (
              <Spinner size="sm" />
            ) : (
              <VStack gap={0}>
                {(profilesQuery.data ?? []).map((profile, idx) => (
                  <React.Fragment key={profile.name}>
                    {idx > 0 && <Separator />}
                    <TouchableOpacity
                      onPress={() => handleSwitchProfile(profile.name)}
                      activeOpacity={0.7}
                      style={{ paddingVertical: spacing[3] }}
                    >
                      <HStack gap={3} align="center" justify="between">
                        <HStack gap={2} align="center">
                          {/* Colored dot matching desktop ProfileSwitcher */}
                          <View
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 6,
                              backgroundColor: getProfileColor(profile.name),
                              borderWidth: profile.name === project.active_profile ? 2 : 0,
                              borderColor: '#fff',
                            }}
                          />
                          <Text
                            variant="body"
                            style={{
                              fontWeight: profile.name === project.active_profile ? '600' : '400',
                              color: profile.name === project.active_profile
                                ? getProfileColor(profile.name)
                                : colors.text,
                            }}
                          >
                            {profile.name === 'default' ? '.env' : `.env.${profile.name}`}
                          </Text>
                          {profile.name === project.active_profile && (
                            <Badge variant="default" style={{ backgroundColor: getProfileColor(profile.name) + '22' }}>
                              <Text variant="caption" style={{ color: getProfileColor(profile.name), fontSize: 10 }}>
                                ACTIVE
                              </Text>
                            </Badge>
                          )}
                        </HStack>
                        <Text variant="caption" color={colors.textMuted}>
                          {profile.variable_count} var{profile.variable_count !== 1 ? 's' : ''}
                        </Text>
                      </HStack>
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
              </VStack>
            )}
          </Card>
        </VStack>

        {/* Info section */}
        <VStack gap={2}>
          <Text variant="caption" color={colors.textMuted} style={{ paddingLeft: spacing[1] }}>
            Info
          </Text>
          <Card>
            <VStack gap={2}>
              <HStack justify="between">
                <Text variant="caption" color={colors.textMuted}>
                  Path
                </Text>
                <Text
                  variant="caption"
                  style={{
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    flexShrink: 1,
                    textAlign: 'right',
                  }}
                >
                  {project.path}
                </Text>
              </HStack>
              {project.framework && (
                <HStack justify="between">
                  <Text variant="caption" color={colors.textMuted}>
                    Framework
                  </Text>
                  <Text variant="caption">{project.framework}</Text>
                </HStack>
              )}
              <HStack justify="between">
                <Text variant="caption" color={colors.textMuted}>
                  Profiles
                </Text>
                <Text variant="caption">{project.profiles.length}</Text>
              </HStack>
              <HStack justify="between">
                <Text variant="caption" color={colors.textMuted}>
                  Variables
                </Text>
                <Text variant="caption">{varCount}</Text>
              </HStack>
            </VStack>
          </Card>
        </VStack>
      </VStack>
    </ScrollView>
  );
}
