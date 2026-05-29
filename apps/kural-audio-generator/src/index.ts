import puppeteer from 'puppeteer-core';
import minimist from 'minimist';
import fs from 'fs';
import path from 'path';

async function run() {
  const argv = minimist(process.argv.slice(2));
  const kuralNumber = parseInt(argv['kural'], 10);
  const force = argv['force'] === true || argv['force'] === 'true';
  const mood = argv['mood'];

  if (isNaN(kuralNumber)) {
    console.error("Usage: npm start -- --kural=N [--force] [--mood=M]");
    process.exit(1);
  }

  const dataDir = path.resolve(__dirname, '../../../data');
  const thirukkuralPath = path.join(dataDir, 'thirukkural.json');
  
  if (!fs.existsSync(thirukkuralPath)) {
    console.error(`Database not found at ${thirukkuralPath}`);
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(thirukkuralPath, 'utf8'));
  const kural = db.kural.find((k: any) => k.Number === kuralNumber);

  if (!kural) {
    console.error(`Kural ${kuralNumber} not found.`);
    process.exit(1);
  }

  // Calculate adhikaaram (integer division by 10, ceiling)
  const adhikaaram = Math.ceil(kuralNumber / 10);
  const adhikaaramStr = `Adhikaaram_${adhikaaram.toString().padStart(4, '0')}`;
  const kuralStr = `Kural_${kural.Number.toString().padStart(4, '0')}`;
  
  const publicDir = path.resolve(__dirname, '../../../public');
  const kuralDir = path.join(publicDir, 'Kurals', adhikaaramStr, kuralStr);
  const kuralAudioOutPath = path.join(kuralDir, `${kuralStr.replace('Kural_', '')}_kural_audio.mp3`);
  const meaningAudioOutPath = path.join(kuralDir, `${kuralStr.replace('Kural_', '')}_meaning_audio.mp3`);

  if (!fs.existsSync(kuralDir)) {
    fs.mkdirSync(kuralDir, { recursive: true });
  }

  let needsVerse = true;
  if (fs.existsSync(kuralAudioOutPath) && !force) {
    console.log(`Verse audio already exists at ${kuralAudioOutPath}. Skipping verse generation...`);
    needsVerse = false;
  }

  let needsMeaning = true;
  if (fs.existsSync(meaningAudioOutPath) && !force) {
    console.log(`Meaning audio already exists at ${meaningAudioOutPath}. Skipping meaning generation...`);
    needsMeaning = false;
  }

  if (force) {
    const existingFiles = fs.readdirSync(kuralDir);
    for (const f of existingFiles) {
      if (f.endsWith('.mp3') || f.endsWith('.wav')) {
        fs.unlinkSync(path.join(kuralDir, f));
      }
    }
  }

  if (!needsVerse && !needsMeaning) {
    console.log("Both verse and meaning audio already exist. Exiting.");
    return;
  }

  // Generate word split (fallback if kural.split doesn't exist)
  const splitLine = (line: string) => {
    const words = line.trim().split(' ');
    const groups = [];
    for (let i = 0; i < words.length; i += 2) {
      groups.push(words.slice(i, i + 2).join(' '));
    }
    return groups.join('\n');
  };

  const wordSplit = Array.isArray(kural.split) 
    ? kural.split.join('\n') 
    : `${splitLine(kural.Line1)}\n${splitLine(kural.Line2)}`;

  const finalMood = mood || kural.mood;
  const moodInstruction = finalMood 
    ? `IMPORTANT MOOD INSTRUCTION: You must strictly set the musical style and background music (BGM) to: "${finalMood}". Do not use any other tone.`
    : `IMPORTANT MOOD INSTRUCTION: Analyze the English and Tamil meanings of this Kural. Set the musical style and background instruments to perfectly match its emotional tone. If the Kural discusses suffering, famine, or gives a stern warning, use a solemn, slow, and contemplative melody. If it discusses virtue or joy, use an uplifting tone.`;

  const versePrompt = `குறள்:\n\n${kural.Line1}\n${kural.Line2}\n\nWord split:\n\n${wordSplit}\n\n${moodInstruction}\n\nGenerate a 15 to 30 seconds beautiful song for this குறள் verse. Focus entirely on making the music match the mood.`;
  const meaningPrompt = `Tamil Meaning:\n${kural.tdk}\n\nEnglish Meaning:\n${kural['tdk-explanation']}\n\n${moodInstruction}\n\nGenerate a 30 second voice-over narration for this. DO NOT SING. Speak the meanings clearly like a storyteller. Include background music (BGM) that perfectly matches the mood.`;

  console.log("Launching dedicated Chrome instance...");
  let browser;
  try {
    const profilePath = path.resolve(__dirname, '../../../.gemini_chrome_profile');
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      userDataDir: profilePath,
      headless: false, 
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-blink-features=AutomationControlled'
      ]
    });
  } catch (e) {
    console.error("Failed to launch Chrome:", e);
    process.exit(1);
  }

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  
  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: kuralDir,
  });

  async function generateAudio(prompt: string, outputPath: string, label: string) {
    console.log(`\n=======================================================`);
    console.log(`GENERATING: ${label}`);
    console.log(`=======================================================\n`);

    // Always navigate fresh to reset the chat state and avoid duplicate download buttons
    await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });

    if (label === 'Verse') {
      console.log("WAITING FOR LOGIN:");
      console.log("If you are not logged in, please log in now in the browser.");
      console.log("Once you are fully logged in and on the Gemini chat page,");
      console.log("press ENTER in this terminal to continue...\n");

      await new Promise<void>((resolve) => {
        const rl = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question('Press ENTER when ready...', () => {
          rl.close();
          resolve();
        });
      });
    }

    console.log(`Entering ${label} prompt...`);
    const inputSelector = 'rich-textarea';
    await page.waitForSelector(inputSelector, { timeout: 0 });
    await page.focus(inputSelector);

    await page.evaluate((text: string) => {
      document.execCommand('insertText', false, text);
    }, prompt);

    await new Promise(r => setTimeout(r, 500));
    console.log("Submitting prompt...");
    await page.keyboard.press('Enter');
    console.log("Waiting for generation to complete (this can take up to 3 minutes)...");
    
    try {
      const btnHandle = await page.waitForFunction(() => {
        const elements = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        return elements.find(b => {
          const text = b.textContent?.toLowerCase() || '';
          const aria = b.getAttribute('aria-label')?.toLowerCase() || '';
          const tooltip = b.getAttribute('data-tooltip')?.toLowerCase() || '';
          return text.includes('download') || aria.includes('download') || tooltip.includes('download');
        });
      }, { timeout: 180000 }); 
      
      console.log(`${label} Generation complete! Hovering over media card...`);
      const element = btnHandle.asElement();
      if (element) {
        const containerHandle = await page.evaluateHandle((el) => {
          let parent = el.parentElement;
          while (parent && parent.getBoundingClientRect().width < 150) {
            parent = parent.parentElement;
          }
          return parent || el;
        }, element);
        
        const containerEl = containerHandle.asElement();
        if (containerEl) {
          await containerEl.hover().catch(() => console.log("Could not hover container"));
          await new Promise(r => setTimeout(r, 1000));
        }
        
        console.log("Clicking download button natively...");
        await element.click().catch(async (e) => {
          console.log("Native click failed, attempting forceful JS click fallback...");
          await page.evaluate((el: HTMLElement) => el.click(), element);
        });

        console.log("Waiting for the download menu to open...");
        const mp3OptionHandle = await page.waitForFunction(() => {
          const allElements = Array.from(document.querySelectorAll('*'));
          const matches = allElements.filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'BODY' || el.tagName === 'HTML') return false;
            return text.includes('audio only') || text.includes('mp3 track');
          });
          
          if (matches.length > 0) return matches[matches.length - 1];
          return null;
        }, { timeout: 5000 }).catch(() => null);

        if (mp3OptionHandle) {
          console.log("Menu found! Clicking 'Audio only (MP3 track)'...");
          await page.evaluate((el: HTMLElement) => {
            const clickable = el.closest('li, div[role="menuitem"], div[role="button"]') || el;
            (clickable as HTMLElement).click();
          }, mp3OptionHandle);
        } else {
          console.log("Could not find the 'Audio only' menu option. Maybe it started downloading directly?");
        }
      }

      console.log(`Waiting for file to be saved in ${kuralDir}...`);
      let downloadedFile = '';
      for (let i = 0; i < 60; i++) { 
        const files = fs.readdirSync(kuralDir);
        // Find a newly created MP3 that doesn't match our specific outpaths yet, or one that was just renamed by chrome
        const audioFile = files.find(f => f.endsWith('.mp3') && !f.endsWith('_kural_audio.mp3') && !f.endsWith('_meaning_audio.mp3'));
        if (audioFile && !audioFile.includes('.crdownload')) {
          downloadedFile = path.join(kuralDir, audioFile);
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }

      if (downloadedFile) {
        fs.renameSync(downloadedFile, outputPath);
        console.log(`Successfully saved ${label} audio to ${outputPath}`);
      } else {
        console.log(`Could not detect the downloaded ${label} file automatically. Please check the folder.`);
      }
    } catch (e) {
      console.error(`Timeout waiting for ${label} audio generation. It took longer than 3 minutes or failed.`);
    }
  }

  if (needsVerse) {
    await generateAudio(versePrompt, kuralAudioOutPath, 'Verse');
  }

  if (needsMeaning) {
    await generateAudio(meaningPrompt, meaningAudioOutPath, 'Meaning');
  }

  console.log("\n=======================================================");
  console.log("ALL GENERATION COMPLETE!");
  console.log("=======================================================\n");

  await browser.close();
}

run().catch(console.error);
