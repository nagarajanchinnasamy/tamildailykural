import { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';
import { AppContext } from '../_layout';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { openBrowserAsync } from 'expo-web-browser';

export default function KuralReviewScreen() {
  const { number } = useLocalSearchParams();
  const { apiUrl } = useContext(AppContext);
  const router = useRouter();
  const [kural, setKural] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tdk, setTdk] = useState('');
  const [tdkExplanation, setTdkExplanation] = useState('');
  const [splitText, setSplitText] = useState('');
  const [translating, setTranslating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayingAi, setIsPlayingAi] = useState(false);
  const [isPlayingTts, setIsPlayingTts] = useState(false);
  const [splitPoint, setSplitPoint] = useState('');
  const [imageVersion, setImageVersion] = useState(Date.now());
  const [isImageReady, setIsImageReady] = useState(false);
  const [actualImageUrl, setActualImageUrl] = useState<string | null>(null);
  const [selectedMeaning, setSelectedMeaning] = useState<'ai' | 'tts' | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSplitDone, setIsSplitDone] = useState(false);
  const [activeTask, setActiveTask] = useState<{ title: string } | null>(null);

  function getTamilDateFromGregorian(gregorianDateStr: string): string {
    const parts = gregorianDateStr.split('-').map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    if (!y || !m || !d) return '2057-04-01';

    const date = new Date(y, m - 1, d);

    const monthStarts = [
      { gMonth: 1, gDay: 15, tMonth: 10 },
      { gMonth: 2, gDay: 13, tMonth: 11 },
      { gMonth: 3, gDay: 15, tMonth: 12 },
      { gMonth: 4, gDay: 14, tMonth: 1 },
      { gMonth: 5, gDay: 15, tMonth: 2 },
      { gMonth: 6, gDay: 15, tMonth: 3 },
      { gMonth: 7, gDay: 17, tMonth: 4 },
      { gMonth: 8, gDay: 18, tMonth: 5 },
      { gMonth: 9, gDay: 18, tMonth: 6 },
      { gMonth: 10, gDay: 18, tMonth: 7 },
      { gMonth: 11, gDay: 17, tMonth: 8 },
      { gMonth: 12, gDay: 16, tMonth: 9 },
    ];

    let currentStart = monthStarts[monthStarts.length - 1];
    let currentStartYear = (m === 1 && d < 15) ? y - 1 : y;

    for (let i = 0; i < monthStarts.length; i++) {
      const ms = monthStarts[i];
      if (m > ms.gMonth || (m === ms.gMonth && d >= ms.gDay)) {
        currentStart = ms;
        currentStartYear = y;
      }
    }

    if (m === 1 && d < 15) {
      currentStart = { gMonth: 12, gDay: 16, tMonth: 9 };
      currentStartYear = y - 1;
    }

    const isBeforeNewYear = (m < 4 || (m === 4 && d < 14));
    const tYear = y + (isBeforeNewYear ? 30 : 31);

    const startDate = new Date(currentStartYear, currentStart.gMonth - 1, currentStart.gDay);
    const diffMs = date.getTime() - startDate.getTime();
    const tDay = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

    const tMonthPadded = currentStart.tMonth.toString().padStart(2, '0');
    const tDayPadded = tDay.toString().padStart(2, '0');

    return `${tYear}-${tMonthPadded}-${tDayPadded}`;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const [gregorianDate, setGregorianDate] = useState(todayStr);
  const [tamilDate, setTamilDate] = useState(() => getTamilDateFromGregorian(todayStr));

  const handleGregorianDateChange = (newGregorianDate: string) => {
    setGregorianDate(newGregorianDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(newGregorianDate.trim())) {
      const calculated = getTamilDateFromGregorian(newGregorianDate.trim());
      setTamilDate(calculated);
    }
  };
  const [history, setHistory] = useState<any[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeTimerRef = useRef<any>(null);

  const stopTask = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (activeTimerRef.current) {
      clearInterval(activeTimerRef.current);
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    setActiveTask(null);
    setIsPublishing(false);
    Alert.alert('Aborted', 'Operation was aborted by the user.');
  };

  // Derive base URLs from the passed apiUrl
  const API_URL = `${apiUrl}/api`; 
  const ASSET_URL = `${apiUrl}/public/Kurals`;

  const kuralNumStr = Array.isArray(number) ? number[0] : number;
  const kuralNum = kuralNumStr ? parseInt(kuralNumStr, 10) : 1;
  const adhikaaram = Math.ceil(kuralNum / 10);
  const adhikaaramStr = `Adhikaaram_${adhikaaram.toString().padStart(4, '0')}`;
  const kuralStr = `Kural_${kuralNum.toString().padStart(4, '0')}`;
  const prefix = kuralNum.toString().padStart(4, '0');
  
  const masterAudioUrl = `${ASSET_URL}/${adhikaaramStr}/${kuralStr}/${prefix}_master_audio.mp3`;
  const aiAudioUrl = `${ASSET_URL}/${adhikaaramStr}/${kuralStr}/${prefix}_ai_meaning_audio.mp3`;
  const ttsAudioUrl = `${ASSET_URL}/${adhikaaramStr}/${kuralStr}/${prefix}_tts_meaning_audio.mp3`;
  const meaningAudioUrl = `${ASSET_URL}/${adhikaaramStr}/${kuralStr}/${prefix}_meaning_audio.mp3`;
  
  const tMonthStr = tamilDate.trim().slice(0, 7) || '2026-04';
  const videoUrl = `${apiUrl}/videos/${tMonthStr}/${tamilDate.trim()}_${prefix}_final_video.mp4`;

  const player = useAudioPlayer(masterAudioUrl);
  const status = useAudioPlayerStatus(player);
  
  const aiPlayer = useAudioPlayer(aiAudioUrl);
  const aiStatus = useAudioPlayerStatus(aiPlayer);
  
  const ttsPlayer = useAudioPlayer(ttsAudioUrl);
  const ttsStatus = useAudioPlayerStatus(ttsPlayer);

  const meaningPlayer = useAudioPlayer(meaningAudioUrl);
  const meaningStatus = useAudioPlayerStatus(meaningPlayer);

  const isSplitValid = !isNaN(parseFloat(splitPoint)) && parseFloat(splitPoint) > 0;
  const canSplit = !!status.isLoaded && isSplitValid;
  const canPlayAi = !!aiStatus.isLoaded && isSplitDone;
  const canPlayTts = isSplitDone;
  const canGenImage = !!meaningStatus.isLoaded && selectedMeaning !== null && isSplitDone;
  const canRenderVideo = isImageReady && selectedMeaning !== null && isSplitDone;

  useEffect(() => {
    if (status.isLoaded && status.didJustFinish) {
      setIsPlaying(false);
      player.pause();
      player.seekTo(0);
    }
    if (aiStatus.isLoaded && aiStatus.didJustFinish) {
      setIsPlayingAi(false);
      aiPlayer.pause();
      aiPlayer.seekTo(0);
    }
    if (ttsStatus.isLoaded && ttsStatus.didJustFinish) {
      setIsPlayingTts(false);
      ttsPlayer.pause();
      ttsPlayer.seekTo(0);
    }
  }, [status.didJustFinish, aiStatus.didJustFinish, ttsStatus.didJustFinish]);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_URL}/kurals/${kuralNum}/history`);
      if (res.data) setHistory(res.data);
    } catch(e) {}
  };

  useEffect(() => {
    fetchHistory();
  }, [kuralNum, API_URL]);

  useEffect(() => {
    const checkImageExists = async () => {
      const exts = ['.jpeg', '.jpg', '.png'];
      const base = `${ASSET_URL}/${adhikaaramStr}/${kuralStr}/${prefix}_kural_image`;
      for (const ext of exts) {
        try {
          const url = `${base}${ext}`;
          const res = await fetch(`${url}?t=${Date.now()}`, { method: 'HEAD' });
          if (res.ok) {
            setActualImageUrl(url);
            setIsImageReady(true);
            return;
          }
        } catch (e) {}
      }
      setActualImageUrl(null);
      setIsImageReady(false);
    };
    checkImageExists();
  }, [imageVersion, ASSET_URL, adhikaaramStr, kuralStr, prefix]);

  useEffect(() => {
    const detectSelection = async () => {
      try {
        const [meaningRes, aiRes, ttsRes] = await Promise.all([
          fetch(`${meaningAudioUrl}?t=${Date.now()}`, { method: 'HEAD' }),
          fetch(`${aiAudioUrl}?t=${Date.now()}`, { method: 'HEAD' }),
          fetch(`${ttsAudioUrl}?t=${Date.now()}`, { method: 'HEAD' })
        ]);
        
        if (aiRes.ok) {
          setIsSplitDone(true);
        }

        if (meaningRes.ok) {
          const meaningSize = meaningRes.headers.get('content-length');
          const aiSize = aiRes.headers.get('content-length');
          const ttsSize = ttsRes.headers.get('content-length');
          
          if (meaningSize === aiSize && aiSize) setSelectedMeaning('ai');
          else if (meaningSize === ttsSize && ttsSize) setSelectedMeaning('tts');
        }
      } catch (e) {}
    };
    detectSelection();
  }, [meaningAudioUrl, aiAudioUrl, ttsAudioUrl]);

  useEffect(() => {
    const checkVideoExists = async () => {
      try {
        const res = await fetch(`${videoUrl}?t=${Date.now()}`, { method: 'HEAD' });
        if (res.ok) setIsVideoReady(true);
        else setIsVideoReady(false);
      } catch(e) {
        setIsVideoReady(false);
      }
    };
    checkVideoExists();
    const interval = setInterval(checkVideoExists, 5000);
    return () => clearInterval(interval);
  }, [videoUrl]);

  useEffect(() => {
    fetchKuralDetails();
  }, [number]);

  // player manages its own lifecycle automatically

  const fetchKuralDetails = async () => {
    try {
      const response = await axios.get(`${API_URL}/kurals/${number}`);
      setKural(response.data);
      const fetchedTdk = response.data.tdk || '';
      const fetchedExplanation = response.data.tdk_explanation || response.data['tdk-explanation'] || '';

      setTdk(fetchedTdk);
      setTdkExplanation(fetchedExplanation);
      
      let parsedSplit = response.data.split;
      if (typeof parsedSplit === 'string') {
        try { parsedSplit = JSON.parse(parsedSplit); } catch(e) {}
      }
      setSplitText(Array.isArray(parsedSplit) ? parsedSplit.join('\n') : '');

      if (!fetchedExplanation && fetchedTdk) {
        autoTranslateText(fetchedTdk);
      }
    } catch (error) {
      console.error('Error fetching kural details:', error);
      Alert.alert('Error', 'Failed to fetch kural details');
    } finally {
      setLoading(false);
    }
  };

  const autoTranslateText = async (textToTranslate?: string) => {
    const targetText = textToTranslate || tdk;
    if (!targetText) return;
    try {
      setTranslating(true);
      const response = await axios.post(`${API_URL}/generate/translation`, { text: targetText });
      if (response.data.translation) {
        setTdkExplanation(response.data.translation);
      }
    } catch (error) {
      console.error('Translation error:', error);
    } finally {
      setTranslating(false);
    }
  };

  const saveChanges = async () => {
    try {
      const updatedSplit = splitText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      const payload = {
        ...kural,
        tdk,
        tdk_explanation: tdkExplanation,
        split: updatedSplit
      };
      await axios.put(`${API_URL}/kurals/${number}`, payload);
      Alert.alert('Success', 'Changes saved successfully');
      setKural(payload);
    } catch (error) {
      console.error('Error saving changes:', error);
      Alert.alert('Error', 'Failed to save changes');
    }
  };

  const triggerGeneration = async (type: string, data: any = {}) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const title = type === 'image' ? 'Generating Image...' : 'Rendering Video...';
    setActiveTask({ title });

    try {
      const response = await axios.post(`${API_URL}/generate/${type}`, { kuralNumber: kural.Number, ...data }, { signal: controller.signal });
      setActiveTask(null);
      if (response.data?.success) {
        if (type === 'image') {
          setImageVersion(Date.now());
        }
        fetchHistory();
      } else {
        Alert.alert('Error', `Failed: ${response.data?.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      setActiveTask(null);
      if (!axios.isCancel(error) && error.name !== 'AbortError') {
        console.error(`Error generating ${type}:`, error);
        Alert.alert('Error', `Failed to generate ${type}`);
      }
    }
  };

  const startMasterAudioGeneration = async () => {
    // Reset downstream states
    setSplitPoint('');
    setIsSplitDone(false);
    setSelectedMeaning(null);
    setIsImageReady(false);
    setActualImageUrl(null);
    setIsVideoReady(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setActiveTask({ title: 'Generating Master Audio...' });

    try {
      await axios.post(`${API_URL}/generate/audio/kural`, { kuralNumber: kural.Number }, { signal: controller.signal });
      
      // Wait 10 seconds before polling to give script time to delete the old file
      const initialTimeout = setTimeout(() => {
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          try {
            const res = await fetch(`${masterAudioUrl}?t=${Date.now()}`, { method: 'HEAD', signal: controller.signal });
            if (res.ok) {
              clearInterval(interval);
              activeTimerRef.current = null;
              setActiveTask(null);
              reloadAudio();
            }
          } catch(e) {}

          if (attempts > 120) {
            clearInterval(interval);
            activeTimerRef.current = null;
            setActiveTask(null);
            Alert.alert('Timeout', 'Timed out waiting for master audio.');
          }
        }, 5000);
        activeTimerRef.current = interval;
      }, 10000);
      activeTimerRef.current = initialTimeout;
    } catch (e: any) {
      setActiveTask(null);
      if (!axios.isCancel(e) && e.name !== 'AbortError') {
        Alert.alert('Error', 'Failed to start generation');
      }
    }
  };

  const handleGenMasterAudio = () => {
    if (status.isLoaded) {
      Alert.alert(
        'Confirm Overwrite',
        'Master audio already exists. Are you sure you want to regenerate?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Regenerate', style: 'destructive', onPress: startMasterAudioGeneration }
        ]
      );
    } else {
      startMasterAudioGeneration();
    }
  };

  const handleGenImage = () => {
    if (isImageReady) {
      Alert.alert(
        'Confirm Overwrite',
        'Image already exists. Are you sure you want to regenerate?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Regenerate', style: 'destructive', onPress: () => triggerGeneration('image') }
        ]
      );
    } else {
      triggerGeneration('image');
    }
  };

  const publishToYouTube = async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setActiveTask({ title: 'Uploading to YouTube...' });

    try {
      setIsPublishing(true);
      const response = await axios.post(`${API_URL}/publish`, {
        kuralNumber: kural.Number,
        startDate: gregorianDate,
        tamilDate: tamilDate
      }, { signal: controller.signal });
      setActiveTask(null);
      if (response.data.success) {
        fetchHistory();
        Alert.alert('Success', 'Published to YouTube successfully!');
      } else {
        Alert.alert('Error', 'Publishing failed.');
      }
    } catch (e: any) {
      setActiveTask(null);
      if (!axios.isCancel(e) && e.name !== 'AbortError') {
        Alert.alert('Error', e.message || 'Publishing failed.');
      }
    } finally {
      setIsPublishing(false);
    }
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#3b82f6" className="mt-10" />;
  }

  if (!kural) {
    return <Text className="text-center mt-10">Kural not found</Text>;
  }

  async function playSound() {
    try {
      player.loop = false;
      if (isPlaying) {
        player.pause();
        setIsPlaying(false);
      } else {
        player.play();
        setIsPlaying(true);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not play master audio. Make sure you generated it first.');
    }
  }

  async function reloadAudio() {
    try {
      setIsPlaying(false);
      player.pause();
      player.replace(masterAudioUrl + "?t=" + Date.now());
    } catch (e) {
      console.error('Could not reload audio:', e);
    }
  }

  async function playAiAudio() {
    try {
      if (!aiStatus.isLoaded) {
        Alert.alert('Not Found', 'AI meaning audio is not available yet.');
        return;
      }
      aiPlayer.loop = false;
      if (isPlayingAi) { aiPlayer.pause(); setIsPlayingAi(false); }
      else { aiPlayer.play(); setIsPlayingAi(true); }
    } catch (e) {}
  }
  
  const startTtsAudioGeneration = async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setActiveTask({ title: 'Generating TTS Audio...' });

    try {
      await axios.post(`${API_URL}/generate/audio/tts`, {
        kuralNumber: kural.Number,
        startDate: gregorianDate,
        tamilDate: tamilDate
      }, { signal: controller.signal });
      
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch(`${ttsAudioUrl}?t=${Date.now()}`, { method: 'HEAD', signal: controller.signal });
          if (res.ok) {
            clearInterval(interval);
            activeTimerRef.current = null;
            setActiveTask(null);
            setIsVideoReady(true);
            fetchHistory();
            Alert.alert('Success', 'TTS audio downloaded successfully!');
            ttsPlayer.replace(`${ttsAudioUrl}?t=${Date.now()}`);
          }
        } catch(e) {}

        if (attempts > 30) {
          clearInterval(interval);
          activeTimerRef.current = null;
          setActiveTask(null);
          Alert.alert('Timeout', 'Timed out waiting for TTS audio.');
        }
      }, 5000);
      activeTimerRef.current = interval;
    } catch (e: any) {
      setActiveTask(null);
      if (!axios.isCancel(e) && e.name !== 'AbortError') {
        Alert.alert('Error', 'Failed to start TTS generation');
      }
    }
  };

  async function playTtsAudio() {
    try {
      if (!ttsStatus.isLoaded) {
        Alert.alert(
          'Generate TTS',
          'TTS meaning audio is not available yet. Do you want to generate it now?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Generate', style: 'default', onPress: startTtsAudioGeneration }
          ]
        );
        return;
      }
      if (isPlayingTts) { ttsPlayer.pause(); setIsPlayingTts(false); }
      else { ttsPlayer.loop = false; ttsPlayer.play(); setIsPlayingTts(true); }
    } catch (e) {}
  }

  async function selectMeaningAudio(type: 'ai' | 'tts') {
    try {
      const response = await fetch(`${API_URL}/generate/audio/meaning/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kuralNumber: Number(number), type })
      });
      const data = await response.json();
      if (data.success) {
        setSelectedMeaning(type);
        meaningPlayer.replace(`${meaningAudioUrl}?t=${Date.now()}`);
      } else {
        Alert.alert('Error', data.error);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function triggerSplit() {
    if (!splitPoint || isNaN(parseFloat(splitPoint))) {
      Alert.alert("Error", "Please enter a valid split point in seconds");
      return;
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setActiveTask({ title: 'Splitting Audio...' });

    try {
      const response = await fetch(`${API_URL}/generate/audio/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kuralNumber: Number(number),
          splitPoint: parseFloat(splitPoint)
        }),
        signal: controller.signal
      });
      const data = await response.json();
      setActiveTask(null);
      if (data.success) {
        Alert.alert('Success', 'Audio split successfully!');
        setIsSplitDone(true);
        setSelectedMeaning('ai'); // Default is AI after split
        aiPlayer.replace(`${aiAudioUrl}?t=${Date.now()}`);
        meaningPlayer.replace(`${meaningAudioUrl}?t=${Date.now()}`);
      } else {
        Alert.alert('Error', data.error || 'Failed to split audio');
      }
    } catch (err: any) {
      setActiveTask(null);
      if (err.name !== 'AbortError') {
        Alert.alert('Error', err.message);
      }
    }
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView 
        className="flex-1 bg-gray-50 p-4"
        contentContainerStyle={{ paddingBottom: 450 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
        keyboardDismissMode="on-drag"
      >
      <TouchableOpacity onPress={() => router.back()} className="mb-4">
        <Text className="text-blue-500 font-bold">← Back</Text>
      </TouchableOpacity>

      <Text className="text-2xl font-bold text-gray-900 mb-2">Kural {kural.Number}</Text>
      <View className="bg-white p-4 rounded-xl shadow border border-gray-100 mb-4">
        <Text className="text-lg font-semibold text-gray-800 text-center mb-1">{kural.Line1}</Text>
        <Text className="text-lg font-semibold text-gray-800 text-center">{kural.Line2}</Text>
      </View>

      <Text className="text-xl font-bold text-gray-900 mb-2">Authors' Interpretations</Text>
      <View className="bg-white p-4 rounded-xl shadow border border-gray-100 mb-6 space-y-3">
        <View className="flex-row justify-between items-start">
          <View className="flex-1 mr-2">
            <Text className="font-bold text-gray-800 text-sm">Mu. Varadarajan (mv):</Text>
            <Text selectable={true} className="text-gray-600 text-sm mt-0.5">{kural.mv}</Text>
          </View>
          <TouchableOpacity 
            className="bg-indigo-100 border border-indigo-300 px-2.5 py-1 rounded-lg"
            onPress={() => setTdk(kural.mv || '')}
          >
            <Text className="text-indigo-700 font-bold text-xs">Use mv</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row justify-between items-start pt-2 border-t border-gray-100">
          <View className="flex-1 mr-2">
            <Text className="font-bold text-gray-800 text-sm">Solomon Pappaiah (sp):</Text>
            <Text selectable={true} className="text-gray-600 text-sm mt-0.5">{kural.sp}</Text>
          </View>
          <TouchableOpacity 
            className="bg-indigo-100 border border-indigo-300 px-2.5 py-1 rounded-lg"
            onPress={() => setTdk(kural.sp || '')}
          >
            <Text className="text-indigo-700 font-bold text-xs">Use sp</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row justify-between items-start pt-2 border-t border-gray-100">
          <View className="flex-1 mr-2">
            <Text className="font-bold text-gray-800 text-sm">M. Karunanidhi (mk):</Text>
            <Text selectable={true} className="text-gray-600 text-sm mt-0.5">{kural.mk}</Text>
          </View>
          <TouchableOpacity 
            className="bg-indigo-100 border border-indigo-300 px-2.5 py-1 rounded-lg"
            onPress={() => setTdk(kural.mk || '')}
          >
            <Text className="text-indigo-700 font-bold text-xs">Use mk</Text>
          </TouchableOpacity>
        </View>

        <View className="pt-2 border-t border-gray-100">
          <Text className="font-bold text-gray-800 text-sm">English:</Text>
          <Text selectable={true} className="text-gray-600 text-sm mt-0.5">{kural.explanation}</Text>
        </View>
      </View>

      <Text className="text-xl font-bold text-gray-900 mb-2">Edit TDK & Splits</Text>
      <View className="bg-white p-4 rounded-xl shadow border border-gray-100 mb-6">
        <Text className="font-bold text-gray-700 mb-1">Tamil Daily Kural (TDK)</Text>
        <TextInput 
          className="border border-gray-300 rounded p-2 mb-3 bg-gray-50"
          multiline
          value={tdk}
          onChangeText={setTdk}
        />

        <View className="flex-row justify-between items-center mb-1">
          <Text className="font-bold text-gray-700">TDK English Explanation</Text>
          <TouchableOpacity 
            className="bg-amber-600 rounded-lg p-1.5 px-3 items-center justify-center flex-row space-x-1"
            onPress={() => autoTranslateText(tdk)}
            disabled={translating}
          >
            {translating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white font-bold text-sm">🔄</Text>
            )}
          </TouchableOpacity>
        </View>
        <TextInput 
          className="border border-gray-300 rounded p-2 mb-3 bg-gray-50"
          multiline
          value={tdkExplanation}
          onChangeText={setTdkExplanation}
        />

        <Text className="font-bold text-gray-700 mb-1">Splits (One per line)</Text>
        <TextInput 
          className="border border-gray-300 rounded p-2 mb-4 bg-gray-50 h-24"
          multiline
          textAlignVertical="top"
          value={splitText}
          onChangeText={setSplitText}
        />

        <TouchableOpacity 
          className="bg-blue-600 p-3 rounded-lg items-center"
          onPress={saveChanges}
        >
          <Text className="text-white font-bold text-lg">Save Changes</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-indigo-50 p-4 rounded-xl mb-4 border border-indigo-100">
        <Text className="font-bold text-indigo-900 mb-3 text-lg">QC & Audio Splitting</Text>
        
        {!status.isLoaded ? (
          <TouchableOpacity 
            className="bg-green-600 p-3 rounded-lg w-full mb-3 items-center"
            onPress={handleGenMasterAudio}
          >
            <Text className="text-white font-bold text-center">Gen Master Audio</Text>
          </TouchableOpacity>
        ) : (
          <View className="flex-row justify-between mb-3 space-x-2">
            <TouchableOpacity 
              className="flex-1 bg-indigo-600 rounded-lg p-3 items-center"
              onPress={playSound}
            >
              <Text className="text-white font-bold text-center">
                {isPlaying ? '⏸ Pause' : '▶️ Play'} Master ({status.currentTime.toFixed(1)}s)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              className="bg-amber-600 rounded-lg p-3 items-center px-4 justify-center"
              onPress={handleGenMasterAudio}
            >
              <Text className="text-white font-bold text-center text-lg">🔄</Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="flex-row items-center space-x-2">
          <TextInput 
            className="flex-1 border border-indigo-200 rounded-lg p-3 bg-white text-lg font-bold"
            keyboardType="numeric"
            placeholder="Split (s)"
            value={splitPoint}
            onChangeText={setSplitPoint}
          />
          <TouchableOpacity 
            className={`p-3 rounded-lg items-center px-5 ${canSplit ? 'bg-emerald-600' : 'bg-gray-400'}`}
            onPress={triggerSplit}
            disabled={!canSplit}
          >
            <Text className="text-white font-bold text-center">Split</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="bg-purple-50 p-4 rounded-xl mb-4 border border-purple-100">
        <Text className="font-bold text-purple-900 mb-3 text-lg">Meaning Audio Selection</Text>
        
        <View className="flex-row justify-between mb-3 space-x-2">
          <TouchableOpacity 
            className={`flex-1 rounded p-3 items-center ${canPlayAi ? 'bg-purple-500' : 'bg-gray-400'}`}
            onPress={playAiAudio}
            disabled={!canPlayAi}
          >
            <Text className="text-white font-bold text-center">{isPlayingAi ? '⏸ Pause AI' : '▶️ Play AI'}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className={`flex-1 rounded p-3 items-center ${canPlayAi ? (selectedMeaning === 'ai' ? 'bg-green-700' : 'bg-green-500') : 'bg-gray-400'}`}
            onPress={() => selectMeaningAudio('ai')}
            disabled={!canPlayAi}
          >
            <Text className="text-white font-bold text-center">
              {selectedMeaning === 'ai' ? '✅ AI Selected' : 'Set AI'}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row justify-between mb-3 space-x-2">
          <TouchableOpacity 
            className={`flex-1 rounded p-3 items-center ${canPlayTts ? 'bg-teal-500' : 'bg-teal-700 opacity-80'}`}
            onPress={playTtsAudio}
          >
            <Text className="text-white font-bold text-center">
              {!canPlayTts ? '🎙️ Gen TTS' : (isPlayingTts ? '⏸ Pause TTS' : '▶️ Play TTS')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className={`flex-1 rounded p-3 items-center ${canPlayTts ? (selectedMeaning === 'tts' ? 'bg-green-700' : 'bg-green-500') : 'bg-gray-400'}`}
            onPress={() => selectMeaningAudio('tts')}
            disabled={!canPlayTts}
          >
            <Text className="text-white font-bold text-center">
              {selectedMeaning === 'tts' ? '✅ TTS Selected' : 'Set TTS'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-row flex-wrap justify-between mt-2">
        <TouchableOpacity 
          className={`p-3 rounded-lg w-full mb-3 items-center ${!canGenImage ? 'bg-gray-400' : (isImageReady ? 'bg-amber-600' : 'bg-green-600')}`}
          onPress={handleGenImage}
          disabled={!canGenImage}
        >
          <Text className="text-white font-bold text-center">
            {isImageReady ? 'Regenerate Image' : 'Generate Image'}
          </Text>
        </TouchableOpacity>
      </View>

      <View className="mt-6 items-center">
        <Text className="font-bold text-gray-700 mb-2">Generated Image Preview</Text>
        {actualImageUrl ? (
          <TouchableOpacity onPress={() => setIsModalVisible(true)} activeOpacity={0.8} className="w-full">
            <Image
              source={{ uri: `${actualImageUrl}?v=${imageVersion}` }}
              className="w-full h-64 bg-gray-200 rounded-lg"
              resizeMode="contain"
              onLoad={() => setIsImageReady(true)}
              onError={() => setIsImageReady(false)}
            />
          </TouchableOpacity>
        ) : (
          <View className="w-full h-64 bg-gray-200 rounded-lg items-center justify-center">
            <Text className="text-gray-500">No image available</Text>
          </View>
        )}
      </View>

      <Modal visible={isModalVisible} transparent={true} animationType="fade">
        <View className="flex-1 bg-black/90 justify-center items-center">
          <TouchableOpacity 
            className="absolute top-10 right-5 z-10 p-2"
            onPress={() => setIsModalVisible(false)}
          >
            <Text className="text-white text-lg font-bold">Close ✕</Text>
          </TouchableOpacity>
          {actualImageUrl && (
            <Image
              source={{ uri: `${actualImageUrl}?v=${imageVersion}` }}
              className="w-full h-5/6"
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      <View className="bg-amber-50 p-4 rounded-xl mt-6 mb-4 border border-amber-100 shadow-sm">
        <Text className="font-bold text-amber-900 mb-3 text-lg">📅 Calendar Date Settings</Text>
        
        <Text className="text-amber-800 font-bold mb-1">Gregorian Date (YYYY-MM-DD)</Text>
        <TextInput 
          className="border border-amber-200 rounded p-3 mb-3 bg-white text-base font-bold text-gray-800"
          placeholder="e.g. 2026-08-09"
          value={gregorianDate}
          onChangeText={handleGregorianDateChange}
          autoCapitalize="none"
        />

        <Text className="text-amber-800 font-bold mb-1">Tamil Date (YYYY-MM-DD)</Text>
        <TextInput 
          className="border border-amber-200 rounded p-3 bg-white text-base font-bold text-gray-800"
          placeholder="e.g. 2026-04-01"
          value={tamilDate}
          onChangeText={setTamilDate}
          autoCapitalize="none"
        />
      </View>

      <View className="mb-10">
        {!isVideoReady ? (
          <TouchableOpacity 
            className={`p-3 rounded-lg w-full items-center ${canRenderVideo ? 'bg-green-600' : 'bg-gray-400'}`}
            onPress={() => triggerGeneration('video', { startDate: gregorianDate, tamilDate: tamilDate })}
            disabled={!canRenderVideo}
          >
            <Text className="text-white font-bold text-center">Render Video</Text>
          </TouchableOpacity>
        ) : (
          <View className="space-y-3">
            <View className="flex-row justify-between space-x-2">
              <TouchableOpacity 
                className="flex-1 p-3 rounded-lg items-center bg-blue-600 flex-row justify-center space-x-2"
                onPress={() => openBrowserAsync(videoUrl)}
              >
                <Text className="text-white font-bold text-center">▶️ Play Video</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                className="bg-amber-600 rounded-lg p-3 items-center px-4 justify-center"
                onPress={() => triggerGeneration('video', { startDate: gregorianDate, tamilDate: tamilDate })}
              >
                <Text className="text-white font-bold text-center text-lg">🔄</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              className={`p-3 rounded-lg w-full items-center mt-3 flex-row justify-center space-x-2 ${isPublishing ? 'bg-gray-400' : 'bg-red-600'}`}
              onPress={publishToYouTube}
              disabled={isPublishing}
            >
              {isPublishing && <ActivityIndicator color="#fff" size="small" />}
              <Text className="text-white font-bold text-center">
                {isPublishing ? 'Publishing...' : 'Upload to YouTube'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {history.length > 0 && (
        <View className="bg-white p-4 rounded-xl mb-10 border border-gray-200 shadow-sm">
          <Text className="font-bold text-gray-900 text-lg mb-3">📜 Video & Publication History</Text>
          {history.map((item: any, idx: number) => {
            const itemVideoUrl = item.video_path ? `${apiUrl}${item.video_path}` : null;
            const isPub = item.status === 'published';

            return (
              <View key={item.id || idx} className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-2 flex-row justify-between items-center">
                <View className="flex-1 mr-2">
                  <View className="flex-row items-center mb-1">
                    <Text className={`text-xs font-bold px-2 py-0.5 rounded-full mr-2 ${isPub ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {isPub ? '🔴 YouTube Uploaded' : '📹 Video Rendered'}
                    </Text>
                  </View>
                  <Text className="text-gray-800 font-semibold text-sm">
                    📅 Eng: {item.date || 'N/A'}
                  </Text>
                  <Text className="text-gray-600 text-xs mt-0.5">
                    🗓️ Tamil: {item.tamil_date || 'N/A'}
                  </Text>
                </View>

                {itemVideoUrl && (
                  <TouchableOpacity 
                    className="bg-blue-600 px-3 py-2 rounded-lg items-center justify-center flex-row space-x-1"
                    onPress={() => openBrowserAsync(itemVideoUrl)}
                  >
                    <Text className="text-white font-bold text-xs">▶️ Play</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={!!activeTask} transparent={true} animationType="fade">
        <View className="flex-1 bg-black/75 justify-center items-center p-4">
          <View className="bg-white rounded-2xl p-6 w-5/6 items-center shadow-2xl border border-gray-100">
            <ActivityIndicator size="large" color="#3b82f6" className="mb-4" />
            <Text className="text-gray-900 font-bold text-lg mb-1 text-center">
              {activeTask?.title}
            </Text>
            <Text className="text-gray-500 text-sm mb-6 text-center">
              Please wait while this task completes...
            </Text>
            <TouchableOpacity 
              className="bg-red-500 py-3 px-8 rounded-full items-center shadow-sm active:bg-red-600"
              onPress={stopTask}
            >
              <Text className="text-white font-bold text-base">Abort Task</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}
