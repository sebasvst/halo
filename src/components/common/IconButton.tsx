import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md";
  children: ReactNode;
}

export function IconButton({
  label,
  size = "md",
  children,
  className = "",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-btn icon-btn--${size} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
