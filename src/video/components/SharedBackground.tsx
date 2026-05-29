import { AbsoluteFill, Img, staticFile } from 'remotion';
import React from 'react';

export const SharedBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#FDFBF7', fontFamily: '"Noto Sans Tamil", "Latha", "Arial Unicode MS", sans-serif' }}>
      {/* Watermark */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Img 
          src={staticFile('Thiruvalluvar.jpeg')} 
          style={{ 
            width: '120%', 
            opacity: 0.1, 
            mixBlendMode: 'multiply' 
          }} 
        />
      </AbsoluteFill>

      {/* Decorative Border */}
      <AbsoluteFill style={{ padding: '40px' }}>
        <div style={{
          width: '100%',
          height: '100%',
          border: '4px solid #d4c6b3',
          outline: '2px solid #d4c6b3',
          outlineOffset: '-15px',
          position: 'relative',
          boxSizing: 'border-box'
        }}>
          {/* Corner Elements (CSS Approximation of floral) */}
          {[
            { top: '-10px', left: '-10px' },
            { top: '-10px', right: '-10px' },
            { bottom: '-10px', left: '-10px' },
            { bottom: '-10px', right: '-10px' }
          ].map((pos, i) => (
            <div key={i} style={{
              position: 'absolute',
              ...pos,
              width: '30px',
              height: '30px',
              backgroundColor: '#FDFBF7',
              border: '2px solid #d4c6b3',
              transform: 'rotate(45deg)'
            }} />
          ))}
          
          <div style={{ padding: '60px', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            {children}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
