import { Tabs } from 'expo-router';
import { ThemeProvider, Toaster, useTheme, Icon, icons, Spinner, VStack } from '@mattssoftware/base-rn';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import { AuthContext, useAuthProvider } from '../src/hooks/useAuth';
import { SignInScreen } from '../src/screens/SignInScreen';

const ACCENT = '#34D399'; // Stash green

function TabLayout() {
  const { colors } = useTheme();

  return (
    <>
      <StatusBar style="auto" />
      <Tabs
        screenOptions={{
          tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: colors.textMuted,
          headerStyle: { backgroundColor: colors.bg, borderBottomColor: colors.border },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Vaults',
            tabBarIcon: ({ color }) => <Icon svg={icons.shield} size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="directory"
          options={{
            title: 'Directory',
            tabBarIcon: ({ color }) => <Icon svg={icons.bookOpen} size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="health"
          options={{
            title: 'Health',
            tabBarIcon: ({ color }) => <Icon svg={icons.activity} size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="people"
          options={{
            title: 'People',
            tabBarIcon: ({ color }) => <Icon svg={icons.users} size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color }) => <Icon svg={icons.settings} size={22} color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}

function AuthGate() {
  const auth = useAuthProvider();
  const { colors } = useTheme();

  if (!auth.isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <VStack gap={3} align="center">
          <Icon svg={icons.key} size={48} color={ACCENT} />
          <Spinner size="lg" />
        </VStack>
      </View>
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      {auth.isAuthenticated ? <TabLayout /> : <SignInScreen />}
    </AuthContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider defaultMode="system">
      <Toaster>
        <AuthGate />
      </Toaster>
    </ThemeProvider>
  );
}
