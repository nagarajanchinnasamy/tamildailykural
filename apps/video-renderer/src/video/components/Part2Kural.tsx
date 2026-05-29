import { interpolate, useCurrentFrame, useVideoConfig, Audio, Img, staticFile, AbsoluteFill } from 'remotion';
import React from 'react';
import { SharedBackground } from './SharedBackground';
import { useTheme } from '../theme';

export const Part2Kural: React.FC<{
  title: string;
  line1: string;
  line2: string;
  transliteration1: string;
  transliteration2: string;
  audioPath?: string;
  imagePath?: string;
}> = ({ title, line1, line2, transliteration1, transliteration2, audioPath, imagePath }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const translateY = interpolate(
    frame,
    [0, 30, durationInFrames - 30, durationInFrames],
    [100, 0, 0, -100],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const opacity = interpolate(
    frame,
    [0, 30, durationInFrames - 30, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const watermarkOpacity = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames],
    [0.10, 0.25], // Wait, previously it was 0.10 for heavy text pages. Calendar was 0.15.
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: theme.bgCanvas, opacity }}>
      <div style={{ width: '100%', height: '100%', transform: `translateY(${translateY}px)` }}>
        <SharedBackground hideBorder={true} watermarkOpacity={watermarkOpacity}>
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            padding: '80px 4% 60px 4%', // Added bottom margin
            boxSizing: 'border-box'
          }}>
            
            {/* Title */}
            <h1 style={{ 
              fontSize: 'clamp(40px, 6vw, 75px)', 
              color: theme.primaryText, 
              margin: '0 0 80px 0', 
              fontWeight: 800,
              whiteSpace: 'normal',
              lineHeight: 1.3,
              width: '100%',
              textAlign: 'center'
            }}>
              {title}
            </h1>

            {/* Tamil Verse */}
            <h2 style={{ 
              fontSize: '55px', 
              color: theme.highlightText, 
              margin: '0 0 60px 0', 
              fontWeight: 700, 
              lineHeight: 1.6, 
              textAlign: 'center', 
              width: '100%' 
            }}>
              {line1}<br/>{line2}
            </h2>

            {/* English Transliteration */}
            <h3 style={{ 
              fontSize: '45px', 
              color: theme.highlightText, 
              margin: '0 0 80px 0', 
              fontWeight: 600, 
              lineHeight: 1.6, 
              textAlign: 'center', 
              width: '100%' 
            }}>
              {transliteration1}<br/>{transliteration2}
            </h3>

            {/* Image (flexGrow to take remaining space) */}
            <div style={{ 
              width: '100%', 
              flexGrow: 1, 
              overflow: 'hidden',
              position: 'relative',
              borderRadius: '20px'
            }}>
              {imagePath ? (
                <>
                  <Img src={staticFile(imagePath)} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(30px)', opacity: 0.6, transform: 'scale(1.1)' }} />
                  <Img src={staticFile(imagePath)} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'contain' }} />
                </>
              ) : (
                <div style={{ width: '100%', height: '100%', backgroundColor: '#e2e8f0' }} />
              )}
            </div>

          </div>
        </SharedBackground>
        
        {audioPath && <Audio src={staticFile(audioPath)} />}
      </div>
    </AbsoluteFill>
  );
};
