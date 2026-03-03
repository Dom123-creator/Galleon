"use client";

import { useEffect, useRef, useCallback } from "react";

interface UseSSEOptions {
  url: string;
  enabled?: boolean;
  onEvent?: (event: { type: string; data: unknown }) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  reconnectInterval?: number;
}

export function useSSE({
  url,
  enabled = true,
  onEvent,
  onError,
  onConnect,
  reconnectInterval = 5000,
}: UseSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!enabled || !url) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      onConnect?.();
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEvent?.({ type: "message", data });
      } catch {
        // Ignore parse errors
      }
    };

    // Listen for specific event types
    const eventTypes = [
      "connected",
      "agent_started",
      "agent_progress",
      "agent_completed",
      "agent_error",
      "finding_created",
      "mission_status",
      "chat_message",
      "heartbeat",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          onEvent?.({ type, data });
        } catch {
          // Ignore parse errors
        }
      });
    }

    es.onerror = (error) => {
      onError?.(error);
      es.close();

      // Attempt reconnection
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, reconnectInterval);
    };
  }, [url, enabled, onEvent, onError, onConnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { disconnect, reconnect: connect };
}
