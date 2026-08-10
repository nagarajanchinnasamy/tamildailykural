import { Stack } from 'expo-router';
import { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import { storage } from '../src/storage';
import '../src/global.css';

export const AppContext = createContext<any>(null);

const STORAGE_KEY = 'SAVED_API_URL';
const DEFAULT_URL = 'http://192.168.1.39:3001';

export default function Layout() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_URL);
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const connectToApi = async (targetUrl: string) => {
    if (!targetUrl) return;
    setIsConnecting(true);
    setConnectionError(null);
    try {
      const cleanUrl = targetUrl.replace(/\/+$/, '');
      const res = await axios.get(`${cleanUrl}/api/hierarchy`);
      if (res.data) {
        setHierarchy(res.data);
        setApiUrl(cleanUrl);
        storage.setItem(STORAGE_KEY, cleanUrl);
      } else {
        setConnectionError('Invalid response from server.');
      }
    } catch (err: any) {
      console.error('Error connecting to API:', err);
      setConnectionError(err.message || 'Failed to connect to API server');
    } finally {
      setIsConnecting(false);
    }
  };

  // Load saved API URL from storage on initial mount (do NOT auto-connect)
  useEffect(() => {
    storage.getItem(STORAGE_KEY).then(savedUrl => {
      if (savedUrl) {
        setApiUrl(savedUrl);
      }
    });
  }, []);

  return (
    <AppContext.Provider value={{ apiUrl, setApiUrl, hierarchy, connectToApi, isConnecting, connectionError }}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Thirukkural' }} />
        <Stack.Screen name="paal/[id]" options={{ title: 'Paal' }} />
        <Stack.Screen name="iyal/[id]" options={{ title: 'Iyal' }} />
        <Stack.Screen name="adhikaram/[id]" options={{ title: 'Adhikaram' }} />
        <Stack.Screen name="kural/[number]" options={{ title: 'Kural Details' }} />
      </Stack>
    </AppContext.Provider>
  );
}
