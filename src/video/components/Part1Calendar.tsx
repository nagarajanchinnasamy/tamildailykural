import { interpolate, useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';
import React from 'react';
import { SharedBackground } from './SharedBackground';
import { useTheme } from '../theme';

const TAMIL_DAYS = [
  'ஞாயிறு', 'திங்கள்', 'செவ்வாய்', 'அறிவன்', 'வியாழன்', 'வெள்ளி', 'காரி'
];

const TAMIL_MONTH_STARTS = [
  { name: 'சுறவம்', season: 'குளிர்', monthNum: 10, startMonth: 0, startDay: 14 },
  { name: 'கும்பம்', season: 'பனி', monthNum: 11, startMonth: 1, startDay: 13 },
  { name: 'மீனம்', season: 'நிறைபனி', monthNum: 12, startMonth: 2, startDay: 14 },
  { name: 'மேழம்', season: 'சுடர்', monthNum: 1, startMonth: 3, startDay: 14 },
  { name: 'விடை', season: 'அழல்', monthNum: 2, startMonth: 4, startDay: 15 },
  { name: 'இரட்டை', season: 'வளி', monthNum: 3, startMonth: 5, startDay: 15 },
  { name: 'கடகம்', season: 'முகில்', monthNum: 4, startMonth: 6, startDay: 16 },
  { name: 'மடங்கல்', season: 'சாரல்', monthNum: 5, startMonth: 7, startDay: 17 },
  { name: 'கன்னி', season: 'பெயல்', monthNum: 6, startMonth: 8, startDay: 17 },
  { name: 'துலை', season: 'தாரை', monthNum: 7, startMonth: 9, startDay: 17 },
  { name: 'நளி', season: 'பசுமை', monthNum: 8, startMonth: 10, startDay: 16 },
  { name: 'சிலை', season: 'சீர்மை', monthNum: 9, startMonth: 11, startDay: 16 }
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

const getTamilDateInfo = (dateObj: Date) => {
  const gMonth = dateObj.getMonth();
  const gDate = dateObj.getDate();

  let currentMonthIndex = -1;
  let prevStartMonth = -1;
  let prevStartDay = -1;

  for (let i = 0; i < TAMIL_MONTH_STARTS.length; i++) {
    const tm = TAMIL_MONTH_STARTS[i];
    if (gMonth === tm.startMonth && gDate >= tm.startDay) {
      currentMonthIndex = i;
      prevStartMonth = tm.startMonth;
      prevStartDay = tm.startDay;
      break;
    }
  }

  if (currentMonthIndex === -1) {
    const targetStartMonth = gMonth === 0 ? 11 : gMonth - 1;
    for (let i = 0; i < TAMIL_MONTH_STARTS.length; i++) {
      if (TAMIL_MONTH_STARTS[i].startMonth === targetStartMonth) {
        currentMonthIndex = i;
        prevStartMonth = TAMIL_MONTH_STARTS[i].startMonth;
        prevStartDay = TAMIL_MONTH_STARTS[i].startDay;
        break;
      }
    }
  }

  let startYear = dateObj.getFullYear();
  if (gMonth === 0 && prevStartMonth === 11) {
    startYear--;
  }

  const startDateObj = new Date(startYear, prevStartMonth, prevStartDay);
  const diffTime = Math.abs(dateObj.getTime() - startDateObj.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

  return {
    monthName: TAMIL_MONTH_STARTS[currentMonthIndex].name,
    season: TAMIL_MONTH_STARTS[currentMonthIndex].season,
    monthNum: TAMIL_MONTH_STARTS[currentMonthIndex].monthNum,
    dayNum: diffDays
  };
};

const getPureTamilYearName = (gregorianYear: number): string => {
  // 1987 is Prabhava (நற்றோன்றல்) which is index 0
  const index = ((gregorianYear - 1987) % 60 + 60) % 60;
  return PURE_TAMIL_YEARS[index];
};

export const Part1Calendar: React.FC<{ dateStr: string, fadeInOnly?: boolean, fadeOutOnly?: boolean }> = ({ dateStr, fadeInOnly, fadeOutOnly }) => {
  const theme = useTheme();
  const dateObj = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = TAMIL_DAYS[dateObj.getDay()];

  const tamilDate = getTamilDateInfo(dateObj);
  const tamilMonth = tamilDate.monthName;
  const tamilSeason = tamilDate.season;

  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, 15, durationInFrames - 15, durationInFrames],
    [
      fadeOutOnly ? 1 : 0,
      1,
      1,
      fadeInOnly ? 1 : 0
    ],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const gregorianYear = dateObj.getFullYear();
  const thiruvalluvarYear = gregorianYear + 31;
  const tamilYearName = getPureTamilYearName(gregorianYear);

  const mm = String(tamilDate.monthNum).padStart(2, '0');
  const dd = String(tamilDate.dayNum).padStart(2, '0');
  const mmdd = `${mm}-${dd}`;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: theme.bgCanvas, opacity }}>
      <div style={{ width: '100%', height: '100%' }}>
        <SharedBackground watermarkOpacity={0.15}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>

            {/* Block 1: Top (Thiruvalluvar Aandu, year number, year name) */}
            <div style={{ position: 'absolute', top: '60px', left: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 style={{ fontSize: '70px', color: theme.primaryText, margin: 0, fontWeight: 700, whiteSpace: 'nowrap' }}>திருவள்ளுவர் ஆண்டு</h2>
              <h1 style={{ fontSize: '160px', color: theme.highlightText, margin: '15px 0', fontWeight: 800 }}>{thiruvalluvarYear}</h1>
              <h2 style={{ fontSize: '70px', color: theme.primaryText, margin: 0, fontWeight: 700 }}>{tamilYearName}</h2>
            </div>

            {/* Block 2-a: Dead Center (02-13, Arivan) */}
            <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h1 style={{ fontSize: '280px', color: theme.highlightText, margin: 0, fontWeight: 800, lineHeight: 1.1 }}>{mmdd}</h1>
              <h2 style={{ fontSize: '100px', color: theme.primaryText, margin: '20px 0 0 0', fontWeight: 700 }}>{dayOfWeek}</h2>
            </div>

            {/* Block 2-b: Lower Center (Thingal, Paruvam) */}
            <div style={{ position: 'absolute', top: '75%', left: 0, width: '100%', transform: 'translateY(-50%)', display: 'flex', justifyContent: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '85%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '70px', color: theme.primaryText, margin: 0, fontWeight: 700 }}>திங்கள்</h3>
                  <h2 style={{ fontSize: '100px', color: theme.highlightText, margin: '10px 0 0 0', fontWeight: 800 }}>{tamilMonth}</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '70px', color: theme.primaryText, margin: 0, fontWeight: 700 }}>பருவம்</h3>
                  <h2 style={{ fontSize: '100px', color: theme.highlightText, margin: '10px 0 0 0', fontWeight: 800 }}>{tamilSeason}</h2>
                </div>
              </div>
            </div>

            {/* Block 3: Footnote (Gregorian day) */}
            <div style={{ position: 'absolute', bottom: '40px', left: 0, width: '100%', display: 'flex', justifyContent: 'center' }}>
              <h3 style={{ fontSize: '45px', color: theme.highlightText, margin: 0, fontWeight: 600 }}>{dateStr}</h3>
            </div>

          </div>
        </SharedBackground>
      </div>
    </AbsoluteFill>
  );
};
