import { interpolate, useCurrentFrame, useVideoConfig, Audio, Img, staticFile } from 'remotion';
import React from 'react';
import { SharedBackground } from './SharedBackground';

export const Part3Meaning: React.FC<{
  title: string;
  meaning: string;
  translation: string;
  audioPath?: string;
  imagePath?: string;
}> = ({ title, meaning, translation, audioPath, imagePath }) => {
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
    <div style={{ width: '100%', height: '100%', opacity, transform: `translateY(${translateY}px)` }}>
      <SharedBackground>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          height: '100%',
          width: '100%',
          paddingTop: '60px',
          textAlign: 'center'
        }}>
          
          {/* Title & Divider */}
          <h1 style={{ fontSize: '90px', color: '#000', margin: 0, fontWeight: 800 }}>{title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', margin: '30px 0 60px 0' }}>
            <div style={{ width: '150px', height: '3px', backgroundColor: '#000' }} />
            <div style={{ width: '15px', height: '15px', backgroundColor: '#000', transform: 'rotate(45deg)' }} />
            <div style={{ width: '150px', height: '3px', backgroundColor: '#000' }} />
          </div>

          {/* Illustrative Image */}
          <div style={{ 
            marginBottom: '60px',
            width: '90%', 
            height: '550px', 
            borderRadius: '60px', 
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            {imagePath ? (
              <Img src={staticFile(imagePath)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', backgroundColor: '#e2e8f0' }} />
            )}
          </div>

          {/* Tamil Meaning */}
          <div style={{ marginBottom: '60px', padding: '0 60px' }}>
            <p style={{ fontSize: '55px', color: '#174ea6', margin: 0, fontWeight: 700, lineHeight: 1.5 }}>{meaning}</p>
          </div>

          {/* English Translation */}
          <div style={{ padding: '0 60px' }}>
            <p style={{ fontSize: '55px', color: '#174ea6', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>{translation}</p>
          </div>

        </div>
      </SharedBackground>
      
      {audioPath && <Audio src={staticFile(audioPath)} />}
    </div>
  );
};
