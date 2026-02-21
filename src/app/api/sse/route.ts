import fs from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSIONS_DIR = path.join(
  os.homedir(),
  ".openclaw",
  "agents",
  "main",
  "sessions"
);

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function sendEvent(data: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      }

      // Send initial connected event
      sendEvent({ event: "connected" });

      // Set up file watching using fs.watch
      let watcher: fs.FSWatcher | null = null;
      try {
        if (fs.existsSync(SESSIONS_DIR)) {
          watcher = fs.watch(SESSIONS_DIR, (_eventType, filename) => {
            if (!filename) return;
            try {
              if (filename.includes(".jsonl")) {
                const sessionId = filename.split(".jsonl")[0];
                sendEvent({
                  event: "session_updated",
                  sessionId,
                });
              } else if (filename === "sessions.json") {
                sendEvent({ event: "sessions_index_updated" });
              }
            } catch {
              // stream may be closed
            }
          });
        }
      } catch {
        // watcher setup failed
      }

      // Keep-alive ping every 30s
      const pingInterval = setInterval(() => {
        try {
          sendEvent({ event: "ping" });
        } catch {
          clearInterval(pingInterval);
        }
      }, 30000);

      // Cleanup on close
      const cleanup = () => {
        clearInterval(pingInterval);
        if (watcher) watcher.close();
      };

      // Store cleanup for cancel
      (controller as unknown as Record<string, unknown>).__cleanup = cleanup;
    },
    cancel() {
      // Called when the client disconnects
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
