import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList } from './src/types';
import HomeScreen from './src/screens/HomeScreen';
import MealRegisterScreen from './src/screens/MealRegisterScreen';
import FoodSearchScreen from './src/screens/FoodSearchScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const SLOT_KO: Record<string, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
};

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#fff' },
          headerShadowVisible: false,
          headerTintColor: '#222',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: '오늘의 식단' }} />
        <Stack.Screen
          name="MealRegister"
          component={MealRegisterScreen}
          options={({ route }) => ({ title: `${SLOT_KO[route.params.slot]} 등록` })}
        />
        <Stack.Screen name="FoodSearch" component={FoodSearchScreen} options={{ title: '음식 검색' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
