"use client";

export function BusinessAvatar({
  size = "sm",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass = {
    sm: "w-10 h-10 text-sm",
    md: "w-12 h-12 text-base",
    lg: "w-24 h-24 text-3xl",
  }[size];

  return (
    <div
      className={`rounded-full overflow-hidden bg-teal-600 flex items-center justify-center shrink-0 ${sizeClass} ${className}`}
    >
      <span className="text-white font-semibold">{size === "lg" ? "Z" : "Z"}</span>
    </div>
  );
}
