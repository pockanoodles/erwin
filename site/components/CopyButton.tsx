"use client";

import { useState } from "react";

/** Copies a command, says so for two seconds, and falls back to selecting the text. */
export function CopyButton({ text, label, done, targetId }: { text: string; label: string; done: string; targetId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById(targetId);
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  };
  return (
    <button type="button" className="copy" onClick={copy} aria-live="polite">
      {copied ? done : label}
    </button>
  );
}
