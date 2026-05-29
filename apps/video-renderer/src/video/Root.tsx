// src/video/Root.tsx
import { Composition } from 'remotion';
import { MainComposition } from './MainComposition';
import { Part2Kural } from './components/Part2Kural';
import { Part3Meaning } from './components/Part3Meaning';
import { THEMES } from './theme';
import React from 'react';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ThirukkuralShort"
        component={MainComposition}
        durationInFrames={1800} // Dynamic
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          dateStr: '2026-05-27',
          part2Duration: 450,
          part3Duration: 600,
          kuralProps: { title: 'Test Kural', line1: 'Line 1', line2: 'Line 2', transliteration1: 'Trans 1', transliteration2: 'Trans 2' },
          meaningProps: { title: 'Test Kural', meaning: 'Meaning here', translation: 'Translation here' },
          theme: THEMES.indigo
        }}
      />
      <Composition
        id="Part2Kural"
        component={Part2Kural}
        durationInFrames={450} // Dynamic
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          title: 'அகர முதல',
          line1: 'அகர முதல எழுத்தெல்லாம் ஆதி',
          line2: 'பகவன் முதற்றே உலகு.',
          transliteration1: 'Akara Mudhala Ezhuththellaam Aadhi',
          transliteration2: 'Pakavan Mudhatre Ulaku',
          audioPath: undefined,
          imagePath: undefined
        }}
      />
      <Composition
        id="Part3Meaning"
        component={Part3Meaning}
        durationInFrames={600} // Dynamic
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          title: 'தொட்டனைத் தூறும்',
          meaningTamil: 'எழுத்துக்கள் எல்லாம் அகரத்தை அடிப்படையாக கொண்டிருக்கின்றன.',
          meaningEnglish: "'A' leads letters; the Ancient Lord Leads and lords the entire world",
          audioPath: undefined,
          imagePath: undefined
        }}
      />
    </>
  );
};
