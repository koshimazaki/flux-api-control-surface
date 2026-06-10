import type { ComponentProps } from "react";

export function IconButton({ className, type, ...props }: ComponentProps<"button">) {
  return <button type={type || "button"} className={className ? `iconButton ${className}` : "iconButton"} {...props} />;
}
