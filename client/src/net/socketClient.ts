import type { C2SMessage, S2CMessage } from "@game/shared";

type Listener<T> = (payload: T) => void;

export class SocketClient {
  private ws: WebSocket | null = null;

  private readonly openListeners = new Set<Listener<void>>();

  private readonly closeListeners = new Set<Listener<CloseEvent>>();

  private readonly messageListeners = new Set<Listener<S2CMessage>>();

  private readonly errorListeners = new Set<Listener<string>>();

  connect(url: string): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      return;
    }

    this.ws = new WebSocket(url);

    this.ws.addEventListener("open", () => {
      this.openListeners.forEach((listener) => listener());
    });

    this.ws.addEventListener("close", (event) => {
      this.closeListeners.forEach((listener) => listener(event));
    });

    this.ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as S2CMessage;
        this.messageListeners.forEach((listener) => listener(payload));
      } catch {
        this.errorListeners.forEach((listener) => listener("invalid server payload"));
      }
    });

    this.ws.addEventListener("error", () => {
      this.errorListeners.forEach((listener) => listener("websocket connection error"));
    });
  }

  send(message: C2SMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onOpen(listener: Listener<void>): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  onClose(listener: Listener<CloseEvent>): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  onMessage(listener: Listener<S2CMessage>): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onError(listener: Listener<string>): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
}
