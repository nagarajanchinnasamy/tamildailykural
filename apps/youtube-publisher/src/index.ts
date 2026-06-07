import minimist from 'minimist';
import * as fs from 'fs';
import * as path from 'path';
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import { authorize } from './auth';
import { ensureTranslations } from './translate';
import { execSync } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';

// Load environment variables from the root .env file
dotenv.config({ path: path.join(process.cwd(), '../../.env') });

const TAMIL_MONTH_STARTS = [
  { name: 'சுறவம்', season: 'குளிர்', monthNum: 10 },
  { name: 'கும்பம்', season: 'பனி', monthNum: 11 },
  { name: 'மீனம்', season: 'நிறைபனி', monthNum: 12 },
  { name: 'மேழம்', season: 'சுடர்', monthNum: 1 },
  { name: 'விடை', season: 'அழல்', monthNum: 2 },
  { name: 'இரட்டை', season: 'வளி', monthNum: 3 },
  { name: 'கடகம்', season: 'முகில்', monthNum: 4 },
  { name: 'மடங்கல்', season: 'சாரல்', monthNum: 5 },
  { name: 'கன்னி', season: 'பெயல்', monthNum: 6 },
  { name: 'துலை', season: 'தாரை', monthNum: 7 },
  { name: 'நளி', season: 'பசுமை', monthNum: 8 },
  { name: 'சிலை', season: 'சீர்மை', monthNum: 9 }
];

const PURE_TAMIL_YEARS = [
  'நற்றோன்றல்', 'உயர்தோன்றல்', 'வெள்ளொளி', 'பேருவகை', 'மக்கட்செல்வம்',
  'அயல்முனி', 'திருமுகம்', 'தோற்றம்', 'இளமை', 'மாழை',
  'ஈச்சுரம்', 'கூலவளம்', 'முதன்மை', 'நேர்நிரல்', 'விளைபயன்',
  'ஓவியக்கதிர்', 'நற்கதிர்', 'தாங்கெழில்', 'நிலவரையன்', 'விரிமாண்பு',
  'முற்றறிவு', 'முழுநிறைவு', 'தீர்பகை', 'வளமாற்றம்', 'செய்நேர்த்தி',
  'நற்குழவி', 'உயர்வாகை', 'வாகை', 'காதன்மை', 'வெம்முகம்',
  'பொற்றாடை', 'அட்டி', 'எழில்மாறல்', 'வீறியெழல்', 'கீழறை',
  'நற்செய்கை', 'மங்கலம்', 'பகைக்கோடு', 'உலக நிறைவு', 'அருள் தோற்றம்',
  'நச்சுப்புழை', 'பிணைவிரகு', 'அழகு', 'பொதுநிலை', 'இகல்வீறு',
  'கழிவிரக்கம்', 'நற்றலைமை', 'பெருமகிழ்ச்சி', 'பெருமறம்', 'தாமரை',
  'பொன்மை', 'கருமை வீச்சு', 'முன்னியமுடிதல்', 'அழலி', 'கொடுமதி',
  'பேரிகை', 'ஒடுங்கி', 'செம்மை', 'எதிரேற்றம்', 'வளங்கலன்'
];

const getPureTamilYearName = (gregorianYear: number): string => {
  const index = ((gregorianYear - 1987) % 60 + 60) % 60;
  return PURE_TAMIL_YEARS[index];
};

async function uploadVideo(auth: any, videoPath: string, metadata: any) {
  const youtube = google.youtube({ version: 'v3', auth });
  const fileSize = fs.statSync(videoPath).size;

  console.log('Uploading video to YouTube...');
  
  const res = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: '27', // Education
        },
        status: {
          privacyStatus: 'private',
          publishAt: metadata.publishAt, // ISO string
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    },
    {
      onUploadProgress: (evt) => {
        const progress = (evt.bytesRead / fileSize) * 100;
        process.stdout.write(`\rUploading... ${Math.round(progress)}%`);
      },
    }
  );
  
  console.log(`\nVideo uploaded successfully! Video ID: ${res.data.id}`);
  return res.data.id;
}

