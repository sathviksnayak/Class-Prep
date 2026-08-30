import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  href?: string;
};

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-[#2f6f4b] text-white hover:bg-[#285d40] focus-visible:outline-[#2f6f4b]",
  secondary:
    "border border-[#d8e0d9] bg-white text-[#1f2d27] hover:bg-[#f4f8f5] focus-visible:outline-[#2f6f4b]",
  ghost: "text-[#2f6f4b] hover:bg-[#edf5f0] focus-visible:outline-[#2f6f4b]",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  href,
  disabled = false,
  type = "button",
  onClick,
  ...props
}: ButtonProps) {
  const baseClasses =
    "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  );
}
