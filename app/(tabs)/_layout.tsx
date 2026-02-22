import { Tabs } from 'expo-router';
import { Home, Search, User } from 'lucide-react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#1a1a1a',
          borderTopColor: '#2a2a2a',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: '#c9a84c',
        tabBarInactiveTintColor: '#6b7280',
        headerStyle: { backgroundColor: '#1a1a1a' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => (
            <Home color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Search color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <User color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