async function getOrCreatePlaylist(auth: any, title: string) {
  const youtube = google.youtube({ version: 'v3', auth });
  
  // Try to find the playlist
  console.log(`Checking for playlist: "${title}"...`);
  let pageToken: string | undefined = undefined;
  
  do {
    const res = await youtube.playlists.list({
      part: ['snippet'],
      mine: true,
      maxResults: 50,
      pageToken,
    });
    
    const playlists = res.data.items || [];
    const found = playlists.find(p => p.snippet?.title === title);
    if (found) {
      console.log(`Found existing playlist. ID: ${found.id}`);
      return found.id;
    }
    
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  // If not found, create it
  console.log(`Playlist not found. Creating new playlist: "${title}"...`);
  const createRes = await youtube.playlists.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: title,
        description: `Tamil Daily Kural videos for ${title}`,
      },
      status: {
        privacyStatus: 'public',
      }
    }
  });
  
  console.log(`Created new playlist. ID: ${createRes.data.id}`);
  return createRes.data.id;
}

async function addVideoToPlaylist(auth: any, videoId: string, playlistId: string) {
  const youtube = google.youtube({ version: 'v3', auth });
  console.log(`Adding video ${videoId} to playlist ${playlistId}...`);
  
  await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId: playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId: videoId,
        }
      }
    }
  });
  console.log('Successfully added video to playlist!');
}

