import React, { useState, useMemo } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import {
  useTheme,
  VStack,
  HStack,
  Text,
  Card,
  Badge,
  Icon,
  icons,
} from '@mattssoftware/base-rn';
import catalog from '../data/api-catalog.json';

const ACCENT = '#34D399';

interface ApiService {
  id: string;
  name: string;
  category: string;
  description: string;
  envKeys: string[];
  portalUrl: string;
}

const services: ApiService[] = catalog as ApiService[];

const categories = Array.from(new Set(services.map((s) => s.category))).sort();

export function DirectoryScreen() {
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = services;
    if (selectedCategory) {
      result = result.filter((s) => s.category === selectedCategory);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.envKeys.some((k) => k.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [query, selectedCategory]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Search */}
      <View style={{ padding: spacing[4], paddingBottom: 0 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search APIs..."
          placeholderTextColor={colors.textMuted}
          style={{
            backgroundColor: colors.bgMuted,
            color: colors.text,
            borderRadius: 10,
            padding: 12,
            fontSize: 15,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
      </View>

      {/* Category filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: 8 }}
      >
        <TouchableOpacity
          onPress={() => setSelectedCategory(null)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor: !selectedCategory ? ACCENT : colors.bgMuted,
          }}
        >
          <Text
            variant="caption"
            style={{ color: !selectedCategory ? '#fff' : colors.text, fontWeight: '600' }}
          >
            All ({filtered.length})
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: selectedCategory === cat ? ACCENT : colors.bgMuted,
            }}
          >
            <Text
              variant="caption"
              style={{ color: selectedCategory === cat ? '#fff' : colors.text, fontWeight: '500' }}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Service list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: spacing[8] }}
        ItemSeparatorComponent={() => <View style={{ height: spacing[2] }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => item.portalUrl && Linking.openURL(item.portalUrl)}
          >
            <Card>
              <VStack gap={2}>
                <HStack gap={2} align="center" justify="between">
                  <Text variant="body" style={{ fontWeight: '600', flex: 1 }}>
                    {item.name}
                  </Text>
                  <Badge variant="default" style={{ backgroundColor: '#a78bfa22' }}>
                    <Text variant="caption" style={{ color: '#a78bfa', fontSize: 11 }}>
                      {item.category}
                    </Text>
                  </Badge>
                </HStack>
                <Text variant="caption" color={colors.textMuted}>
                  {item.description}
                </Text>
                <HStack gap={1} style={{ flexWrap: 'wrap' }}>
                  {item.envKeys.slice(0, 3).map((k) => (
                    <Badge key={k} variant="default" style={{ backgroundColor: colors.bgMuted }}>
                      <Text variant="caption" style={{ fontFamily: 'monospace', fontSize: 10 }}>
                        {k}
                      </Text>
                    </Badge>
                  ))}
                  {item.envKeys.length > 3 && (
                    <Text variant="caption" color={colors.textMuted} style={{ fontSize: 10 }}>
                      +{item.envKeys.length - 3} more
                    </Text>
                  )}
                </HStack>
              </VStack>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <VStack gap={3} align="center" style={{ paddingTop: spacing[8] }}>
            <Icon svg={icons.search} size={40} color={colors.textMuted} />
            <Text variant="body" color={colors.textMuted} align="center">
              No matching services
            </Text>
          </VStack>
        }
      />
    </View>
  );
}
