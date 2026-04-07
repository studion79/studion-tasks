"use client";

import { useEffect } from "react";

export default function ZoomLock() {
  useEffect(() => {
    const onGesture = (event: Event) => {
      event.preventDefault();
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };

    document.addEventListener("gesturestart" as keyof DocumentEventMap, onGesture as EventListener, { passive: false });
    document.addEventListener("gesturechange" as keyof DocumentEventMap, onGesture as EventListener, { passive: false });
    document.addEventListener("gestureend" as keyof DocumentEventMap, onGesture as EventListener, { passive: false });
    document.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      document.removeEventListener("gesturestart" as keyof DocumentEventMap, onGesture as EventListener);
      document.removeEventListener("gesturechange" as keyof DocumentEventMap, onGesture as EventListener);
      document.removeEventListener("gestureend" as keyof DocumentEventMap, onGesture as EventListener);
      document.removeEventListener("wheel", onWheel);
    };
  }, []);

  return null;
}
