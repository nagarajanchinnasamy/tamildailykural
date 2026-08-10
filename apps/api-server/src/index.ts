import express from 'express';
import cors from 'cors';
import db from './db';
import { spawn } from 'child_process';
import path from 'path';
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

import fs from 'fs';

// Serve static files from the public directory (where Kurals and assets are generated)
app.use('/public', express.static(path.resolve(__dirname, '../../../public')));
app.use('/videos', express.static(path.resolve(__dirname, '../../../data/Daily_Videos')));

app.get('/api/hierarchy', (req, res) => {
  try {
    const detailJsonPath = path.resolve(__dirname, '../../../data/detail.json');
    const data = fs.readFileSync(detailJsonPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading detail.json:', error);
    res.status(500).json({ error: 'Failed to fetch hierarchy' });
  }
});

app.get('/api/kurals', (req, res) => {
  const { start, end } = req.query;
  let query = 'SELECT * FROM Kurals';
  let params: any[] = [];

  if (start && end) {
    query += ' WHERE Number >= ? AND Number <= ?';
    params.push(Number(start), Number(end));
  }

  query += ' ORDER BY Number ASC';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch kurals' });
    } else {
      res.json(rows);
    }
  });
});

app.get('/api/kurals/:number', (req, res) => {
  db.get('SELECT * FROM Kurals WHERE Number = ?', [req.params.number], (err, row) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch kural' });
    } else if (row) {
      res.json(row);
    } else {
      res.status(404).json({ error: 'Kural not found' });
    }
  });
});

app.put('/api/kurals/:number', (req, res) => {
  const kural = req.body;
  const number = req.params.number;

  const stmt = db.prepare(`
    UPDATE Kurals SET 
      Line1 = ?, Line2 = ?, Translation = ?, mv = ?, sp = ?, mk = ?, 
      explanation = ?, couplet = ?, transliteration1 = ?, transliteration2 = ?, 
      title = ?, tdk = ?, tdk_explanation = ?, split = ?, mood = ?
    WHERE Number = ?
  `);

  stmt.run([
    kural.Line1, kural.Line2, kural.Translation, kural.mv, kural.sp, kural.mk,
    kural.explanation, kural.couplet, kural.transliteration1, kural.transliteration2,
    kural.title, kural.tdk, kural.tdk_explanation, 
    kural.split ? JSON.stringify(kural.split) : null, kural.mood, number
  ], function(err) {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update kural' });
    } else {
      // Sync edits to thirukkural.json so audio/video generators read the updated values
      try {
        const jsonPath = path.resolve(__dirname, '../../../data/thirukkural.json');
        if (fs.existsSync(jsonPath)) {
          const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          const idx = jsonContent.kural.findIndex((item: any) => item.Number === Number(number));
          if (idx !== -1) {
            const exp = kural.tdk_explanation || kural['tdk-explanation'];
            jsonContent.kural[idx] = {
              ...jsonContent.kural[idx],
              Line1: kural.Line1 || jsonContent.kural[idx].Line1,
              Line2: kural.Line2 || jsonContent.kural[idx].Line2,
              Translation: kural.Translation || jsonContent.kural[idx].Translation,
              mv: kural.mv || jsonContent.kural[idx].mv,
              sp: kural.sp || jsonContent.kural[idx].sp,
              mk: kural.mk || jsonContent.kural[idx].mk,
              explanation: kural.explanation || jsonContent.kural[idx].explanation,
              couplet: kural.couplet || jsonContent.kural[idx].couplet,
              title: kural.title || jsonContent.kural[idx].title,
              tdk: kural.tdk || jsonContent.kural[idx].tdk,
              'tdk-explanation': exp || jsonContent.kural[idx]['tdk-explanation'],
              tdk_explanation: exp || jsonContent.kural[idx].tdk_explanation,
              split: kural.split || jsonContent.kural[idx].split,
              mood: kural.mood || jsonContent.kural[idx].mood
            };
            fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2), 'utf8');
          }
        }
      } catch (syncErr) {
        console.error('Error syncing to thirukkural.json:', syncErr);
      }

      res.json({ success: true, changes: this.changes });
    }
  });
  stmt.finalize();
});

// Helper to spawn a command and log it
function runBackgroundCommand(command: string, args: string[], cwd: string, onExit: (code: number | null) => void) {
  console.log(`Starting background job: ${command} ${args.join(' ')} in ${cwd}`);
  const child = spawn(command, args, { cwd, shell: true, env: { ...process.env, NON_INTERACTIVE: 'true' } });
  
  child.stdout.on('data', (data) => console.log(`[JOB STDOUT]: ${data}`));
  child.stderr.on('data', (data) => console.error(`[JOB STDERR]: ${data}`));
  
  child.on('close', (code) => {
    console.log(`Job exited with code ${code}`);
    onExit(code);
  });
}

