"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type KeyboardHelpProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SHORTCUTS = [
  { key: "/", description: "Focus reply composer" },
  { key: "j", description: "Next thread" },
  { key: "k", description: "Prev thread" },
  { key: "⌘K", description: "Open thread palette" },
  { key: "⌘↵", description: "Send message" },
  { key: "Esc", description: "Close overlays" },
  { key: "?", description: "Open this help" },
];

export function KeyboardHelp({ open, onOpenChange }: KeyboardHelpProps) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
    }
  };

  const handleOverlayClick = () => {
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts help"
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-semibold tracking-tight">Keyboard shortcuts</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label="Close keyboard help"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border/50">
              {SHORTCUTS.map((shortcut, index) => (
                <tr key={index} className="flex items-center justify-between py-2">
                  <td className="font-mono text-xs font-semibold text-foreground">
                    {shortcut.key}
                  </td>
                  <td className="text-xs text-muted-foreground">{shortcut.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
