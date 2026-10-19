"use client";

import { useCallback, useEffect, useState } from "react";

import {
  db,
  pendingSyncCount,
  type AttendanceMutation,
} from "@/lib/offline/db";

interface OfflineSyncResult {
  /** True while the browser reports no connectivity. */
  isOffline: boolean;
  /** Mutations not yet acknowledged by the server. */
  queuedCount: number;
  /** Pushes one attendance mutation to the local queue (optimistic UI). */
  queueAttendance: (input: Omit<AttendanceMutation, "id" | "createdAt" | "syncState" | "retryCount">) => Promise<number>;
  /** Flushes the queue to the API; safe to call from a visibility/online event. */
  syncNow: () => Promise<number>;
}

/**
 * useOfflineSync — Dexie-backed optimistic save + background sync.
 *
 * Writes are persisted locally first (never blocking the UI), then flushed
 * when the browser fires `online`, when the tab regains focus, or when the
 * caller explicitly invokes `syncNow()`.
 */
export function useOfflineSync(): OfflineSyncResult {
  const [isOffline, setIsOffline] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

  const refreshCount = useCallback(async () => {
    try {
      setQueuedCount(await pendingSyncCount());
    } catch {
      setQueuedCount(0);
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return 0;

    const queue = await db.attendance
      .where("syncState")
      .anyOf("pending", "failed")
      .limit(50)
      .toArray();

    if (queue.length === 0) {
      await refreshCount();
      return 0;
    }

    let flushed = 0;
    for (const item of queue) {
      try {
        await db.attendance.update(item.id!, { syncState: "syncing" });
        const response = await fetch("/api/institution/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: item.studentId,
            institutionId: item.institutionId,
            date: item.date,
            present: item.present,
            note: item.note ?? null,
          }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        await db.attendance.update(item.id!, { syncState: "synced" });
        flushed += 1;
      } catch (error) {
        await db.attendance.update(item.id!, {
          syncState: "failed",
          retryCount: item.retryCount + 1,
          lastError: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    await refreshCount();
    return flushed;
  }, [refreshCount]);

  const queueAttendance = useCallback<OfflineSyncResult["queueAttendance"]>(
    async (input) => {
      const id = await db.attendance.add({
        ...input,
        createdAt: Date.now(),
        syncState: "pending",
        retryCount: 0,
      });
      await refreshCount();
      void syncNow();
      return id;
    },
    [refreshCount, syncNow]
  );

  useEffect(() => {
    setIsOffline(typeof navigator !== "undefined" && !navigator.onLine);
    void refreshCount();

    const handleOnline = () => {
      setIsOffline(false);
      void syncNow();
    };
    const handleOffline = () => setIsOffline(true);
    const handleVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [refreshCount, syncNow]);

  return { isOffline, queuedCount, queueAttendance, syncNow };
}