app.post('/api/generate/audio/kural', (req, res) => {
  const { kuralNumber } = req.body;
  if (!kuralNumber) return res.status(400).json({ error: 'kuralNumber required' });

  // Update DB status to 'generating_kural_audio' (this would typically be in DailySchedule, 
  // but we can just use the response to acknowledge job started)
  
  const cwd = path.resolve(__dirname, '../../kural-audio-generator');
  
  runBackgroundCommand('npm', ['run', 'start', '--', `--kural=${kuralNumber}`, '--force-audio', '--skip-image'], cwd, (code) => {
    // Callback when finished
  });
  
  res.json({ success: true, message: 'Audio generation started' });
});

app.post('/api/generate/audio/split', (req, res) => {
  const { kuralNumber, splitPoint } = req.body;
  if (!kuralNumber || !splitPoint) return res.status(400).json({ error: 'kuralNumber and splitPoint required' });

  const adhikaaram = Math.ceil(kuralNumber / 10);
  const adhikaaramStr = `Adhikaaram_${adhikaaram.toString().padStart(4, '0')}`;
  const kuralStr = `Kural_${kuralNumber.toString().padStart(4, '0')}`;
  const prefix = kuralNumber.toString().padStart(4, '0');
  
  const publicDir = path.resolve(__dirname, '../../../public');
  const kuralDir = path.join(publicDir, 'Kurals', adhikaaramStr, kuralStr);
  
  const masterAudioPath = path.join(kuralDir, `${prefix}_master_audio.mp3`);
  const kuralAudioPath = path.join(kuralDir, `${prefix}_kural_audio.mp3`);
  const aiMeaningAudioPath = path.join(kuralDir, `${prefix}_ai_meaning_audio.mp3`);
  const meaningAudioPath = path.join(kuralDir, `${prefix}_meaning_audio.mp3`);

  if (!fs.existsSync(masterAudioPath)) {
    return res.status(404).json({ error: 'Master audio not found' });
  }

  let ffmpegPath = 'ffmpeg';
  try {
    ffmpegPath = require('ffmpeg-static');
  } catch(e) {
    console.warn("ffmpeg-static not found, falling back to system ffmpeg");
  }

  const { exec } = require('child_process');
  
  exec(`"${ffmpegPath}" -nostdin -y -i "${masterAudioPath}" -t ${splitPoint} -c copy "${kuralAudioPath}"`, (err: any) => {
    if (err) return res.status(500).json({ error: 'Failed to split kural audio', details: err });
    
    exec(`"${ffmpegPath}" -nostdin -y -i "${masterAudioPath}" -ss ${splitPoint} -c copy "${aiMeaningAudioPath}"`, (err2: any) => {
      if (err2) return res.status(500).json({ error: 'Failed to split meaning audio', details: err2 });
      
      fs.copyFileSync(aiMeaningAudioPath, meaningAudioPath);
      res.json({ success: true, message: 'Audio split successfully' });
    });
  });
});

app.post('/api/generate/audio/tts', (req, res) => {
  const { kuralNumber, startDate, tamilDate } = req.body;
  if (!kuralNumber) return res.status(400).json({ error: 'kuralNumber required' });

  const sDate = startDate || '2026-04-01';
  const tDate = tamilDate || '2026-04-01';
  const cwd = path.resolve(__dirname, '../../video-renderer');
  
  runBackgroundCommand('npm', ['run', 'start', '--', `--kural=${kuralNumber}`, `--start-date=${sDate}`, `--tamil-date=${tDate}`, '--days=1', '--generate-tts-only'], cwd, (code) => {
    // Callback
  });
  
  res.json({ success: true, message: 'TTS audio generation started' });
});

app.post('/api/generate/image', (req, res) => {
  const { kuralNumber } = req.body;
  if (!kuralNumber) return res.status(400).json({ error: 'kuralNumber required' });

  const cwd = path.resolve(__dirname, '../../kural-audio-generator');
  
  runBackgroundCommand('npm', ['run', 'start', '--', `--kural=${kuralNumber}`, '--force-image', '--skip-audio'], cwd, (code) => {
    if (code === 0) {
      res.json({ success: true, message: 'Image generation completed' });
    } else {
      res.status(500).json({ error: 'Image generation failed', code });
    }
  });
});

app.post('/api/generate/audio/meaning', (req, res) => {
  const { kuralNumber, useTts } = req.body;
  if (!kuralNumber) return res.status(400).json({ error: 'kuralNumber required' });

  const cwd = path.resolve(__dirname, '../../video-renderer');
  // We can pass a flag to use-tts if implemented in the script, or just run the audio generator
  // Actually, meaning audio is usually done via kural-audio-generator unless useTts is passed to video-renderer.
  // For simplicity, let's just trigger the audio generator script
  
  res.json({ success: true, message: 'Meaning audio generation started (Not fully implemented yet)' });
});

