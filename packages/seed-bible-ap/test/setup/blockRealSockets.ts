// NO REAL SOCKETS IN A UNIT TEST — a WebSocket opened here is a test that reached a real room. The class records the
// URL and throws; `afterEach` fails the test that tried, naming the fix.
import { afterEach } from "vitest";

const attempted: string[] = [];

class BlockedWebSocket {
  constructor(url: string | URL) {
    attempted.push(String(url));
    throw new Error(
      `blocked WebSocket to ${String(url)} — stub \`openRoom\` in \`backend/room.ts\``
    );
  }
}

(globalThis as { WebSocket?: unknown }).WebSocket = BlockedWebSocket;

afterEach(() => {
  if (attempted.length) {
    const urls = attempted.splice(0);
    throw new Error(
      `a test opened ${urls.length} real WebSocket(s): ${urls.join(", ")} — stub \`openRoom\` in \`backend/room.ts\``
    );
  }
});
