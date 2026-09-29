import { useState } from "react";
import { User } from "lucide-react";
import { cn } from "../lib/utils";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  theme?: "indigo" | "teal" | "slate";
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-16 h-16 text-xl",
  xl: "w-24 h-24 text-3xl",
};

export function Avatar({ src, name, size = "md", className, theme = "indigo" }: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const getInitials = (n?: string | null) => {
    if (!n) return null;
    const parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const initials = getInitials(name);

  const bgClasses = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
    teal: "bg-teal-50 text-teal-700 border-teal-100",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  };

  if (src && !imageError) {
    return (
      <img
        src={src}
        alt={name || "Profile avatar"}
        onError={() => setImageError(true)}
        className={cn(
          "rounded-full object-cover border border-slate-200 shadow-2xs flex-shrink-0",
          sizeClasses[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full border flex items-center justify-center font-semibold select-none flex-shrink-0",
        sizeClasses[size],
        bgClasses[theme],
        className
      )}
      aria-label={name || "User avatar"}
    >
      {initials ? initials : <User className="w-1/2 h-1/2 opacity-70" />}
    </div>
  );
}
