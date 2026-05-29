import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

async function main() {
  const chromeProfilePath = path.join(process.cwd(), '.gemini_chrome_profile');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    userDataDir: chromeProfilePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  });

  const page = await browser.newPage();
  await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });

  console.log("Typing prompt...");
  await page.waitForSelector('rich-textarea > div');
  await page.click('rich-textarea > div');
  await page.keyboard.type("Generate a majestic image of a lion sitting on a throne. Reply with only the image.");
  
  await new Promise(r => setTimeout(r, 1000));
  await page.keyboard.press('Enter');
  
  console.log("Waiting for generation...");
  await new Promise(r => setTimeout(r, 15000));
  
  const html = await page.content();
  fs.writeFileSync('gemini-image-dom.html', html);
  console.log("Saved DOM to gemini-image-dom.html");
  
  await browser.close();
}

main().catch(console.error);
