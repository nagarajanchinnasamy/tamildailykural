import minimist from 'minimist';
import { StateManager } from './state';
import { KuralSelector } from './kuralSelector';
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';
import { getAudioDurationInSeconds } from 'get-audio-duration';
import textToSpeech from '@google-cloud/text-to-speech';
import util from 'util';
import { THEMES } from './video/theme';
import { execSync } from 'child_process';

const ttsClient = new textToSpeech.TextToSpeechClient({
  keyFilename: path.join(process.cwd(), '../../credentials.json'),
});

function getFfmpegPath(): string {
  try {
    return require('ffmpeg-static');
  } catch (err) {
    console.error("Could not find ffmpeg-static. Falling back to system ffmpeg.", err);
    return 'ffmpeg';
  }
}

function getAudioLoudness(audioPath: string): number | null {
  try {
    const ffmpegPath = getFfmpegPath();
    execSync(`"${ffmpegPath}" -version`, { stdio: 'ignore' });
        
    const out = execSync(`"${ffmpegPath}" -i "${audioPath}" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null /dev/null 2>&1`).toString();
    const match = out.match(/\{\s*"input_i".*?\}/s);
    if (match) {
      const data = JSON.parse(match[0]);
      return parseFloat(data.input_i);
    }
  } catch (e) {
    console.warn(`Failed to measure loudness for ${audioPath}`);
  }
  return null;
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const startDateStr = argv['start-date'];
  const tamilDateArg = argv['tamil-date'];
  let days = parseInt(argv['days'], 10);
  const testKural = parseInt(argv['kural'], 10);
  const themeArg = argv['theme'];
  const personaArg = argv['persona'] || 'Leda';
  let forceRegenerate = argv['force-regenerate'] === true || argv['force-regenerate'] === 'true' || argv['force'] === true || argv['force'] === 'true';
  let forceAudio = argv['force-audio'] === true || argv['force-audio'] === 'true' || forceRegenerate;
  let forceImage = argv['force-image'] === true || argv['force-image'] === 'true' || forceRegenerate;
  let useTts = argv['use-tts'] === true || argv['use-tts'] === 'true';

  if (!startDateStr || isNaN(days) || !tamilDateArg) {
    console.error("Usage: npm start -- --start-date=YYYY-MM-DD --tamil-date=YYYY-MM-DD --days=N [--kural=N] [--theme=theme_name]");
    process.exit(1);
  }

  const [tYearStr, tMonthStr, tDayStr] = tamilDateArg.split('-');
  const tYear = parseInt(tYearStr, 10);
  const tMonth = parseInt(tMonthStr, 10);
  const startTDay = parseInt(tDayStr, 10);

  if (isNaN(tYear) || isNaN(tMonth) || isNaN(startTDay)) {
    console.error("Invalid --tamil-date format. Must be YYYY-MM-DD");
    process.exit(1);
  }

  const dataDir = path.join(process.cwd(), '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const stateManager = new StateManager();
  const statePath = path.join(dataDir, 'state.json');
  
  if (fs.existsSync(statePath)) {
    try {
      const stateData = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      (stateManager as any).state = stateData;
    } catch (err) {
      console.warn("Could not parse state.json. Starting fresh.");
    }
  }

  const kuralSelector = new KuralSelector();
  let currentDate = new Date(startDateStr);

  for (let i = 0; i < days; i++) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const yyyyMm = dateStr.substring(0, 7);
    console.log(`\n=== Generating for ${dateStr} ===`);

    try {
      let kural = !isNaN(testKural) 
        ? kuralSelector.selectSpecificKural(testKural) 
        : kuralSelector.selectNextKural(stateManager);
      const adhikaaram = KuralSelector.getAdhikaaramNumber(kural.Number);
      
      console.log(`Selected Kural ${kural.Number} (Adhikaaram ${adhikaaram})${!isNaN(testKural) ? ' [TEST MODE]' : ''}`);

      console.log(`\n--- Ensuring Translations for Kural ${kural.Number} ---`);
      const publisherDir = path.join(process.cwd(), '../youtube-publisher');
      const dataPath = path.join(process.cwd(), '../../data/thirukkural.json');
      if (fs.existsSync(publisherDir)) {
        try {
          execSync(`npm run translate -- --kural=${kural.Number}`, { cwd: publisherDir, stdio: 'inherit' });
          // Reload JSON from disk so Remotion sees the newly added regional meanings
          const updatedRawData = fs.readFileSync(dataPath, 'utf8');
          const updatedThirukkuralData = JSON.parse(updatedRawData);
          const updatedKurals = updatedThirukkuralData.kural || updatedThirukkuralData;
          kural = updatedKurals.find((k: any) => k.Number === kural.Number);
        } catch (err) {
          console.warn('Failed to run translation sync script:', err);
        }
      }

      const adhikaaramStr = `Adhikaaram_${adhikaaram.toString().padStart(4, '0')}`;
      const kuralStr = `Kural_${kural.Number.toString().padStart(4, '0')}`;
      const publicDir = path.join(process.cwd(), '../../public');
      const kuralDir = path.join(publicDir, 'Kurals', adhikaaramStr, kuralStr);
      const relativeKuralDir = `Kurals/${adhikaaramStr}/${kuralStr}`;
      const prefix = kural.Number.toString().padStart(4, '0');
      const kuralAudioPath = path.join(kuralDir, `${prefix}_kural_audio.mp3`);
      const masterAudioPath = path.join(kuralDir, `${prefix}_master_audio.mp3`);
      const meaningAudioPath = path.join(kuralDir, `${prefix}_meaning_audio.mp3`);
      const combinedAudioPath = path.join(kuralDir, `${prefix}_kural_meaning_audio.mp3`);

      const aiMeaningAudioPath = path.join(kuralDir, `${prefix}_ai_meaning_audio.mp3`);
      const ttsMeaningAudioPath = path.join(kuralDir, `${prefix}_tts_meaning_audio.mp3`);

      const generateTTS = async (targetPath: string) => {
        if (!fs.existsSync(targetPath) && kural.tdk) {
          console.log(`Generating Google TTS meaning audio for Kural ${kural.Number}...`);
          
          // Escape special characters for SSML
          const escapeXml = (unsafe: string) => unsafe.replace(/[<>&'"]/g, c => {
              switch (c) {
                  case '<': return '&lt;';
                  case '>': return '&gt;';
                  case '&': return '&amp;';
                  case '\'': return '&apos;';
                  case '"': return '&quot;';
                  default: return c;
              }
          });

          // Chirp3 provides the "feel" (human-like prosody) but struggles with comma pacing.
          // By replacing commas with em-dashes, we can trick the neural engine into taking 
          // a natural, connected pause without doing a hard disjointed breath.
          const processedTamil = escapeXml(kural.tdk).replace(/,/g, ' —');
          const processedEnglish = escapeXml(kural['tdk-explanation'] || kural.explanation).replace(/,/g, ' —');
          const taSsml = `<speak>${processedTamil}</speak>`;
          const enSsml = `<speak>${processedEnglish}</speak>`;

          const taRequest = {
            input: { ssml: taSsml },
            voice: { languageCode: 'ta-IN', name: `ta-IN-Chirp3-HD-${personaArg}` },
            audioConfig: { audioEncoding: 'MP3' as const, speakingRate: 0.80 },
          };
          const enRequest = {
            input: { ssml: enSsml },
            voice: { languageCode: 'en-IN', name: `en-IN-Chirp3-HD-${personaArg}` },
            audioConfig: { audioEncoding: 'MP3' as const, speakingRate: 0.80 },
          };
          
          const [taResponse] = await ttsClient.synthesizeSpeech(taRequest);
          const [enResponse] = await ttsClient.synthesizeSpeech(enRequest);
          
          const writeFile = util.promisify(fs.writeFile);
          const tmpTa = path.join(kuralDir, 'tmp_ta.mp3');
          const tmpEn = path.join(kuralDir, 'tmp_en.mp3');
          
          await writeFile(tmpTa, taResponse.audioContent || new Uint8Array(), 'binary');
          await writeFile(tmpEn, enResponse.audioContent || new Uint8Array(), 'binary');
          
          let targetLoudness = -16.0;
          const loudnessSource = fs.existsSync(kuralAudioPath) ? kuralAudioPath : masterAudioPath;
          if (fs.existsSync(loudnessSource)) {
            const detected = getAudioLoudness(loudnessSource);
            if (detected !== null) targetLoudness = detected;
          }
          
          const ffmpegPath = getFfmpegPath();
          
          console.log(`Normalizing both languages to ${targetLoudness} LUFS and concatenating...`);
          const filterComplex = `[0:a]loudnorm=I=${targetLoudness}:TP=-1.5:LRA=11,apad=pad_dur=1[a0];[1:a]loudnorm=I=${targetLoudness}:TP=-1.5:LRA=11[a1];[a0][a1]concat=n=2:v=0:a=1[out]`;
          
          execSync(`"${ffmpegPath}" -nostdin -y -i "${tmpTa}" -i "${tmpEn}" -filter_complex "${filterComplex}" -map "[out]" "${targetPath}"`);
          
          fs.unlinkSync(tmpTa);
          fs.unlinkSync(tmpEn);
          
          console.log(`Saved generated and normalized TTS audio to ${targetPath}`);
        }
      };

      if (argv['generate-tts-only']) {
        console.log("--generate-tts-only flag detected. Generating TTS and exiting.");
        await generateTTS(ttsMeaningAudioPath);
        process.exit(0);
      }

      // --- NEW LOGIC: Loop Audio/Image Generator until files exist ---
      let assetsReady = false;
      let attempts = 0;
      const MAX_ATTEMPTS = 5;
      const generatorDir = path.join(process.cwd(), '../kural-audio-generator');
      
      if (forceRegenerate || forceAudio) {
        if (fs.existsSync(kuralAudioPath)) fs.unlinkSync(kuralAudioPath);
        if (fs.existsSync(meaningAudioPath)) fs.unlinkSync(meaningAudioPath);
        if (fs.existsSync(aiMeaningAudioPath)) fs.unlinkSync(aiMeaningAudioPath);
        if (fs.existsSync(ttsMeaningAudioPath)) fs.unlinkSync(ttsMeaningAudioPath);
        if (fs.existsSync(combinedAudioPath)) fs.unlinkSync(combinedAudioPath);
      }

      if (useTts) {
        console.log("--use-tts flag detected. Forcing meaning audio to Google TTS...");
        await generateTTS(ttsMeaningAudioPath);
        if (fs.existsSync(ttsMeaningAudioPath)) {
          fs.copyFileSync(ttsMeaningAudioPath, meaningAudioPath);
          console.log("Successfully switched meaning audio to Google TTS!");
        }
      }
      
      while (!assetsReady) {
        const possibleExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
        let imageExists = false;
        if (fs.existsSync(kuralDir)) {
          for (const ext of possibleExtensions) {
            if (fs.existsSync(path.join(kuralDir, `${prefix}_kural_image${ext}`))) {
              imageExists = true;
              break;
            }
          }
        }
        
        // Either the split kural audio exists AND meaning audio exists, OR the legacy combined audio exists.
        const audioExists = (fs.existsSync(kuralAudioPath) && fs.existsSync(meaningAudioPath)) || fs.existsSync(combinedAudioPath);
        
        if (!forceAudio && !audioExists && fs.existsSync(masterAudioPath)) {
          // Pre-generate TTS meaning audio so it's ready instantly
          await generateTTS(ttsMeaningAudioPath);

          const readline = require('readline');
          const splitInput = await new Promise<string>((resolve) => {
            if (process.env.NON_INTERACTIVE === 'true') return resolve('15');
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            rl.question(`\nQC Check: Master audio generated. Enter split point in seconds (e.g. 13.5), or type 'r' to reject and regenerate AI audio: `, (answer: string) => {
              rl.close();
              resolve(answer.trim().toLowerCase());
            });
          });

          if (splitInput === 'r') {
            console.log("User rejected master audio. Deleting and regenerating...");
            fs.unlinkSync(masterAudioPath);
            forceAudio = true;
            attempts = 0;
            continue;
          }

          const splitPoint = parseFloat(splitInput);
          if (!isNaN(splitPoint) && splitPoint > 0) {
            console.log(`Splitting master audio at ${splitPoint} seconds using ffmpeg...`);
            const ffmpegPath = getFfmpegPath();
            execSync(`"${ffmpegPath}" -nostdin -y -i "${masterAudioPath}" -t ${splitPoint} -c copy "${kuralAudioPath}"`, { stdio: 'inherit' });
            execSync(`"${ffmpegPath}" -nostdin -y -i "${masterAudioPath}" -ss ${splitPoint} -c copy "${aiMeaningAudioPath}"`, { stdio: 'inherit' });
            console.log(`Successfully split audio! AI meaning audio saved.`);
            
            // Prompt user to choose between the two meaning tracks
            const choice = await new Promise<string>((resolve) => {
              if (process.env.NON_INTERACTIVE === 'true') return resolve('2');
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              rl.question(`\nQC Check: Both AI and Google TTS meaning audios are ready. Which one should be used for the video? (1: AI, 2: TTS): `, (answer: string) => {
                rl.close();
                resolve(answer.trim());
              });
            });

            if (choice === '2' || choice.toLowerCase() === 'tts') {
               console.log("User selected Google TTS meaning. Copying to final destination...");
               fs.copyFileSync(ttsMeaningAudioPath, meaningAudioPath);
            } else {
               console.log("User selected AI meaning. Copying to final destination...");
               fs.copyFileSync(aiMeaningAudioPath, meaningAudioPath);
            }

            continue;
          } else {
            console.log("Invalid split point. Please enter a number or 'r'.");
            continue;
          }
        }
        
        if (imageExists && audioExists && !forceRegenerate && !forceAudio && !forceImage) {
          assetsReady = true;
          console.log(`\nAll required assets for Kural ${kural.Number} are present and approved!`);
          break;
        }

        attempts++;
        if (attempts > MAX_ATTEMPTS) {
          throw new Error(`Exceeded maximum retry attempts (${MAX_ATTEMPTS}) for Kural ${kural.Number}. Aborting.`);
        }

        console.log(`\n=======================================================`);
        console.log(`Starting Audio & Image Generator for Kural ${kural.Number} (Attempt ${attempts}/${MAX_ATTEMPTS})`);
        console.log(`Audio Exists: ${audioExists}, Image Exists: ${imageExists}`);
        console.log(`=======================================================\n`);
        
        try {
          let forceFlag = '';
          if (forceRegenerate) forceFlag += ' --force';
          if (forceAudio) forceFlag += ' --force-audio';
          if (forceImage) forceFlag += ' --force-image';
          execSync(`npm run start -- --kural=${kural.Number}${forceFlag}`, { 
            cwd: generatorDir, 
            stdio: 'inherit' 
          });
          console.log(`\nAudio/Image Generation process returned.`);
        } catch (err: any) {
          console.error(`Failed to run kural-audio-generator for Kural ${kural.Number}.`);
          if (err.signal === 'SIGINT' || err.status === 130) {
            console.log("Process interrupted by user (Ctrl+C). Aborting...");
            process.exit(1);
          }
        }
        
        forceRegenerate = false; 
        forceAudio = false;
        forceImage = false;
      }
      
      // Pause for permission
      const readline = require('readline');
      
      const proceed = await new Promise<boolean>((resolve) => {
        if (process.env.NON_INTERACTIVE === 'true') return resolve(true);
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question(`\nContinue with video rendering for Kural ${kural.Number}? [Y/n]: `, (answer: string) => {
          rl.close();
          const ans = answer.trim().toLowerCase();
          resolve(ans === '' || ans === 'y' || ans === 'yes');
        });
      });
      
      if (!proceed) {
        console.log(`Video rendering aborted by user for day ${dateStr}.`);
        break; // skip this iteration / stop the process
      }
      // --- END NEW LOGIC ---

      if (!fs.existsSync(kuralDir)) {
        throw new Error(`Folder for Kural ${kural.Number} not found locally at ${kuralDir}. Did the generator fail?`);
      }
      
      // Legacy split check
      if (!fs.existsSync(kuralAudioPath) && fs.existsSync(combinedAudioPath)) {
        console.log("\nNo split point matched... running split_audio.py logic");
        try {
          const ffmpegPath = getFfmpegPath();
          execSync(`"${ffmpegPath}" -nostdin -y -i "${combinedAudioPath}" -t 15 -c copy "${kuralAudioPath}"`);
        } catch (err) {
          console.warn('Legacy split failed:', err);
        }
      }

      const possibleExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
      let imagePath = '';
      for (const ext of possibleExtensions) {
        const testPath = path.join(kuralDir, `${prefix}_kural_image${ext}`);
        if (fs.existsSync(testPath)) {
          imagePath = testPath;
          break;
        }
      }
      
      if (!imagePath) {
        imagePath = path.join(kuralDir, `${prefix}_kural_image.png`); // Fallback default
      }

      let kuralDur = 15;
      let meaningDur = 20;
      if (fs.existsSync(kuralAudioPath)) kuralDur = await getAudioDurationInSeconds(kuralAudioPath);
      if (fs.existsSync(meaningAudioPath)) meaningDur = await getAudioDurationInSeconds(meaningAudioPath);

      const part2Frames = Math.ceil(kuralDur * 30) + 30; // audio + 1s buffer
      const part3Frames = Math.ceil(meaningDur * 30) + 30;

      const kuralProps = {
        title: kural.title,
        line1: kural.Line1,
        line2: kural.Line2,
        transliteration1: kural.transliteration1,
        transliteration2: kural.transliteration2,
        audioPath: fs.existsSync(kuralAudioPath) ? `${relativeKuralDir}/${prefix}_kural_audio.mp3` : undefined,
        imagePath: fs.existsSync(imagePath) ? `${relativeKuralDir}/${path.basename(imagePath)}` : undefined
      };

      const meaningProps = {
        title: kural.title,
        meaningTamil: kural.tdk,
        meaningEnglish: kural['tdk-explanation'] || kural.explanation,
        audioPath: fs.existsSync(meaningAudioPath) ? `${relativeKuralDir}/${prefix}_meaning_audio.mp3` : undefined,
        imagePath: fs.existsSync(imagePath) ? `${relativeKuralDir}/${path.basename(imagePath)}` : undefined
      };


      
      let selectedTheme = THEMES.indigo;
      if (themeArg && THEMES[themeArg]) {
        selectedTheme = THEMES[themeArg];
      } else {
        const themeKeys = Object.keys(THEMES);
        const randomKey = themeKeys[Math.floor(Math.random() * themeKeys.length)];
        selectedTheme = THEMES[randomKey];
        console.log(`No specific theme requested or invalid theme. Randomly selected theme: ${randomKey}`);
      }
      
      const currentTDay = startTDay + i;
      const tMonthStrPad = String(tMonth).padStart(2, '0');
      const currentTDayStrPad = String(currentTDay).padStart(2, '0');
      
      const tamilYm = `${tYear}-${tMonthStrPad}`;
      const tamilDateStr = `${tYear}-${tMonthStrPad}-${currentTDayStrPad}`;

      const dateObj = new Date(`${dateStr}T00:00:00`);
      const thiruvalluvarYear = tYear < 2050 ? tYear + 31 : tYear;

      // Calendar Audio Generation
      const calendarAudioDir = kuralDir;
      if (!fs.existsSync(calendarAudioDir)) {
        fs.mkdirSync(calendarAudioDir, { recursive: true });
      }
      const calendarAudioFileName = `${prefix}_calendar_audio.mp3`;
      const calendarAudioPath = path.join(calendarAudioDir, calendarAudioFileName);
      const relativeCalendarAudioPath = `${relativeKuralDir}/${calendarAudioFileName}`;

      if (!fs.existsSync(calendarAudioPath) || forceRegenerate) {
        console.log(`Generating TTS calendar audio for ${tamilDateStr}...`);
        
        const TAMIL_DAYS = [
          'ஞாயிறு', 'திங்கள்', 'செவ்வாய்', 'அறிவன்', 'வியாழன்', 'வெள்ளி', 'காரி'
        ];
        const dayOfWeek = TAMIL_DAYS[dateObj.getDay()];
        
        const TAMIL_MONTH_STARTS = [
          { name: 'சுறவம்', season: 'குளிர்', monthNum: 10 },
          { name: 'கும்பம்', season: 'பனி', monthNum: 11 },
          { name: 'மீனம்', season: 'நிறைபனி', monthNum: 12 },
          { name: 'மேழம்', season: 'சுடர்', monthNum: 1 },
          { name: 'விடை', season: 'அழல்', monthNum: 2 },
          { name: 'இரட்டை', season: 'வளி', monthNum: 3 },
          { name: 'கடகம்', season: 'முகில்', monthNum: 4 },
          { name: 'மடங்கல்', season: 'சாரல்', monthNum: 5 },
          { name: 'கன்னி', season: 'பெயல்', monthNum: 6 },
          { name: 'துலை', season: 'தாரை', monthNum: 7 },
          { name: 'நளி', season: 'பசுமை', monthNum: 8 },
          { name: 'சிலை', season: 'சீர்மை', monthNum: 9 }
        ];
        
        const PURE_TAMIL_YEARS = [
          'நற்றோன்றல்', 'உயர்தோன்றல்', 'வெள்ளொளி', 'பேருவகை', 'மக்கட்செல்வம்',
          'அயல்முனி', 'திருமுகம்', 'தோற்றம்', 'இளமை', 'மாழை',
          'ஈச்சுரம்', 'கூலவளம்', 'முதன்மை', 'நேர்நிரல்', 'விளைபயன்',
          'ஓவியக்கதிர்', 'நற்கதிர்', 'தாங்கெழில்', 'நிலவரையன்', 'விரிமாண்பு',
          'முற்றறிவு', 'முழுநிறைவு', 'தீர்பகை', 'வளமாற்றம்', 'செய்நேர்த்தி',
          'நற்குழவி', 'உயர்வாகை', 'வாகை', 'காதன்மை', 'வெம்முகம்',
          'பொற்றாடை', 'அட்டி', 'எழில்மாறல்', 'வீறியெழல்', 'கீழறை',
          'நற்செய்கை', 'மங்கலம்', 'பகைக்கோடு', 'உலக நிறைவு', 'அருள் தோற்றம்',
          'நச்சுப்புழை', 'பிணைவிரகு', 'அழகு', 'பொதுநிலை', 'இகல்வீறு',
          'கழிவிரக்கம்', 'நற்றலைமை', 'பெருமகிழ்ச்சி', 'பெருமறம்', 'தாமரை',
          'பொன்மை', 'கருமை வீச்சு', 'முன்னியமுடிதல்', 'அழலி', 'கொடுமதி',
          'பேரிகை', 'ஒடுங்கி', 'செம்மை', 'எதிரேற்றம்', 'வளங்கலன்'
        ];

        const gregorianYear = dateObj.getFullYear();
        const yearIndex = ((gregorianYear - 1987) % 60 + 60) % 60;
        const dynamicYearName = PURE_TAMIL_YEARS[yearIndex];
        const monthInfo = TAMIL_MONTH_STARTS.find(m => m.monthNum === tMonth) || TAMIL_MONTH_STARTS[0];
        const tamilMonthName = monthInfo.name;
        const tamilSeason = monthInfo.season;

        const calendarScript = `திருவள்ளுவர் ஆண்டு ${thiruvalluvarYear}, ${dynamicYearName}. திங்கள்: ${tamilMonthName}. நாள்: ${currentTDay}. கிழமை: ${dayOfWeek}. பருவம்: ${tamilSeason}.`;
        
        const escapeXml = (unsafe: string) => unsafe.replace(/[<>&'"]/g, c => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
        const processedTamil = escapeXml(calendarScript).replace(/,/g, ' —');
        const taSsml = `<speak>${processedTamil}</speak>`;
        
        const taRequest = {
          input: { ssml: taSsml },
          voice: { languageCode: 'ta-IN', name: `ta-IN-Chirp3-HD-${personaArg}` },
          audioConfig: { audioEncoding: 'MP3' as const, speakingRate: 0.80, volumeGainDb: 6.0 },
        };
        
        try {
          const [taResponse] = await ttsClient.synthesizeSpeech(taRequest);
          const writeFile = util.promisify(fs.writeFile);
          
          const rawTtsPath = path.join(calendarAudioDir, `${prefix}_calendar_tts_raw.mp3`);
          await writeFile(rawTtsPath, taResponse.audioContent || new Uint8Array(), 'binary');
          
          const bgmPath = path.join(process.cwd(), '../../public', 'bgm.mp3');
          if (fs.existsSync(bgmPath)) {
            const ffmpegPath = getFfmpegPath();
            console.log(`Mixing calendar TTS with BGM from ${bgmPath}...`);
            const ttsDur = await getAudioDurationInSeconds(rawTtsPath);
            const fadeOutStart = ttsDur + 2.5; // Starts fading exactly when speech ends

            // amix normally reduces volume by 1/n. We boost speech to 3.0.
            // adelay adds a 2.5 second intro of pure music before the speech starts.
            // apad adds 1.5 seconds of silence at the end of speech, so amix keeps BGM playing.
            // afade smoothly fades out the final 1.5 seconds of the mix.
            // -ss 24 starts the BGM from the 24th second.
            // We use an expression in the volume filter to start BGM at 1.0 volume, and duck it smoothly to 0.4 between 2.0s and 2.5s!
            execSync(`"${ffmpegPath}" -y -i "${rawTtsPath}" -ss 24 -stream_loop -1 -i "${bgmPath}" -filter_complex "[0:a]adelay=2500|2500,apad=pad_dur=1.5,volume=3.0[a0];[1:a]volume='1.0-0.6*clip((t-2.0)/0.5,0,1)':eval=frame[a1];[a0][a1]amix=inputs=2:duration=first,afade=t=out:st=${fadeOutStart}:d=1.5[aout]" -map "[aout]" -c:a libmp3lame "${calendarAudioPath}"`, { stdio: 'ignore' });
            fs.unlinkSync(rawTtsPath); // Clean up raw tts
            console.log(`Saved calendar audio with BGM to ${calendarAudioPath}`);
          } else {
            // No BGM, just rename raw to final
            fs.renameSync(rawTtsPath, calendarAudioPath);
            console.log(`Saved calendar audio (no BGM) to ${calendarAudioPath}`);
          }
        } catch (err) {
          console.error("Failed to generate calendar audio", err);
        }
      }

      let calendarDur = 3;
      if (fs.existsSync(calendarAudioPath)) {
         calendarDur = await getAudioDurationInSeconds(calendarAudioPath);
      }
      const part1Frames = Math.max(90, Math.ceil(calendarDur * 30) + 30);
      const part4Frames = 90;

      const mainProps = {
        dateStr,
        tamilYear: thiruvalluvarYear,
        tamilMonth: tMonth,
        tamilDay: currentTDay,
        part1Duration: part1Frames,
        part2Duration: part2Frames,
        part3Duration: part3Frames,
        part4Duration: part4Frames,
        kuralProps,
        meaningProps,
        theme: selectedTheme,
        calendarAudioPath: relativeCalendarAudioPath
      };

      console.log('Bundling Remotion project...');
      const bundled = await bundle(path.join(process.cwd(), 'src/video/index.ts'), () => undefined, {
        webpackOverride: (config) => config,
        publicDir: path.join(process.cwd(), '../../public')
      });
      
      console.log('Rendering Final Daily Video...');
      const compositions = await getCompositions(bundled, { inputProps: mainProps });
      const mainComp = compositions.find((c) => c.id === 'ThirukkuralShort');
      
      const totalFrames = part1Frames + part2Frames + part3Frames + part4Frames;
      mainComp!.durationInFrames = totalFrames;

      const dailyVideosDir = path.join(dataDir, 'Daily_Videos', tamilYm);
      if (!fs.existsSync(dailyVideosDir)) {
        fs.mkdirSync(dailyVideosDir, { recursive: true });
      }

      const finalVideoPath = path.join(dailyVideosDir, `${tamilDateStr}_${prefix}_final_video.mp4`);
      await renderMedia({
        composition: mainComp!,
        serveUrl: bundled,
        codec: 'h264',
        outputLocation: finalVideoPath,
        inputProps: mainProps,
      });

      console.log(`Saved Remotion Video to ${finalVideoPath}`);

      const ffmpegPath = getFfmpegPath();

      // Extract perfect thumbnail from the clean Remotion output (1s mark avoids any fade-ins)
      const thumbnailPath = path.join(dailyVideosDir, `${tamilDateStr}_${prefix}_thumbnail.jpg`);
      console.log('Extracting clean calendar thumbnail...');
      try {
        execSync(`"${ffmpegPath}" -nostdin -y -ss 00:00:01 -i "${finalVideoPath}" -vframes 1 -q:v 2 "${thumbnailPath}"`, { stdio: 'ignore' });
        console.log(`Saved thumbnail to ${thumbnailPath}`);
      } catch (err) {
        console.warn('Failed to extract thumbnail during rendering:', err);
      }

      const introVideoPath = path.resolve(process.cwd(), '../../public/Daily Kural Intro.mp4');
      if (fs.existsSync(introVideoPath)) {
        console.log('Stitching Intro Video...');
        const tempFinalPath = finalVideoPath.replace('.mp4', '_remotion_output.mp4');
        fs.renameSync(finalVideoPath, tempFinalPath);
        
        
        // Use a highly robust filter_complex that normalizes resolution, aspect ratio, and framerate 
        // before concatenating. This prevents the "video freezes but audio plays" issue caused by mismatched timebases.
        const filter = `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];` +
                       `[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];` +
                       `[v0][0:a:0][v1][1:a:0]concat=n=2:v=1:a=1[v][a]`;
                       
        execSync(`"${ffmpegPath}" -nostdin -y -i "${introVideoPath}" -i "${tempFinalPath}" -filter_complex "${filter}" -map "[v]" -map "[a]" -c:v libx264 -c:a aac "${finalVideoPath}"`, { stdio: 'ignore' });
        console.log('Intro video stitched successfully (re-encoded to guarantee playback compatibility)!');
        
        fs.unlinkSync(tempFinalPath);
      }

      stateManager.addRecord({
        date: dateStr,
        kuralNumber: kural.Number,
        adhikaaramNumber: adhikaaram
      });

      let shouldPublish = false;
      if (argv['publish'] === true || argv['publish'] === 'true') {
        shouldPublish = true;
      } else {
        const readline = require('readline');
        const publishInput = await new Promise<string>((resolve) => {
          if (process.env.NON_INTERACTIVE === 'true') return resolve('n');
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          rl.question(`\nPublish Kural ${kural.Number} to YouTube? (y/N): `, (answer: string) => {
            rl.close();
            resolve(answer.trim().toLowerCase());
          });
        });
        if (publishInput === 'y' || publishInput === 'yes') {
          shouldPublish = true;
        }
      }

      if (shouldPublish) {
        console.log('\n--- Publishing to YouTube ---');
        const publisherDir = path.join(process.cwd(), '../youtube-publisher');
        if (fs.existsSync(publisherDir)) {
          // Using stdio: inherit to allow the user to see the OAuth prompt if needed
          execSync(`npm start -- --date="${dateStr}" --tamil-date="${tamilDateArg}" --kural=${kural.Number}`, { cwd: publisherDir, stdio: 'inherit' });
        } else {
          console.error(`Publisher directory not found at ${publisherDir}`);
        }
      } else {
        console.log('\nSkipping publishing.');
      }

    } catch (err) {
      console.error(`Error on day ${dateStr}:`, err);
      break;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log('\nSaving state locally...');
  fs.writeFileSync(statePath, JSON.stringify(stateManager.getState(), null, 2));
  
  console.log('Done!');
}

main().catch(console.error);
