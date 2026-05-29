import { interpolate, useCurrentFrame, useVideoConfig, Audio, Img, staticFile, AbsoluteFill } from 'remotion';
import React from 'react';
import { SharedBackground } from './SharedBackground';
import { useTheme } from '../theme';

export const Part3Meaning: React.FC<{
  title: string;
  meaningTamil: string;
  meaningEnglish: string;
  audioPath?: string;
  imagePath?: string;
}> = ({ title, meaningTamil, meaningEnglish, audioPath, imagePath }) => {
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

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: theme.bgCanvas }}>
      <div style={{ width: '100%', height: '100%', opacity, transform: `translateY(${translateY}px)` }}>
        <SharedBackground hideBorder={true}>
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            padding: '80px 4% 60px 4%', // Added bottom padding for text
            boxSizing: 'border-box'
          }}>
            
            {/* Title */}
            <h1 style={{ 
              fontSize: 'clamp(40px, 6vw, 75px)', 
              color: theme.primaryText, 
              margin: '0 0 60px 0', 
              fontWeight: 800,
              whiteSpace: 'nowrap',
              width: '100%',
              textAlign: 'center'
            }}>
              {title}
            </h1>

            {/* Image (flexGrow to take remaining space) */}
            <div style={{ 
              width: '100%', 
              flexGrow: 1, 
              overflow: 'hidden',
              marginBottom: '60px'
            }}>
              {imagePath ? (
                <Img src={staticFile(imagePath)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', backgroundColor: '#e2e8f0' }} />
              )}
            </div>

            {/* Tamil Meaning */}
            <p style={{ 
              fontSize: '45px', 
              color: theme.highlightText, 
              margin: '0 0 50px 0', 
              fontWeight: 700, 
              lineHeight: 1.6, 
              textAlign: 'center', 
              width: '100%' 
            }}>
              {meaningTamil}
            </p>

            {/* English Translation */}
            <p style={{ 
              fontSize: '45px', 
              color: theme.highlightText, 
              margin: '0', 
              fontWeight: 600, 
              lineHeight: 1.6, 
              textAlign: 'center', 
              width: '100%' 
            }}>
              {meaningEnglish}
            </p>

          </div>
        </SharedBackground>
        
        {audioPath && <Audio src={staticFile(audioPath)} />}
      </div>
    </AbsoluteFill>
  );
};
