import '@testing-library/jest-dom/vitest';

/**
 * Node 22+ ships an experimental global `localStorage` that is undefined unless started with
 * --localstorage-file. It shadows jsdom's implementation, so every store using zustand `persist`
 * crashes on `setItem`. Provide an in-memory Storage when the global is unusable so the suite behaves
 * the same on any supported Node version.
 */
class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();
  get length(): number { return this.entries.size; }
  clear(): void { this.entries.clear(); }
  getItem(key: string): string | null { return this.entries.get(key) ?? null; }
  key(index: number): string | null { return [...this.entries.keys()][index] ?? null; }
  removeItem(key: string): void { this.entries.delete(key); }
  setItem(key: string, value: string): void { this.entries.set(key, String(value)); }
}

if (typeof globalThis.localStorage?.setItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
}
