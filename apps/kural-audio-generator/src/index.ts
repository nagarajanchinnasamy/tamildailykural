import puppeteer from 'puppeteer-core';
import minimist from 'minimist';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

async function run() {
  const argv = minimist(process.argv.slice(2));
  const kuralNumber = parseInt(argv['kural'], 10);
  const force = argv['force'] === true || argv['force'] === 'true';
  const mood = argv['mood'];
  const splitAt = parseInt(argv['split-at'], 10) || 15; // default to 15 seconds

  if (isNaN(kuralNumber)) {
    console.error("Usage: npm start -- --kural=N [--force] [--mood=M] [--split-at=15]");
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
  const filePrefix = kural.Number.toString().padStart(4, '0');
  const masterAudioOutPath = path.join(kuralDir, `${filePrefix}_master_audio.mp3`);
  const kuralAudioOutPath = path.join(kuralDir, `${filePrefix}_kural_audio.mp3`);
  const meaningAudioOutPath = path.join(kuralDir, `${filePrefix}_meaning_audio.mp3`);

  if (!fs.existsSync(kuralDir)) {
    fs.mkdirSync(kuralDir, { recursive: true });
  }

  let needsAudio = true;
  if (fs.existsSync(kuralAudioOutPath) && fs.existsSync(meaningAudioOutPath) && !force) {
    console.log(`Audio clips already exist. Skipping audio generation...`);
    needsAudio = false;
  }

  let needsImage = true;
  const imageJpgPath = path.join(kuralDir, `${filePrefix}_kural_image.jpg`);
  const imagePngPath = path.join(kuralDir, `${filePrefix}_kural_image.png`);
  if ((fs.existsSync(imageJpgPath) || fs.existsSync(imagePngPath)) && !force) {
    console.log(`Image already exists. Skipping image generation...`);
    needsImage = false;
  }

  if (force) {
    const existingFiles = fs.readdirSync(kuralDir);
    for (const f of existingFiles) {
      if (f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.jpg') || f.endsWith('.png')) {
        fs.unlinkSync(path.join(kuralDir, f));
      }
    }
  }

  if (!needsAudio && !needsImage) {
    console.log("All audio and image assets already exist. Exiting.");
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

  const masterAudioPrompt = `குறள்:\n\n${wordSplit}\n\nTamil Meaning:\n${kural.tdk}\n\nEnglish Meaning:\n${kural['tdk-explanation']}\n\n${moodInstruction}\n\nGenerate a single 30-second continuous audio clip that includes BOTH the verse and the meanings.\n\nCRITICAL INSTRUCTIONS:\n1. First, you must beautifully SING the குறள் verse. Use the line breaks in the குறள் text provided above as a strict guide for phrasing and where to pause/breathe while singing. You MUST complete singing the verse within the first 15 seconds.\n2. Immediately after singing the verse, you MUST narrate the Tamil Meaning text exactly as provided above.\n3. Then, you MUST narrate the English Meaning text exactly as provided above.\n4. DO NOT sing the meanings. The meanings must be SPOKEN clearly like an audiobook narration at a moderate, easy-to-understand pace.`;
  
  const imagePrompt = `Based on the following Thirukkural meaning, please deeply analyze its context and emotional tone, and generate a beautiful, highly-detailed cinematic image that represents it. You must decide the best artistic style for this (e.g., photorealistic, watercolor, ancient Tamil aesthetic, minimalist, etc.) based on the meaning.\n\nTamil Meaning:\n${kural.tdk}\n\nEnglish Meaning:\n${kural['tdk-explanation']}\n\nCRITICAL RULES:\n1. DO NOT INCLUDE ANY TEXT, WORDS, OR LETTERS INSIDE THE IMAGE UNDER ANY CIRCUMSTANCES.\n2. ASPECT RATIO: You MUST generate the image in a 9:16 vertical portrait aspect ratio (mobile phone orientation). Do not generate a landscape image.\nReply with ONLY the generated image.`;

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

    if (label === 'Master Audio') {
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
        const audioFile = files.find(f => f.endsWith('.mp3') && !f.endsWith('_kural_audio.mp3') && !f.endsWith('_meaning_audio.mp3') && !f.endsWith('_master_audio.mp3'));
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

  async function generateImage(prompt: string, outputPath: string) {
    console.log(`\n=======================================================`);
    console.log(`GENERATING: Image`);
    console.log(`=======================================================\n`);

    await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });

    console.log(`Entering Image prompt...`);
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
      console.log("Waiting for the generated image to appear in the chat...");
      // Wait for a large image to appear
      await page.waitForFunction(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.some(img => (img.width > 200 && img.height > 200) || (img.style.width && parseInt(img.style.width) > 200));
      }, { timeout: 180000 });
      
      console.log(`Image rendered! Searching for the download button...`);
      
      // Hover the image to make buttons visible, then find the download button
      const btnHandle = await page.waitForFunction(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const largeImg = imgs.find(img => (img.width > 200 && img.height > 200) || (img.style.width && parseInt(img.style.width) > 200));
        if (!largeImg) return null;
        
        // Trigger hover
        largeImg.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        largeImg.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

        // Search for buttons near the image or within the same message block
        let container = largeImg.parentElement;
        while (container && container.tagName !== 'BODY') {
           const buttons = Array.from(container.querySelectorAll('button, a, div[role="button"]'));
           const dlBtn = buttons.find(b => {
             const aria = b.getAttribute('aria-label')?.toLowerCase() || '';
             const tooltip = b.getAttribute('data-tooltip')?.toLowerCase() || '';
             const text = b.textContent?.toLowerCase() || '';
             return aria.includes('download') || tooltip.includes('download') || text.includes('download');
           });
           if (dlBtn) return dlBtn;
           container = container.parentElement;
        }
        return null;
      }, { timeout: 10000 }).catch(() => null);
      
      if (btnHandle) {
        console.log("Found download button! Clicking natively...");
        const element = btnHandle.asElement();
        if (element) {
          await element.click().catch(async () => {
            await page.evaluate((el: HTMLElement) => el.click(), element);
          });
        }
      } else {
        console.log("Could not find download button. Attempting direct src fetch fallback...");
        // Fallback: Just fetch the image src and trigger download
        await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('img'));
          const largeImg = imgs.find(img => (img.width > 200 && img.height > 200) || (img.style.width && parseInt(img.style.width) > 200));
          if (largeImg && largeImg.src) {
             const a = document.createElement('a');
             a.href = largeImg.src;
             a.download = 'fallback_kural_image.png';
             a.click();
          }
        });
      }

      console.log(`Waiting for file to be saved in ${kuralDir}...`);
      let downloadedFile = '';
      for (let i = 0; i < 60; i++) { 
        const files = fs.readdirSync(kuralDir);
        const imageFile = files.find(f => (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.webp')) && !f.endsWith('_kural_image.jpg') && !f.endsWith('_kural_image.png') && !f.endsWith('_kural_image.webp'));
        if (imageFile && !imageFile.includes('.crdownload')) {
          downloadedFile = path.join(kuralDir, imageFile);
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }

      if (downloadedFile) {
        // Output path might be .jpg or .png depending on what Gemini gives us.
        // We will keep the original extension
        const ext = path.extname(downloadedFile);
        const finalPath = outputPath.replace('.jpg', ext); // dynamically set the correct extension
        fs.renameSync(downloadedFile, finalPath);
        console.log(`Successfully saved Image to ${finalPath}`);
      } else {
        console.log(`Could not detect the downloaded Image file automatically. Please check the folder.`);
      }
    } catch (e) {
      console.error(`Timeout waiting for Image generation. It took longer than 3 minutes or failed.`);
    }
  }

  if (needsAudio) {
    await generateAudio(masterAudioPrompt, masterAudioOutPath, 'Master Audio');
    
    // Check if master audio exists
    if (fs.existsSync(masterAudioOutPath)) {
       console.log(`\n=======================================================`);
       console.log(`MASTER AUDIO DOWNLOADED!`);
       console.log(`Path: ${masterAudioOutPath}`);
       console.log(`Please listen to the audio and determine the exact second where the Verse ends and the Meaning begins.`);
       console.log(`=======================================================\n`);
       
       const finalSplitAt = await new Promise<number>((resolve) => {
         const rl = require('readline').createInterface({
           input: process.stdin,
           output: process.stdout
         });
         rl.question(`Enter the split point in seconds (e.g., 14.5) [default ${splitAt}]: `, (answer: string) => {
           rl.close();
           const parsed = parseFloat(answer);
           resolve(isNaN(parsed) ? splitAt : parsed);
         });
       });

       console.log(`\nSplitting master audio at ${finalSplitAt} seconds using ffmpeg...`);
       try {
           // Extract Verse (0 to splitAt)
           execSync(`"${ffmpegPath}" -y -i "${masterAudioOutPath}" -t ${finalSplitAt} -c copy "${kuralAudioOutPath}"`, { stdio: 'ignore' });
           // Extract Meaning (splitAt to end)
           execSync(`"${ffmpegPath}" -y -i "${masterAudioOutPath}" -ss ${finalSplitAt} -c copy "${meaningAudioOutPath}"`, { stdio: 'ignore' });
           
           console.log(`Successfully split audio into verse and meaning!`);
       } catch (err) {
           console.error("Failed to split audio with ffmpeg. Please make sure ffmpeg is installed on your system.");
           console.error(err);
       }
    }
  }

  if (needsImage) {
    await generateImage(imagePrompt, path.join(kuralDir, `${filePrefix}_kural_image.jpg`));
  }

  console.log("\n=======================================================");
  console.log("ALL GENERATION COMPLETE!");
  console.log("=======================================================\n");

  await browser.close();
}

run().catch(console.error);
