import { AbsoluteFill, Img, staticFile } from 'remotion';
import React from 'react';
import { useTheme } from '../theme';

export const SharedBackground: React.FC<{ children: React.ReactNode, hideBorder?: boolean }> = ({ children, hideBorder }) => {
  const theme = useTheme();
  
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bgCanvas, fontFamily: '"Noto Sans Tamil", "Latha", "Arial Unicode MS", sans-serif', overflow: 'hidden' }}>
      {/* Watermark */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Img 
          src={staticFile('Thiruvalluvar.jpeg')} 
          style={{ 
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.1, 
            mixBlendMode: 'multiply' 
          }} 
        />
      </AbsoluteFill>

      {/* Decorative Border */}
      {!hideBorder && (
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
      )}

      {/* If hideBorder, just render children without the heavy padding wrapper */}
      {hideBorder && (
        <AbsoluteFill style={{ zIndex: 10 }}>
          {children}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
