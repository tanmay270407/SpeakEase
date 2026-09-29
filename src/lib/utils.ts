import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || isNaN(totalSeconds) || totalSeconds <= 0) {
    return "00:00";
  }
  // If non-zero positive number less than 1 second, do not round down to 00:00
  const sec = totalSeconds > 0 && totalSeconds < 1 ? 1 : Math.round(totalSeconds);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
