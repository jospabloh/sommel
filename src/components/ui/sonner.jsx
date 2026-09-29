"use client";
import { useTheme } from "@/lib/ThemeContext"
import { Toaster as Sonner } from "sonner"

const Toaster = ({
  ...props
}) => {
  // Módulo 12: the RESOLVED colour on screen, from our own ThemeContext
  // (next-themes is not mounted anywhere in this app). Not mounted today
  // either (App.jsx uses ui/toaster.jsx), but it must not read a dead provider.
  const { resolvedTheme } = useTheme()

  return (
    (<Sonner
      theme={resolvedTheme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props} />)
  );
}

export { Toaster }
