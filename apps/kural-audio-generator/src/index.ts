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

  console.log("Connected to browser. Configuring download path...");
  
  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  
  // Set default download directory to the Kural folder so native downloads go directly there
  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: kuralDir,
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

  console.log("Waiting for generation to complete (this can take up to 3 minutes)...");
  
  try {
    // Wait for the download button to appear (indicating generation is done)
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => 
        b.textContent?.toLowerCase().includes('download') || 
        b.getAttribute('aria-label')?.toLowerCase().includes('download') ||
        b.getAttribute('data-tooltip')?.toLowerCase().includes('download')
      );
    }, { timeout: 180000 }); // 3 minutes timeout
    
    console.log("Generation complete! Clicking download button...");
    
    // Click the download button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const downloadBtn = buttons.find(b => 
        b.textContent?.toLowerCase().includes('download') || 
        b.getAttribute('aria-label')?.toLowerCase().includes('download') ||
        b.getAttribute('data-tooltip')?.toLowerCase().includes('download')
      );
      if (downloadBtn) {
        downloadBtn.click();
      }
    });

    console.log(`Waiting for file to be saved in ${kuralDir}...`);
    
    // Wait for a file to appear in the directory (Chrome downloads it natively)
    let downloadedFile = '';
    for (let i = 0; i < 60; i++) { // wait up to 30 seconds for download to finish
      const files = fs.readdirSync(kuralDir);
      const audioFile = files.find(f => f.endsWith('.mp3') || f.endsWith('.wav'));
      if (audioFile && !audioFile.includes('.crdownload')) {
        downloadedFile = path.join(kuralDir, audioFile);
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (downloadedFile) {
      // Rename the downloaded file to our required format if it isn't already
      if (downloadedFile !== audioOutPath) {
        fs.renameSync(downloadedFile, audioOutPath);
      }
      console.log(`Successfully saved and renamed audio to ${audioOutPath}`);
    } else {
      console.log("Could not detect the downloaded file automatically. Please check the folder.");
    }
  } catch (e) {
    console.error("Timeout waiting for audio generation. It took longer than 3 minutes or failed.");
  }

  // Close the entire browser properly so it doesn't leave ghost tabs
  await browser.close();
}

run().catch(console.error);
