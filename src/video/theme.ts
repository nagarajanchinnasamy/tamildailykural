import { createContext, useContext } from 'react';

export type Theme = {
  name: string;
  primaryText: string;
  highlightText: string;
  bgCanvas: string;
  bgTransition: string;
};

export const THEMES: Record<string, Theme> = {
  indigo: {
    name: 'indigo',
    primaryText: '#1C1917', // Deep Charcoal
    highlightText: '#1E3A8A', // Deep Royal Indigo
    bgCanvas: '#FDFBF7', // Cream
    bgTransition: '#171412' // Warm Espresso
  },
  crimson: {
    name: 'crimson',
    primaryText: '#1C1917',
    highlightText: '#8C2131', // Traditional Terracotta/Crimson
    bgCanvas: '#FDFBF7',
    bgTransition: '#171412'
  },
  emerald: {
    name: 'emerald',
    primaryText: '#1C1917',
    highlightText: '#064E3B', // Rich Forest Emerald
    bgCanvas: '#FDFBF7',
    bgTransition: '#171412'
  },
  copper: {
    name: 'copper',
    primaryText: '#1C1917',
    highlightText: '#9A3412', // Earthy Copper
    bgCanvas: '#FDFBF7',
    bgTransition: '#171412'
  }
};

export const ThemeContext = createContext<Theme>(THEMES.indigo);

export const useTheme = () => useContext(ThemeContext);
