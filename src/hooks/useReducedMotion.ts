import { useEffect, useState } from "react";

/** Honours the OS "reduce motion" preference unless the user overrode it. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export function useReducedMotion(
  preference: "system" | "reduce" | "allow",
): boolean {
  const system = usePrefersReducedMotion();
  if (preference === "reduce") return true;
  if (preference === "allow") return false;
  return system;
}
