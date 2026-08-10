import { useContext, useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { AppContext } from './_layout';

export default function HomeScreen() {
  const { apiUrl, hierarchy, connectToApi, isConnecting, connectionError } = useContext(AppContext);
  const [inputUrl, setInputUrl] = useState(apiUrl);
  const router = useRouter();

  useEffect(() => {
    setInputUrl(apiUrl);
  }, [apiUrl]);

  const handleConnect = () => {
    connectToApi(inputUrl);
  };

  if (!hierarchy || hierarchy.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-6">
        <Text className="text-xl font-bold mb-2 text-gray-800">API Server Connection</Text>
        <Text className="text-sm text-gray-500 mb-6 text-center">Enter your backend server API URL to connect</Text>
        
        <View className="w-full flex-row items-center mb-3 space-x-2">
          <TextInput 
            className="flex-1 border border-gray-300 rounded-lg p-3 bg-white text-base"
            value={inputUrl}
            onChangeText={setInputUrl}
            placeholder="http://192.168.1.39:3001"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity 
            className="bg-blue-600 px-5 py-3 rounded-lg flex-row items-center justify-center min-w-[90px]"
            onPress={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white font-bold text-base">Connect</Text>
            )}
          </TouchableOpacity>
        </View>

        {connectionError && (
          <Text className="text-red-500 text-sm font-semibold text-center mt-2 px-2">
            ⚠️ {connectionError}
          </Text>
        )}
      </View>
    );
  }

  // The detail.json structure has a top level array where index 0 is "திருக்குறள்", 
  // and it has a "section" object which contains "detail" (the Paals)
  const thirukkural = hierarchy[0];
  const paals = thirukkural?.section?.detail || [];

  return (
    <View className="flex-1 bg-gray-50 p-4">
      <View className="mb-4 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
        <View className="flex-row items-center space-x-2">
          <Text className="font-bold text-gray-700">API:</Text>
          <TextInput 
            className="flex-1 border border-gray-300 rounded-lg p-2 bg-gray-50 text-sm"
            value={inputUrl}
            onChangeText={setInputUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity 
            className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center justify-center min-w-[80px]"
            onPress={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white font-bold text-sm">Connect</Text>
            )}
          </TouchableOpacity>
        </View>
        {connectionError && (
          <Text className="text-red-500 text-xs font-semibold mt-2">
            ⚠️ {connectionError}
          </Text>
        )}
      </View>

      <Text className="text-2xl font-bold text-gray-900 mb-4">{thirukkural.tamil} - Sections (Paal)</Text>
      
      <FlatList 
        data={paals}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item, index }) => (
          <TouchableOpacity 
            className="bg-white p-4 rounded-xl shadow border border-gray-100 mb-3 flex-row justify-between items-center"
            onPress={() => router.push({ pathname: `/paal/${index}` })}
          >
            <View>
              <Text className="text-lg font-bold text-gray-800">{item.name}</Text>
              <Text className="text-sm text-gray-500">{item.translation} ({item.transliteration})</Text>
            </View>
            <Text className="text-gray-400 font-bold text-xl">→</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text className="text-center text-gray-500 mt-10">No Paals found.</Text>}
      />
    </View>
  );
}
