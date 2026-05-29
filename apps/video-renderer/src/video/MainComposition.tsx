import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import React from 'react';
import { Part1Calendar } from './components/Part1Calendar';
import { Part2Kural } from './components/Part2Kural';
import { Part3Meaning } from './components/Part3Meaning';
import { Theme, ThemeContext } from './theme';

export const MainComposition: React.FC<{
  dateStr: string;
  tamilYear: number;
  tamilMonth: number;
  tamilDay: number;
  part2Duration: number;
  part3Duration: number;
  kuralProps: any;
  meaningProps: any;
  theme: Theme;
}> = ({ dateStr, tamilYear, tamilMonth, tamilDay, part2Duration, part3Duration, kuralProps, meaningProps, theme }) => {
  const { fps } = useVideoConfig();
  
  const part1Duration = 3 * fps; // 3 seconds
  const part4Duration = 3 * fps; // 3 seconds

  const startPart2 = part1Duration;
  const startPart3 = startPart2 + part2Duration;
  const startPart4 = startPart3 + part3Duration;

  return (
    <ThemeContext.Provider value={theme}>
      <AbsoluteFill style={{ backgroundColor: theme.bgTransition, fontFamily: 'sans-serif' }}>
        <Sequence from={0} durationInFrames={part1Duration}>
          <Part1Calendar dateStr={dateStr} tamilYear={tamilYear} tamilMonth={tamilMonth} tamilDay={tamilDay} fadeOutOnly={true} />
        </Sequence>
        
        <Sequence from={startPart2} durationInFrames={part2Duration}>
          <Part2Kural {...kuralProps} />
        </Sequence>

        <Sequence from={startPart3} durationInFrames={part3Duration}>
          <Part3Meaning {...meaningProps} />
        </Sequence>

        <Sequence from={startPart4} durationInFrames={part4Duration}>
          <Part1Calendar dateStr={dateStr} tamilYear={tamilYear} tamilMonth={tamilMonth} tamilDay={tamilDay} fadeInOnly={true} />
        </Sequence>
      </AbsoluteFill>
    </ThemeContext.Provider>
  );
};
