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
    const { execSync } = require('child_process');
    const ffmpegPath = getFfmpegPath();
        
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
  let forceAudio = argv['force-audio'] === true || argv['force-audio'] === 'true';
  let forceImage = argv['force-image'] === true || argv['force-image'] === 'true';
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
      const kural = !isNaN(testKural) 
        ? kuralSelector.selectSpecificKural(testKural) 
        : kuralSelector.selectNextKural(stateManager);
      const adhikaaram = KuralSelector.getAdhikaaramNumber(kural.Number);
      
      console.log(`Selected Kural ${kural.Number} (Adhikaaram ${adhikaaram})${!isNaN(testKural) ? ' [TEST MODE]' : ''}`);

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

      const generateTTSIfNeeded = async () => {
        if ((!fs.existsSync(meaningAudioPath) || useTts) && kural.tdk) {
          console.log(`TTS meaning audio missing or forced via --use-tts. Generating for Kural ${kural.Number}...`);
          
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
          
          await writeFile(tmpTa, taResponse.audioContent, 'binary');
          await writeFile(tmpEn, enResponse.audioContent, 'binary');
          
          let targetLoudness = -16.0;
          if (fs.existsSync(kuralAudioPath)) {
            const detected = getAudioLoudness(kuralAudioPath);
            if (detected !== null) targetLoudness = detected;
          }
          
          const { execSync } = require('child_process');
          const ffmpegPath = getFfmpegPath();
          
          console.log(`Normalizing both languages to ${targetLoudness} LUFS and concatenating...`);
          const filterComplex = `[0:a]loudnorm=I=${targetLoudness}:TP=-1.5:LRA=11,apad=pad_dur=1[a0];[1:a]loudnorm=I=${targetLoudness}:TP=-1.5:LRA=11[a1];[a0][a1]concat=n=2:v=0:a=1[out]`;
          
          execSync(`"${ffmpegPath}" -y -i "${tmpTa}" -i "${tmpEn}" -filter_complex "${filterComplex}" -map "[out]" "${meaningAudioPath}"`);
          
          fs.unlinkSync(tmpTa);
          fs.unlinkSync(tmpEn);
          
          console.log(`Saved generated and normalized TTS audio to ${meaningAudioPath}`);
        }
      };

      // --- NEW LOGIC: Loop Audio/Image Generator until files exist ---
      let assetsReady = false;
      let attempts = 0;
      const MAX_ATTEMPTS = 5;
      const { execSync } = require('child_process');
      const generatorDir = path.join(process.cwd(), '../kural-audio-generator');
      
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
        
        // Either the split kural audio exists, OR the legacy combined audio exists.
        const audioExists = fs.existsSync(kuralAudioPath) || fs.existsSync(combinedAudioPath);
        
        if (!forceAudio && !audioExists && fs.existsSync(masterAudioPath)) {
          const readline = require('readline');
          const splitInput = await new Promise<string>((resolve) => {
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
            execSync(`"${ffmpegPath}" -y -i "${masterAudioPath}" -t ${splitPoint} -c copy "${kuralAudioPath}"`, { stdio: 'ignore' });
            execSync(`"${ffmpegPath}" -y -i "${masterAudioPath}" -ss ${splitPoint} -c copy "${meaningAudioPath}"`, { stdio: 'ignore' });
            console.log(`Successfully split audio!`);
            continue;
          } else {
            console.log("Invalid split point. Please enter a number or 'r'.");
            continue;
          }
        }
        
        if (imageExists && audioExists && !forceRegenerate && !forceAudio && !forceImage) {
          const readline = require('readline');

          if (!useTts && fs.existsSync(meaningAudioPath)) {
            const ttsChoice = await new Promise<boolean>((resolve) => {
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              rl.question(`\nQC Check: Is the AI-generated meaning audio acceptable? (If 'n', Google TTS will be used instead) [Y/n]: `, (answer: string) => {
                rl.close();
                const ans = answer.trim().toLowerCase();
                resolve(ans === '' || ans === 'y' || ans === 'yes');
              });
            });
            
            if (!ttsChoice) {
              console.log("User rejected AI meaning. Overwriting with Google TTS...");
              useTts = true;
            }
          }

          await generateTTSIfNeeded();

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
          // If this is a retry attempt (attempts > 1), we should forcefully regenerate audio
          // because the previous attempt clearly failed to produce the split files (e.g. no silence detected).
          if (attempts > 1) {
             console.log(`Retry attempt ${attempts}. Forcing audio regeneration to fix broken state...`);
             forceAudio = true;
          }
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
        console.log(`Auto-splitting first 15 seconds from combined audio for Kural ${kural.Number}...`);
        const { execSync } = require('child_process');
        const ffmpegPath = getFfmpegPath();
        execSync(`"${ffmpegPath}" -y -i "${combinedAudioPath}" -t 15 -c copy "${kuralAudioPath}"`);
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

      console.log('Bundling Remotion project...');
      const bundled = await bundle(path.join(process.cwd(), 'src/video/index.ts'), () => undefined, {
        webpackOverride: (config) => config,
        publicDir: path.join(process.cwd(), '../../public')
      });

      console.log('Rendering Final Daily Video...');
      const totalFrames = 90 + part2Frames + part3Frames + 90; // part1 + part2 + part3 + part4
      
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

      const mainProps = {
        dateStr,
        tamilYear: tYear,
        tamilMonth: tMonth,
        tamilDay: currentTDay,
        part2Duration: part2Frames,
        part3Duration: part3Frames,
        kuralProps,
        meaningProps,
        theme: selectedTheme
      };
      
      const compositions = await getCompositions(bundled, { inputProps: mainProps });
      const mainComp = compositions.find((c) => c.id === 'ThirukkuralShort');
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

      console.log(`Saved Final Video to ${finalVideoPath}`);

      stateManager.addRecord({
        date: dateStr,
        kuralNumber: kural.Number,
        adhikaaramNumber: adhikaaram
      });

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
