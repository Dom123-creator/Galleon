"use client";

import { useState, useCallback } from "react";

export function useMission(missionId: string) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startMission = useCallback(async () => {
    setIsStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/missions/${missionId}/start`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to start mission");
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start mission";
      setError(message);
      throw err;
    } finally {
      setIsStarting(false);
    }
  }, [missionId]);

  const stopMission = useCallback(async () => {
    setIsStopping(true);
    setError(null);
    try {
      const response = await fetch(`/api/missions/${missionId}/stop`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to stop mission");
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stop mission";
      setError(message);
      throw err;
    } finally {
      setIsStopping(false);
    }
  }, [missionId]);

  const sendChatMessage = useCallback(
    async (content: string) => {
      const response = await fetch(`/api/missions/${missionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to send message");
      }
      return data;
    },
    [missionId]
  );

  return {
    startMission,
    stopMission,
    sendChatMessage,
    isStarting,
    isStopping,
    error,
  };
}
