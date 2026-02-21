"use client";

import { useEffect, useRef } from "react";
import { useStore } from "./store";

export function useSSE() {
  const setSseConnected = useStore((s) => s.setSseConnected);
  const setSessions = useStore((s) => s.setSessions);
  const setMessages = useStore((s) => s.setMessages);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource("/api/sse");
      eventSourceRef.current = es;

      es.onopen = () => {
        setSseConnected(true);
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "session_updated") {
            // Reload sessions list
            fetch("/api/all-sessions")
              .then((r) => r.json())
              .then((sessions) => setSessions(sessions))
              .catch(() => {});

            // Reload current session messages if it's the one that updated
            const state = useStore.getState();
            if (data.sessionId === state.currentSessionId) {
              const sess = state.sessions.find(
                (s) => s.sessionId === data.sessionId
              );
              const source = sess?.source || "kova";
              fetch(
                `/api/sessions/${data.sessionId}/messages?source=${source}`
              )
                .then((r) => r.json())
                .then((entries) => {
                  if (Array.isArray(entries)) setMessages(entries);
                })
                .catch(() => {});
            }
          } else if (data.event === "sessions_index_updated") {
            fetch("/api/all-sessions")
              .then((r) => r.json())
              .then((sessions) => setSessions(sessions))
              .catch(() => {});
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        setSseConnected(false);
        es.close();
        reconnectTimer.current = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, [setSseConnected, setSessions, setMessages]);
}
