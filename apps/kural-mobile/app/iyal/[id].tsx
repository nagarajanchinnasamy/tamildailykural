import { useContext } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppContext } from '../_layout';

export default function AdhikaramScreen() {
  const { id } = useLocalSearchParams();
  const { hierarchy } = useContext(AppContext);
  const router = useRouter();

  const [paalIndex, iyalIndex] = (id as string).split('-').map(Number);
  
  const paal = hierarchy?.[0]?.section?.detail?.[paalIndex];
  const iyal = paal?.chapterGroup?.detail?.[iyalIndex];
  const adhikarams = iyal?.chapters?.detail || [];

  if (!iyal) return <Text className="p-4 text-center">Loading...</Text>;

  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-bold text-gray-900 mb-4">{iyal.name} - Topics (Adhikaaram)</Text>
      
      <FlatList 
        data={adhikarams}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity 
            className="bg-white p-4 rounded-xl shadow border border-gray-100 mb-3 flex-row justify-between items-center"
            onPress={() => router.push({ pathname: `/adhikaram/${item.number}`, params: { start: item.start, end: item.end, name: item.name } })}
          >
            <View className="flex-1 pr-4">
              <Text className="text-lg font-bold text-gray-800">{item.number}. {item.name}</Text>
              <Text className="text-sm text-gray-500">{item.translation} ({item.transliteration})</Text>
            </View>
            <Text className="text-gray-400 font-bold text-xl">→</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text className="text-center text-gray-500 mt-10">No Adhikarams found.</Text>}
      />
    </View>
  );
}
