import minimist from 'minimist';
import { StateManager } from './state';
import { KuralSelector } from './kuralSelector';
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';
import { getAudioDurationInSeconds } from 'get-audio-duration';

async function main() {
  const argv = minimist(process.argv.slice(2));
  const startDateStr = argv['start-date'];
  let days = parseInt(argv['days'], 10);
  const testKural = parseInt(argv['test-kural'], 10);

  if (!startDateStr || isNaN(days)) {
    console.error("Usage: npm start -- --start-date=YYYY-MM-DD --days=N [--test-kural=N]");
    process.exit(1);
  }

  const dataDir = path.join(process.cwd(), 'data');
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

  console.log('Bundling Remotion project...');
  const bundled = await bundle(path.join(process.cwd(), 'src/video/index.ts'), () => undefined, {
    webpackOverride: (config) => config,
  });

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
      const publicDir = path.join(process.cwd(), 'public');
      const kuralDir = path.join(publicDir, 'Kurals', adhikaaramStr, kuralStr);
      const relativeKuralDir = `Kurals/${adhikaaramStr}/${kuralStr}`;

      if (!fs.existsSync(kuralDir)) {
        throw new Error(`Folder for Kural ${kural.Number} not found locally at ${kuralDir}`);
      }

      const prefix = kural.Number.toString().padStart(4, '0');
      const kuralAudioPath = path.join(kuralDir, `${prefix}_kural_audio.mp3`);
      const meaningAudioPath = path.join(kuralDir, `${prefix}_meaning_audio.mp3`);
      
      let imagePath = path.join(kuralDir, `${prefix}_kural_image.png`);
      if (!fs.existsSync(imagePath)) {
        imagePath = path.join(kuralDir, `${prefix}_kural_image.jpg`);
      }

      let kuralDur = 15;
      let meaningDur = 20;
      if (fs.existsSync(kuralAudioPath)) kuralDur = await getAudioDurationInSeconds(kuralAudioPath);
      if (fs.existsSync(meaningAudioPath)) meaningDur = await getAudioDurationInSeconds(meaningAudioPath);

      const part2Frames = Math.ceil(kuralDur * 30) + 30; // audio + 1s buffer
      const part3Frames = Math.ceil(meaningDur * 30) + 30;

      const kuralProps = {
        title: KuralSelector.getShortTitle(kural),
        line1: kural.Line1,
        line2: kural.Line2,
        transliteration1: kural.transliteration1,
        transliteration2: kural.transliteration2,
        audioPath: fs.existsSync(kuralAudioPath) ? `${relativeKuralDir}/${prefix}_kural_audio.mp3` : undefined,
        imagePath: fs.existsSync(imagePath) ? `${relativeKuralDir}/${path.basename(imagePath)}` : undefined
      };

      const meaningProps = {
        title: KuralSelector.getShortTitle(kural),
        meaning: kural.mv,
        translation: kural.Translation,
        audioPath: fs.existsSync(meaningAudioPath) ? `${relativeKuralDir}/${prefix}_meaning_audio.mp3` : undefined,
        imagePath: fs.existsSync(imagePath) ? `${relativeKuralDir}/${path.basename(imagePath)}` : undefined
      };

      console.log('Rendering Final Daily Video...');
      const totalFrames = 90 + part2Frames + part3Frames + 90; // part1 + part2 + part3 + part4
      const mainProps = {
        dateStr,
        part2Duration: part2Frames,
        part3Duration: part3Frames,
        kuralProps,
        meaningProps
      };
      
      const compositions = await getCompositions(bundled, { inputProps: mainProps });
      const mainComp = compositions.find((c) => c.id === 'ThirukkuralShort');
      mainComp!.durationInFrames = totalFrames;

      const dailyVideosDir = path.join(dataDir, 'Daily_Videos', yyyyMm);
      if (!fs.existsSync(dailyVideosDir)) {
        fs.mkdirSync(dailyVideosDir, { recursive: true });
      }

      const finalVideoPath = path.join(dailyVideosDir, `${prefix}_final_video_${dateStr}.mp4`);
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
