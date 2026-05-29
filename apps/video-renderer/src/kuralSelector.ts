// src/kuralSelector.ts
import { StateManager } from './state';
import thirukkuralData from '../../../data/thirukkural.json';

export interface Kural {
  Number: number;
  Line1: string;
  Line2: string;
  Translation: string;
  mv: string;
  sp: string;
  mk: string;
  explanation: string;
  couplet: string;
  transliteration1: string;
  transliteration2: string;
}

export class KuralSelector {
  private kurals: Kural[];

  constructor() {
    this.kurals = thirukkuralData.kural as Kural[];
  }

  public selectNextKural(stateManager: StateManager): Kural {
    const history = stateManager.getHistory();
    // Keep history up to 1080 days for uniqueness
    const last1080Days = history.slice(-1080);
    const usedKuralNumbers = new Set(last1080Days.map(h => h.kuralNumber));
    
    // Check consecutive Adhikaaram
    let lastAdhikaaram = -1;
    if (history.length > 0) {
      lastAdhikaaram = history[history.length - 1].adhikaaramNumber;
    }

    // Filter available kurals
    const availableKurals = this.kurals.filter(kural => {
      const isUsed = usedKuralNumbers.has(kural.Number);
      const adhikaaram = KuralSelector.getAdhikaaramNumber(kural.Number);
      const isConsecutiveAdhikaaram = adhikaaram === lastAdhikaaram;
      return !isUsed && !isConsecutiveAdhikaaram;
    });

    if (availableKurals.length === 0) {
      throw new Error("No available Kurals left! All 1080 used or constraint failed.");
    }

    // Select randomly from available
    const randomIndex = Math.floor(Math.random() * availableKurals.length);
    const selected = availableKurals[randomIndex];
    
    return selected;
  }

  public selectSpecificKural(kuralNumber: number): Kural {
    const selected = this.kurals.find(k => k.Number === kuralNumber);
    if (!selected) {
      throw new Error(`Kural ${kuralNumber} not found in dataset.`);
    }
    return selected;
  }

  public static getAdhikaaramNumber(kuralNumber: number): number {
    return Math.ceil(kuralNumber / 10);
  }

  public static getShortTitle(kural: Kural): string {
    const words = kural.Line1.split(' ');
    // Use first 2 words for the short title
    return words.slice(0, 2).join(' ');
  }
}
