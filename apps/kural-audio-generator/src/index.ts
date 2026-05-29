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
      // Wait a moment for the dropdown menu to render
      await new Promise(r => setTimeout(r, 1000));
      
      // Click the "Audio only" / "MP3 track" option in the dropdown menu
      const mp3OptionClicked = await page.evaluate(() => {
        // Look for any element containing "Audio only" or "MP3 track"
        // Usually these are spans, divs, or list items
        const allElements = Array.from(document.querySelectorAll('*'));
        const audioOption = allElements.find(el => {
          // Check only elements that have no children (leaf nodes) to avoid clicking giant wrapper divs
          if (el.children.length > 0) return false;
          const text = el.textContent?.toLowerCase() || '';
          return text.includes('audio only') || text.includes('mp3 track');
        });
        
        if (audioOption) {
          // Click the element or its parent
          (audioOption.closest('li, div[role="menuitem"], div[role="button"]') || audioOption as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (mp3OptionClicked) {
        console.log("Selected 'Audio only (MP3 track)' from the menu!");
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
