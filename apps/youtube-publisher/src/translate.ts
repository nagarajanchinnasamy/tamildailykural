import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

export async function ensureTranslations(kuralNumber: number) {
  const dataPath = path.join(process.cwd(), '../../data/thirukkural.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Thirukkural JSON not found at ${dataPath}`);
  }

  const rawData = fs.readFileSync(dataPath, 'utf8');
  const thirukkuralData = JSON.parse(rawData);
  const kurals = thirukkuralData.kural || thirukkuralData;
  
  const kural = kurals.find((k: any) => k.Number === kuralNumber);
  if (!kural) {
    throw new Error(`Kural ${kuralNumber} not found.`);
  }

  let needsSave = false;
  const englishMeaning = kural['tdk-explanation'] || kural.explanation;

  if (!kural['tdk-malayalam'] || !kural['tdk-kannada'] || !kural['tdk-telugu']) {
    console.log(`Missing regional translations for Kural ${kuralNumber}. Invoking Gemini API...`);
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("WARNING: GEMINI_API_KEY environment variable is not set. Cannot perform translation. Proceeding without regional meanings.");
      return kural;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    
    const prompt = `Translate the following English meaning of a Tamil Thirukkural into Malayalam, Kannada, and Telugu. 
    Provide ONLY a valid JSON object with the keys "malayalam", "kannada", and "telugu". Do not include any markdown formatting, just the raw JSON object.

    English Meaning: "${englishMeaning}"`;

    let success = false;
    let retries = 3;
    while (retries > 0 && !success) {
      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        // Clean up markdown if AI added it
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const translations = JSON.parse(text);

        if (!kural['tdk-malayalam']) {
          kural['tdk-malayalam'] = translations.malayalam;
          needsSave = true;
        }
        if (!kural['tdk-kannada']) {
          kural['tdk-kannada'] = translations.kannada;
          needsSave = true;
        }
        if (!kural['tdk-telugu']) {
          kural['tdk-telugu'] = translations.telugu;
          needsSave = true;
        }

        console.log("Successfully fetched and applied translations from Gemini!");
        success = true;

      } catch (err: any) {
        if (err.status === 503 && retries > 1) {
           console.log(`Gemini API 503 error, retrying in 2 seconds... (${retries - 1} retries left)`);
           await new Promise(resolve => setTimeout(resolve, 2000));
           retries--;
        } else {
           console.error("Failed to translate using Gemini:", err);
           break;
        }
      }
    }
  } else {
    console.log(`Translations already exist for Kural ${kuralNumber}. Skipping API call.`);
  }

  if (needsSave) {
    fs.writeFileSync(dataPath, JSON.stringify(thirukkuralData, null, 2), 'utf8');
    console.log("Saved new translations back to thirukkural.json.");
  }

  return kural;
}
