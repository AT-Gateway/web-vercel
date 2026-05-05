import type { ServerResponse } from 'node:http';

export type SseEvent = {
  event: string;
  data: any;
  id?: string;
};

function writeSse(res: ServerResponse, evt: SseEvent) {
  if (evt.id) res.write(`id: ${evt.id}\n`);
  res.write(`event: ${evt.event}\n`);
  res.write(`data: ${JSON.stringify(evt.data)}\n\n`);
}

export class SseHub {
  private streams = new Map<string, Set<ServerResponse>>();
  private pingTimer: NodeJS.Timeout | null = null;

  startPings(intervalMs: number = 20_000) {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      for (const set of this.streams.values()) {
        for (const res of set) {
          try {
            res.write(`: ping\n\n`);
          } catch {
            // ignore
          }
        }
      }
    }, intervalMs);
  }

  stopPings() {
    if (!this.pingTimer) return;
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  add(pairingId: string, res: ServerResponse) {
    let set = this.streams.get(pairingId);
    if (!set) {
      set = new Set();
      this.streams.set(pairingId, set);
    }
    set.add(res);

    const remove = () => this.remove(pairingId, res);
    res.on('close', remove);
    res.on('finish', remove);
    res.on('error', remove);

    return () => this.remove(pairingId, res);
  }

  remove(pairingId: string, res: ServerResponse) {
    const set = this.streams.get(pairingId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.streams.delete(pairingId);
  }

  emit(pairingId: string, event: string, data: any) {
    const set = this.streams.get(pairingId);
    if (!set || set.size === 0) return;

    const evt: SseEvent = { event, data, id: String(Date.now()) };

    for (const res of set) {
      try {
        writeSse(res, evt);
      } catch {
        // If the socket is dead, remove it.
        this.remove(pairingId, res);
      }
    }
  }

  count(pairingId: string): number {
    return this.streams.get(pairingId)?.size ?? 0;
  }
}