app.post('/api/generate/audio/meaning/select', (req, res) => {
  const { kuralNumber, type } = req.body;
  if (!kuralNumber || !type) return res.status(400).json({ error: 'kuralNumber and type required' });

  const adhikaaram = Math.ceil(kuralNumber / 10);
  const adhikaaramStr = `Adhikaaram_${adhikaaram.toString().padStart(4, '0')}`;
  const kuralStr = `Kural_${kuralNumber.toString().padStart(4, '0')}`;
  const prefix = kuralNumber.toString().padStart(4, '0');
  
  const publicDir = path.resolve(__dirname, '../../../public');
  const kuralDir = path.join(publicDir, 'Kurals', adhikaaramStr, kuralStr);
  
  const sourceAudioPath = path.join(kuralDir, `${prefix}_${type}_meaning_audio.mp3`);
  const targetAudioPath = path.join(kuralDir, `${prefix}_meaning_audio.mp3`);

  if (!fs.existsSync(sourceAudioPath)) {
    return res.status(404).json({ error: `Source audio not found: ${type}` });
  }

  try {
    fs.copyFileSync(sourceAudioPath, targetAudioPath);
    res.json({ success: true, message: `Set ${type} as meaning audio` });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to copy audio', details: err.message });
  }
});

app.post('/api/generate/video', (req, res) => {
  const { kuralNumber, startDate, tamilDate } = req.body;
  if (!kuralNumber || !startDate || !tamilDate) return res.status(400).json({ error: 'kuralNumber, startDate, tamilDate required' });

  const cwd = path.resolve(__dirname, '../../video-renderer');
  
  runBackgroundCommand('npm', ['run', 'start', '--', `--start-date=${startDate}`, `--tamil-date=${tamilDate}`, `--days=1`, `--kural=${kuralNumber}`], cwd, (code) => {
    if (code === 0) {
      const num = parseInt(kuralNumber, 10);
      const prefix = num.toString().padStart(4, '0');
      const tamilYm = tamilDate.slice(0, 7);
      const videoRelPath = `/videos/${tamilYm}/${tamilDate}_${prefix}_final_video.mp4`;

      db.run(
        `INSERT INTO DailySchedule (kural_number, date, tamil_date, video_path, status) VALUES (?, ?, ?, ?, 'video_ready')`,
        [num, startDate, tamilDate, videoRelPath],
        (err) => { if (err) console.error('DB Insert error:', err); }
      );
      res.json({ success: true, message: 'Video rendering completed' });
    } else {
      res.status(500).json({ error: 'Video rendering failed', code });
    }
  });
});

app.post('/api/publish', (req, res) => {
  const { kuralNumber, startDate, tamilDate } = req.body;
  if (!kuralNumber || !startDate || !tamilDate) return res.status(400).json({ error: 'kuralNumber, startDate, tamilDate required' });

  const cwd = path.resolve(__dirname, '../../youtube-publisher');
  
  runBackgroundCommand('npm', ['start', '--', `--date="${startDate}"`, `--tamil-date="${tamilDate}"`, `--kural=${kuralNumber}`], cwd, (code) => {
    if (code === 0) {
      const num = parseInt(kuralNumber, 10);
      const prefix = num.toString().padStart(4, '0');
      const tamilYm = tamilDate.slice(0, 7);
      const videoRelPath = `/videos/${tamilYm}/${tamilDate}_${prefix}_final_video.mp4`;

      db.run(
        `INSERT INTO DailySchedule (kural_number, date, tamil_date, video_path, status, youtube_url) VALUES (?, ?, ?, ?, 'published', 'https://youtube.com')`,
        [num, startDate, tamilDate, videoRelPath],
        (err) => { if (err) console.error('DB Insert error:', err); }
      );
      res.json({ success: true, message: 'Publishing completed' });
    } else {
      res.status(500).json({ error: 'Publishing failed', code });
    }
  });
});

app.get('/api/kurals/:number/history', (req, res) => {
  const kuralNumber = parseInt(req.params.number, 10);
  db.all(
    `SELECT * FROM DailySchedule WHERE kural_number = ? ORDER BY id DESC`,
    [kuralNumber],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

app.post('/api/generate/translation', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    const prompt = `Translate the following Tamil Thirukkural meaning into English in a concise and clear manner. The output should be JUST the translated English text without quotes or explanations.\n\nTamil: ${text}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const translation = response.text().trim();
    
    res.json({ success: true, translation });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
});

app.listen(Number(port), '0.0.0.0', () => {
  console.log(`API Server listening on port ${port} at 0.0.0.0`);
});