async function extractAndSetThumbnail(auth: any, videoId: string, videoPath: string) {
  if (!ffmpegStatic) {
    console.warn('ffmpeg-static not found, skipping thumbnail generation.');
    return;
  }

  // Calculate the exact time to extract the thumbnail (Intro Duration + 1 second)
  let extractTimeSec = 10; // Default fallback
  const introPath = path.resolve(process.cwd(), '../../public/Daily Kural Intro.mp4');
  
  if (fs.existsSync(introPath)) {
    try {
      // ffmpeg -i throws an exit code 1 if no output is provided, so we catch the error to read stderr
      execSync(`"${ffmpegStatic}" -i "${introPath}"`, { stdio: 'pipe', encoding: 'utf8' });
    } catch (e: any) {
      const output = (e.stderr || e.stdout || '').toString();
      const match = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseFloat(match[3]);
        const introDuration = (hours * 3600) + (minutes * 60) + seconds;
        extractTimeSec = introDuration + 1.5; // Grab frame 1.5s after intro finishes to be safe
      }
    }
  }

  const youtube = google.youtube({ version: 'v3', auth });
  
  // 1. Check if video-renderer created a perfect thumbnail already
  let thumbPath = videoPath.replace('_final_video.mp4', '_thumbnail.jpg');
  let isDynamic = false;

  if (!fs.existsSync(thumbPath)) {
    // 2. Fallback to dynamic extraction if pre-rendered image is missing
    isDynamic = true;
    thumbPath = path.join(process.cwd(), `thumbnail_${videoId}.jpg`);
    console.log(`Extracting thumbnail at ${extractTimeSec.toFixed(2)}s mark...`);
    try {
      execSync(`"${ffmpegStatic}" -y -ss ${extractTimeSec} -i "${videoPath}" -vframes 1 -q:v 2 "${thumbPath}"`, { stdio: 'pipe' });
    } catch (err: any) {
      console.error('Failed to extract thumbnail dynamically:', err.message);
      if (err.stdout) console.error(err.stdout.toString());
      if (err.stderr) console.error(err.stderr.toString());
    }
  } else {
    console.log('Found pre-rendered clean calendar thumbnail!');
  }

  // 3. Upload whatever thumbnail we found/created
  try {
    if (fs.existsSync(thumbPath)) {
      const stats = fs.statSync(thumbPath);
      console.log(`Generated thumbnail size: ${stats.size} bytes`);
      
      if (stats.size < 1000) {
        console.warn('Warning: Generated thumbnail is suspiciously small! It might be a blank frame.');
      }

      console.log('Uploading custom thumbnail to YouTube...');
      await youtube.thumbnails.set({
        videoId,
        media: {
          mimeType: 'image/jpeg',
          body: fs.createReadStream(thumbPath),
        }
      });
      console.log('Successfully set custom thumbnail!');
      
      if (isDynamic) {
        fs.unlinkSync(thumbPath); // Cleanup dynamically generated one
      }
    } else {
      console.error('Thumbnail file could not be found or generated!');
    }
  } catch (err: any) {
    console.error('Failed to upload thumbnail:', err.message);
    if (isDynamic && fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }
  }
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const dateStr = argv['start-date'] || argv['date']; // Gregorian date e.g. 2026-06-13
  const tamilDateArg = argv['tamil-date']; // e.g. 2057-02-29
  let kuralNum = parseInt(argv['kural'], 10);

  if (!dateStr || !tamilDateArg) {
    console.error("Usage: npm start -- --date=YYYY-MM-DD --tamil-date=YYYY-MM-DD");
    process.exit(1);
  }

  // 1. Locate Video & Infer Kural Number
  const tamilYm = tamilDateArg.substring(0, 7);
  const dailyVideosDir = path.join(process.cwd(), '../../data/Daily_Videos', tamilYm);
  
  if (!fs.existsSync(dailyVideosDir)) {
    console.error(`Directory not found: ${dailyVideosDir}`);
    process.exit(1);
  }

  let finalVideoPath = '';
  if (!isNaN(kuralNum)) {
    const prefix = kuralNum.toString().padStart(4, '0');
    finalVideoPath = path.join(dailyVideosDir, `${tamilDateArg}_${prefix}_final_video.mp4`);
  } else {
    // Auto-discover the video file
    const files = fs.readdirSync(dailyVideosDir);
    const matchedFile = files.find(f => f.startsWith(`${tamilDateArg}_`) && f.endsWith('_final_video.mp4'));
    
    if (!matchedFile) {
      console.error(`No final video found for tamil date ${tamilDateArg} in ${dailyVideosDir}`);
      process.exit(1);
    }
    
    // Extract kural number: "2057-02-29_0987_final_video.mp4" -> "0987" -> 987
    const parts = matchedFile.split('_');
    kuralNum = parseInt(parts[1], 10);
    finalVideoPath = path.join(dailyVideosDir, matchedFile);
    console.log(`Auto-detected Kural ${kuralNum} from video file: ${matchedFile}`);
  }

  if (!fs.existsSync(finalVideoPath)) {
    console.error(`Final video not found at ${finalVideoPath}`);
    process.exit(1);
  }

  // Authorize YouTube API
  const auth = await authorize();

  // 2. Fetch Translations (using Gemini AI)
  console.log(`Ensuring all language translations are available for Kural ${kuralNum}...`);
  const kuralData = await ensureTranslations(kuralNum);

  // 3. Prepare Metadata variables
  const [tYearStr, tMonthStr, tDayStr] = tamilDateArg.split('-');
  const tamilMonthNum = parseInt(tMonthStr, 10);
  const monthInfo = TAMIL_MONTH_STARTS.find(m => m.monthNum === tamilMonthNum) || TAMIL_MONTH_STARTS[0];
  
  const gregorianYear = new Date(`${dateStr}T00:00:00`).getFullYear();
  const oldTamilYearName = getPureTamilYearName(gregorianYear);
  const tamilTitle = kuralData.title;

  // Title: {Tamil date} {Kural Title} #tamilcalendar #tamilmonth #tamilseasons #kural #valluvar #{old-tamil-month-name}
  const titleRaw = `${tamilDateArg} ${tamilTitle} #tamilcalendar #tamilmonth #tamilseasons #kural #valluvar #${oldTamilYearName}`;
  const title = titleRaw.length > 100 ? titleRaw.substring(0, 97) + '...' : titleRaw;

  // Description format
  const descRaw = `${kuralData.Line1}
${kuralData.Line2}

${kuralData.transliteration1}
${kuralData.transliteration2}

Tamil Meaning:
${kuralData.tdk}

English Meaning:
${kuralData['tdk-explanation'] || kuralData.explanation}

Malayalam Meaning:
${kuralData['tdk-malayalam'] || 'N/A'}

Kannada Meaning:
${kuralData['tdk-kannada'] || 'N/A'}

Telugu Meaning:
${kuralData['tdk-telugu'] || 'N/A'}

Credits: www.thirukural.net

#tamilcalendar #tamilmonth #tamilseasons #kural #valluvar #${oldTamilYearName} #Thirukkural #DailyKural`;

  // 4. Prepare Publish time (4 AM IST of the Gregorian English Date)
  const publishDate = new Date(`${dateStr}T04:00:00+05:30`); 

  const tags = ['Thirukkural', 'Tamil', 'DailyKural', 'Valluvar', 'TamilCalendar'];

  const metadata = {
    title,
    description: descRaw,
    tags,
    publishAt: publishDate.toISOString()
  };

  console.log('\n--- Metadata Prepared ---');
  console.log('Title:', metadata.title);
  console.log('Publish At:', metadata.publishAt);
  console.log('-------------------------\n');

  // 5. Upload Video
  const videoId = await uploadVideo(auth, finalVideoPath, metadata);
  
  // 6. Set Custom Thumbnail (Dynamic time)
  await extractAndSetThumbnail(auth, videoId, finalVideoPath);

  // 7. Add to Playlist (Kural YYYY-MM)
  const targetPlaylistName = `Kural ${tamilYm}`;
  const playlistId = await getOrCreatePlaylist(auth, targetPlaylistName);
  await addVideoToPlaylist(auth, videoId, playlistId);
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
