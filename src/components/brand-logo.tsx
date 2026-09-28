import Image from "next/image";
import blackLogo from "@/images/BLACK.png";
import whiteLogo from "@/images/WHITE.png";

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={["brand-logo", className].filter(Boolean).join(" ")} aria-label="Nexa Markets">
      <Image className="brand-logo-image brand-logo-light" src={blackLogo} alt="Nexa Markets" priority />
      <Image className="brand-logo-image brand-logo-dark" src={whiteLogo} alt="" aria-hidden="true" priority />
    </span>
  );
}
