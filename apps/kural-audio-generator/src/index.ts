import puppeteer from 'puppeteer-core';
import minimist from 'minimist';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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
  const combinedAudioOutPath = path.join(kuralDir, `${kuralStr.replace('Kural_', '')}_kural_meaning_audio.mp3`);
  const verseOutPath = path.join(kuralDir, `${kuralStr.replace('Kural_', '')}_kural_audio.mp3`);
  const meaningOutPath = path.join(kuralDir, `${kuralStr.replace('Kural_', '')}_meaning_audio.mp3`);

  if (!fs.existsSync(kuralDir)) {
    fs.mkdirSync(kuralDir, { recursive: true });
  }

  if (fs.existsSync(combinedAudioOutPath) && !force) {
    console.log(`Audio file already exists at ${combinedAudioOutPath}. Use --force to overwrite.`);
    return;
  }

  // If force is true, delete all existing mp3/wav files in the directory to prevent
  // Chrome from downloading as "file (1).mp3" and confusing our download detection
  if (force) {
    const existingFiles = fs.readdirSync(kuralDir);
    for (const f of existingFiles) {
      if (f.endsWith('.mp3') || f.endsWith('.wav')) {
        fs.unlinkSync(path.join(kuralDir, f));
      }
    }
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

  const prompt = `குறள்:\n\n${kural.Line1}\n${kural.Line2}\n\nWord split:\n\n${wordSplit}\n\nTamil Meaning:\n${kural.tdk}\n\nEnglish Meaning:\n${kural['tdk-explanation']}\n\nGenerate 30 seconds audio clip for this. IMPORTANT INSTRUCTION: You must SING the குறள் verse. However, DO NOT sing the meanings! The Tamil Meaning and English Meaning must be SPOKEN OUT clearly like a normal voice-over narration.`;

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
    const btnHandle = await page.waitForFunction(() => {
      const elements = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
      return elements.find(b => {
        const text = b.textContent?.toLowerCase() || '';
        const label = b.getAttribute('aria-label')?.toLowerCase() || '';
        const tooltip = b.getAttribute('data-tooltip')?.toLowerCase() || '';
        return text.includes('download') || label.includes('download') || tooltip.includes('download');
      });
    }, { timeout: 180000 }); // 3 minutes timeout
    
    console.log("Generation complete! Hovering over media card...");
    
    const element = btnHandle.asElement();
    if (element) {
      // Find the closest large container (the image card) to hover over to reveal the button
      const containerHandle = await page.evaluateHandle((el) => {
        let parent = el.parentElement;
        // Traverse up until we find a container that is likely the image card (e.g. > 150px wide)
        while (parent && parent.getBoundingClientRect().width < 150) {
          parent = parent.parentElement;
        }
        return parent || el;
      }, element);
      
      const containerEl = containerHandle.asElement();
      if (containerEl) {
        // Simulate a real mouse hover over the image card to make the buttons appear
        await containerEl.hover().catch(() => console.log("Could not hover container"));
        // Wait for CSS animations to reveal the button
        await new Promise(r => setTimeout(r, 1000));
      }
      
      console.log("Clicking download button natively...");
      // Simulate a real, trusted mouse click on the button
      await element.click().catch(async (e) => {
        console.log("Native click failed, attempting forceful JS click fallback...");
        await page.evaluate((el) => el.click(), element);
      });

      console.log("Waiting for the download menu to open...");
      
      // Wait up to 5 seconds for the menu option to appear in the DOM
      const mp3OptionHandle = await page.waitForFunction(() => {
        const allElements = Array.from(document.querySelectorAll('*'));
        // Find all elements containing the specific text
        const matches = allElements.filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          // Avoid matching the <script> or <style> tags, or the entire <body>
          if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'BODY' || el.tagName === 'HTML') return false;
          return text.includes('audio only') || text.includes('mp3 track');
        });
        
        if (matches.length > 0) {
          // The last element in the array is typically the deepest nested node (closest to the text)
          return matches[matches.length - 1];
        }
        return null;
      }, { timeout: 5000 }).catch(() => null);

      if (mp3OptionHandle) {
        console.log("Menu found! Clicking 'Audio only (MP3 track)'...");
        await page.evaluate((el) => {
          // Click the element itself or its closest clickable container
          const clickable = el.closest('li, div[role="menuitem"], div[role="button"]') || el;
          clickable.click();
        }, mp3OptionHandle);
      } else {
        console.log("Could not find the 'Audio only' menu option. Maybe it started downloading directly?");
      }
    }

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
      // Rename the downloaded file to our combined audio format
      if (downloadedFile !== combinedAudioOutPath) {
        fs.renameSync(downloadedFile, combinedAudioOutPath);
      }
      console.log(`Successfully saved combined audio to ${combinedAudioOutPath}`);

      // Close the browser early so the user isn't distracted
      await browser.close();

      console.log(`\n=======================================================`);
      console.log(`DOWNLOAD COMPLETE!`);
      console.log(`The combined audio file is saved at:\n${combinedAudioOutPath}`);
      console.log(`Please open this file on your computer and listen to it.`);
      console.log(`Identify the exact second where the song ends and the speaking begins.`);
      console.log(`Enter the timestamp in seconds (e.g., 14.5).`);
      console.log(`=======================================================\n`);

      const splitTimeStr = await new Promise<string>((resolve) => {
        const rl = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question('Enter split timestamp (seconds): ', (answer: string) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      const splitTime = parseFloat(splitTimeStr);
      if (!isNaN(splitTime) && splitTime > 0) {
        console.log(`Splitting audio at ${splitTime} seconds...`);
        
        // Extract verse (from start to splitTime)
        await new Promise<void>((resolve, reject) => {
          ffmpeg(combinedAudioOutPath)
            .setStartTime(0)
            .setDuration(splitTime)
            .output(verseOutPath)
            .on('end', () => resolve())
            .on('error', (err: any) => reject(err))
            .run();
        });
        
        // Extract meaning (from splitTime to end)
        await new Promise<void>((resolve, reject) => {
          ffmpeg(combinedAudioOutPath)
            .setStartTime(splitTime)
            .output(meaningOutPath)
            .on('end', () => resolve())
            .on('error', (err: any) => reject(err))
            .run();
        });
        
        console.log(`Successfully created:\n  - ${verseOutPath}\n  - ${meaningOutPath}`);
      } else {
        console.log("Invalid timestamp provided. Skipping split step.");
      }
      return; // Ensure we exit early since we already closed browser
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
