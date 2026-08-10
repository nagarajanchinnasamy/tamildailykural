import { useEffect, useState, useContext } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';
import { AppContext } from '../_layout';

export default function KuralListScreen() {
  const { id, start, end, name } = useLocalSearchParams();
  const { apiUrl } = useContext(AppContext);
  const router = useRouter();

  const [kurals, setKurals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (start && end) {
      fetchKurals();
    }
  }, [start, end]);

  const fetchKurals = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/kurals?start=${start}&end=${end}`);
      setKurals(response.data);
    } catch (error: any) {
      console.error('Error fetching kurals:', error);
      Alert.alert('Network Error', error.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-bold text-gray-900 mb-4">{name} (Kurals {start}-{end})</Text>
      
      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" className="mt-10" />
      ) : (
        <FlatList 
          data={kurals}
          keyExtractor={(item) => item.Number.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity 
              className="bg-white p-4 rounded-xl shadow border border-gray-100 mb-3 flex-row justify-between items-center"
              onPress={() => router.push({ pathname: `/kural/${item.Number}` })}
            >
              <View className="flex-1">
                <Text className="font-bold text-gray-800 text-lg">Kural {item.Number}</Text>
                <Text className="text-gray-600 mt-1" numberOfLines={1}>{item.Line1}</Text>
              </View>
              <View className="bg-blue-100 px-3 py-1 rounded-full ml-2">
                <Text className="text-blue-800 text-xs font-semibold">Review</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text className="text-center text-gray-500 mt-10">No kurals loaded.</Text>}
        />
      )}
    </View>
  );
}
