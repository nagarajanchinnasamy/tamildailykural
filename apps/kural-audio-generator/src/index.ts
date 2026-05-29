import puppeteer from 'puppeteer-core';
import minimist from 'minimist';
import fs from 'fs';
import path from 'path';

async function run() {
  const argv = minimist(process.argv.slice(2));
  const kuralNumber = parseInt(argv['kural'], 10);
  const force = argv['force'] === true || argv['force'] === 'true';

  if (isNaN(kuralNumber)) {
    console.error("Usage: npm start -- --kural=N [--force]");
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
  const audioOutPath = path.join(kuralDir, `${kuralStr.replace('Kural_', '')}_kural_meaning_audio.mp3`);

  if (!fs.existsSync(kuralDir)) {
    fs.mkdirSync(kuralDir, { recursive: true });
  }

  if (fs.existsSync(audioOutPath) && !force) {
    console.log(`Audio file already exists at ${audioOutPath}. Use --force to overwrite.`);
    return;
  }

  // Generate word split
  const splitLine = (line: string) => {
    const words = line.trim().split(' ');
    const groups = [];
    for (let i = 0; i < words.length; i += 2) {
      groups.push(words.slice(i, i + 2).join(' '));
    }
    return groups.join('\n');
  };

  const wordSplit = `${splitLine(kural.Line1)}\n${splitLine(kural.Line2)}`;

  const prompt = `குறள்:\n\n${kural.Line1}\n${kural.Line2}\n\nWord split:\n\n${wordSplit}\n\nGenerate 15 seconds audio clip for this குறள்`;

  console.log("Launching dedicated Chrome instance...");
  let browser;
  try {
    const profilePath = path.resolve(__dirname, '../../../.gemini_chrome_profile');
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      userDataDir: profilePath,
      headless: false, // Must be visible to bypass captcha/login checks easily
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

  console.log("Connected to browser. Opening new tab...");
  const page = await browser.newPage();
  
  // Intercept responses to download the MP3
  let downloadUrl = '';
  page.on('response', async (response) => {
    const url = response.url();
    // Gemini usually returns audio from specific endpoints, we can listen for media files
    if (url.includes('.mp3') || url.includes('.wav') || response.headers()['content-type']?.includes('audio')) {
      console.log(`Intercepted audio response: ${url}`);
      downloadUrl = url;
    }
  });

  await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });

  // Focus and type into the chat input
  console.log("\\n=======================================================");
  console.log("WAITING FOR LOGIN:");
  console.log("If you are not logged in, please log in now in the browser.");
  console.log("Once you are fully logged in and on the Gemini chat page,");
  console.log("press ENTER in this terminal to continue...");
  console.log("=======================================================\\n");

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

  console.log("Entering prompt...");
  
  // Wait for the rich text editor (this selector is common for Gemini)
  // We use timeout: 0 (infinite) so if you need to log in manually on the first run, the script will simply pause and wait for you to finish logging in!
  const inputSelector = 'rich-textarea';
  await page.waitForSelector(inputSelector, { timeout: 0 });
  
  // Focus the input box
  await page.focus(inputSelector);

  // We use execCommand to insert text natively so that Gemini's React state updates
  // and the newlines are correctly formatted as <br>/<div> tags in the contenteditable element!
  await page.evaluate((text) => {
    document.execCommand('insertText', false, text);
  }, prompt);

  // Small delay for the UI to register the text and enable the Send button
  await new Promise(r => setTimeout(r, 500));

  // Click send button
  console.log("Submitting prompt...");
  await page.keyboard.press('Enter');

  console.log("Waiting for generation and download button...");
  
  // Wait for the AI to finish. We can wait for the 'Download' button or audio player.
  // We'll implement a robust wait logic. The user says "I click on the download button on the generated clip UI."
  // Wait for a generic button that looks like a download button, or wait for the audio tag.
  
  try {
    // Wait for the audio element or download button
    await page.waitForFunction(() => {
      const audioTags = document.querySelectorAll('audio');
      const downloadButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.includes('Download') || b.getAttribute('aria-label')?.includes('Download'));
      return audioTags.length > 0 || downloadButtons.length > 0;
    }, { timeout: 60000 }); // 60 seconds timeout
    
    console.log("Generation complete! Finding download URL...");
    
    if (downloadUrl) {
      // Download the audio using fetch inside page
      console.log(`Downloading from ${downloadUrl}...`);
      const buffer = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        return Array.from(new Uint8Array(arrayBuffer));
      }, downloadUrl);
      
      fs.writeFileSync(audioOutPath, Buffer.from(buffer));
      console.log(`Successfully saved audio to ${audioOutPath}`);
    } else {
      console.log("Could not intercept the audio URL automatically. Please download manually.");
    }
  } catch (e) {
    console.error("Timeout waiting for audio generation.");
  }

  await page.close();
  browser.disconnect();
}

run().catch(console.error);
