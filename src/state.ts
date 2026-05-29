// src/state.ts

export interface StateRecord {
  date: string; // YYYY-MM-DD
  kuralNumber: number;
  adhikaaramNumber: number;
}

export interface AppState {
  history: StateRecord[];
}

export class StateManager {
  private state: AppState;

  constructor(initialState?: AppState) {
    this.state = initialState || { history: [] };
  }

  public getHistory(): StateRecord[] {
    return this.state.history;
  }

  public addRecord(record: StateRecord): void {
    this.state.history.push(record);
  }

  public getState(): AppState {
    return this.state;
  }
}
