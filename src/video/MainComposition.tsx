import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import React from 'react';
import { Part1Calendar } from './components/Part1Calendar';
import { Part2Kural } from './components/Part2Kural';
import { Part3Meaning } from './components/Part3Meaning';

export const MainComposition: React.FC<{
  dateStr: string;
  part2Duration: number;
  part3Duration: number;
  kuralProps: any;
  meaningProps: any;
}> = ({ dateStr, part2Duration, part3Duration, kuralProps, meaningProps }) => {
  const { fps } = useVideoConfig();
  
  const part1Duration = 3 * fps; // 3 seconds
  const part4Duration = 3 * fps; // 3 seconds

  const startPart2 = part1Duration;
  const startPart3 = startPart2 + part2Duration;
  const startPart4 = startPart3 + part3Duration;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0f172a', fontFamily: 'sans-serif' }}>
      <Sequence from={0} durationInFrames={part1Duration}>
        <Part1Calendar dateStr={dateStr} />
      </Sequence>
      
      <Sequence from={startPart2} durationInFrames={part2Duration}>
        <Part2Kural {...kuralProps} />
      </Sequence>

      <Sequence from={startPart3} durationInFrames={part3Duration}>
        <Part3Meaning {...meaningProps} />
      </Sequence>

      <Sequence from={startPart4} durationInFrames={part4Duration}>
        <Part1Calendar dateStr={dateStr} />
      </Sequence>
    </AbsoluteFill>
  );
};
