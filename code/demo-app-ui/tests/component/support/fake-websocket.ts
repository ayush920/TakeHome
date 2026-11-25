import { vi } from 'vitest';

/** Minimal controllable WebSocket so tests can open, deliver messages and drop the connection. */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static get latest(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }

  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {}

  serverOpens(): void {
    this.onopen?.();
  }

  serverSends(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  connectionDrops(): void {
    this.onclose?.();
  }

  static install(): void {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  }
}
