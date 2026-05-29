import { interpolate, useCurrentFrame, useVideoConfig, Audio, Img, staticFile } from 'remotion';
import React from 'react';
import { SharedBackground } from './SharedBackground';

export const Part2Kural: React.FC<{
  title: string;
  line1: string;
  line2: string;
  transliteration1: string;
  transliteration2: string;
  audioPath?: string;
  imagePath?: string;
}> = ({ title, line1, line2, transliteration1, transliteration2, audioPath, imagePath }) => {
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

          {/* Tamil Verse */}
          <div style={{ marginBottom: '60px', padding: '0 40px' }}>
            <h2 style={{ fontSize: '65px', color: '#174ea6', margin: '0 0 15px 0', fontWeight: 700, lineHeight: 1.4 }}>{line1}</h2>
            <h2 style={{ fontSize: '65px', color: '#174ea6', margin: 0, fontWeight: 700, lineHeight: 1.4 }}>{line2}</h2>
          </div>

          {/* English Transliteration */}
          <div style={{ marginBottom: '80px', padding: '0 40px' }}>
            <h3 style={{ fontSize: '55px', color: '#174ea6', margin: '0 0 15px 0', fontWeight: 600, lineHeight: 1.4 }}>{transliteration1}</h3>
            <h3 style={{ fontSize: '55px', color: '#174ea6', margin: 0, fontWeight: 600, lineHeight: 1.4 }}>{transliteration2}</h3>
          </div>

          {/* Illustrative Image */}
          <div style={{ 
            marginTop: 'auto', 
            marginBottom: '40px',
            width: '90%', 
            height: '650px', 
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

        </div>
      </SharedBackground>
      
      {audioPath && <Audio src={staticFile(audioPath)} />}
    </div>
  );
};
