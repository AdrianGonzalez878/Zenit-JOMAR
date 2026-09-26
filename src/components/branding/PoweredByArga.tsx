import { ARGA_WEBSITE } from "@/lib/branding";

export function PoweredByArga({
  variant = "light",
  className = "",
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const body = variant === "dark" ? "text-white/90" : "text-[#667781]";

  return (
    <a
      href={ARGA_WEBSITE}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center transition-opacity hover:opacity-80 ${className}`}
      aria-label="Powered by ARGA Desarrollo de software"
    >que
      <span className={`text-[11px] font-normal leading-none ${body}`}>
        Powered by
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/branding/arga-logo-full.png"
        alt="ARGA"
        width={631}
        height={527}
        className="h-8 sm:h-9 w-auto shrink-0 bg-white object-contain"
      />
      <span className={`text-[11px] font-normal leading-none ${body}`}>
        ARGA | Desarrollo de software
      </span>
    </a>
  );
}
