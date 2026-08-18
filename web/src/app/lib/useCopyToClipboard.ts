import { useState } from "react";

/** Copy-to-clipboard with a brief "copied" flip, shared by every copy-chip in the app (the MCP
 * URL, the Connect test prompt, the goal discuss-with-coach prompt) instead of each owning its
 * own useState + setTimeout pair. Returns whether the write actually succeeded — denial is
 * routine in webviews — so a caller that wants to track it (e.g. mcp_url_copied vs
 * mcp_url_copy_failed) can, without the hook swallowing that distinction itself. */
export function useCopyToClipboard(resetMs = 1500) {
  const [copied, setCopied] = useState(false);

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), resetMs);
      return true;
    } catch {
      return false;
    }
  }

  return { copied, copy };
}
