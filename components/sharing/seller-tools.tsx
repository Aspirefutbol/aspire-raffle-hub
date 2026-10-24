"use client";

import { useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { manageSellerLink } from "@/lib/sharing/actions";
import { shareLinks } from "@/lib/sharing/schemas";
import { formatMoney } from "@/lib/fundraising/money";
import { bundleOfferText } from "@/lib/fundraising/campaign-pricing";

export function SellerTools({ orgSlug, participantId, price, ticketPackages = [] }: {
  orgSlug: string;
  participantId: string;
  price: number | null;
  ticketPackages?: unknown;
}) {
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [message, setMessage] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const [confirmation, setConfirmation] = useState<"create" | "revoke" | null>(null);
  const [qrPending, setQrPending] = useState(false);
  const [pending, start] = useTransition();
  const mutationInFlight = useRef(false);
  const currentUrl = useRef("");
  const links = shareLinks(url, price === null ? "the published price" : formatMoney(price), bundleOfferText(ticketPackages));

  function clearDisplayedLink(nextUrl = "") {
    currentUrl.current = nextUrl;
    setUrl(nextUrl);
    setQr("");
    setManualCopy("");
  }

  function manage() {
    if (confirmation === null || mutationInFlight.current) return;
    const revoke = confirmation === "revoke";
    // A rapid double tap must not rotate the link twice before React rerenders.
    mutationInFlight.current = true;
    clearDisplayedLink();
    setMessage("");
    start(async () => {
      try {
        const result = await manageSellerLink(orgSlug, { participant: participantId, revoke });
        if (!result.ok) { setMessage(result.error); return; }
        clearDisplayedLink(result.data.token ? `${window.location.origin}/s/${result.data.token}` : "");
        setMessage(revoke
          ? "Link revoked. Existing requests remain private in your inbox."
          : "Link ready. Copy it or choose how to share it below.");
      } catch {
        // The server may have changed the token before the response was lost.
        // Never keep offering an old link/QR code as if it were still confirmed.
        clearDisplayedLink();
        setMessage("We could not confirm the link change. Any previous link may no longer work. Create a new sharing link before sharing again. Existing requests remain in your inbox.");
      } finally {
        mutationInFlight.current = false;
        setConfirmation(null);
      }
    });
  }

  async function copy(kind: "link" | "message") {
    const sourceUrl = url;
    if (!sourceUrl || mutationInFlight.current) return;
    const text = kind === "link" ? sourceUrl : links.text;
    try {
      await navigator.clipboard.writeText(text);
      if (currentUrl.current !== sourceUrl) return;
      setManualCopy("");
      setMessage(kind === "link" ? "Link copied" : "Message copied. Paste it into your conversation.");
    } catch {
      if (currentUrl.current !== sourceUrl) return;
      setManualCopy(text);
      setMessage("Your browser could not copy automatically. Select and copy the text below.");
    }
  }

  async function showQr() {
    const sourceUrl = url;
    if (!sourceUrl || qrPending || mutationInFlight.current) return;
    setQrPending(true);
    try {
      const image = await QRCode.toDataURL(sourceUrl, { width: 240, margin: 4, errorCorrectionLevel: "M" });
      if (currentUrl.current === sourceUrl) setQr(image);
    } catch {
      if (currentUrl.current === sourceUrl) setMessage("The QR code could not be created. You can still copy or send your sharing link.");
    } finally { setQrPending(false); }
  }

  return <div className="space-y-3 rounded-control border border-line p-3" data-testid="seller-tools">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Step 1</p>
      <h4 className="mt-1 text-base font-semibold text-ink">Share the raffle</h4>
      <p className="mt-1 text-sm text-ink-soft">Send your link to friends and family so they can tell you how many tickets they want.</p>
      <p className="mt-1 text-xs text-muted">They are only requesting tickets here. No payment is collected and no ticket is issued yet.</p>
    </div>
    {!url ? <>
      <Button className="w-full" size="lg" disabled={pending} onClick={() => setConfirmation("create")}>Create my sharing link</Button>
      <details className="text-xs text-muted"><summary className="min-h-11 cursor-pointer py-2 font-medium">Need help with sharing?</summary><p>Already saved a link? Keep using it. Creating another replaces the previous link and QR code. Your player’s name is not shown on the supporter page.</p></details>
    </> : <>
      <p className="text-sm font-semibold text-ink">Your link is ready. Choose one:</p>
      <div className="grid grid-cols-1 gap-2">
        <Button size="lg" disabled={pending} onClick={() => copy("link")}>Copy link</Button>
        <Button size="lg" variant="secondary" disabled={pending} onClick={() => copy("message")}>Copy message</Button>
      </div>
      <p className="break-all text-xs text-muted" data-testid="seller-url">{url}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm underline [&>*]:inline-flex [&>*]:min-h-11 [&>*]:items-center">
        <a href={links.sms}>Text / SMS</a>
        <a href={links.email}>Email</a>
        <a href={links.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a href={url} target="_blank" rel="noopener noreferrer">Preview supporter page</a>
        <button type="button" disabled={pending || qrPending} onClick={showQr}>{qrPending ? "Creating QR code…" : "Show QR code"}</button>
      </div>
      {qr && <div>
        <Image unoptimized src={qr} alt="QR code for your supporter request page" width={240} height={240} className="h-auto max-w-full" />
        <a href={qr} download="fundraiser-qr.png" className="inline-flex min-h-11 items-center text-sm underline">Download QR code</a>
      </div>}
      <p className="break-words text-xs">{links.text}</p>
    </>}
    {message && <p role="status" className="text-xs">{message}</p>}
    {manualCopy && <label className="block text-xs font-medium text-ink">
      Copy manually
      <textarea readOnly value={manualCopy} onFocus={(event) => event.currentTarget.select()}
        className="mt-1 min-h-24 w-full rounded-control border border-line bg-surface p-2 text-sm" />
    </label>}
    <details className="border-t border-line pt-1">
      <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-muted">Link settings</summary>
      <div className="space-y-2 pb-1">
        <p className="text-xs text-muted">Only change these settings when you need to replace or disable a link. Links and printed QR codes already shared will stop working.</p>
        {url && <Button variant="secondary" className="min-h-11 h-auto w-full whitespace-normal py-2" disabled={pending} onClick={() => setConfirmation("create")}>Create a new sharing link</Button>}
        <Button variant="danger" className="min-h-11 h-auto w-full whitespace-normal py-2" disabled={pending} onClick={() => setConfirmation("revoke")}>{url ? "Revoke seller link" : "Revoke any saved seller link"}</Button>
      </div>
    </details>
    <Sheet open={confirmation !== null} onClose={() => { if (!mutationInFlight.current) setConfirmation(null); }}
      title={confirmation === "revoke" ? "Disable sharing link?" : "Create sharing link?"}
      description="Existing supporter requests stay in your private inbox. No sale, ticket or payment is changed."
      footer={<div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="lg" disabled={pending} onClick={() => { if (!mutationInFlight.current) setConfirmation(null); }}>Cancel</Button>
        <Button variant={confirmation === "revoke" ? "danger" : "primary"} size="lg" loading={pending} onClick={manage}>
          {confirmation === "revoke" ? "Confirm disable link" : "Confirm create link"}
        </Button>
      </div>}>
      <p className="text-sm text-ink-soft">{confirmation === "revoke"
        ? "The current link and any printed QR code for this player will stop accepting new requests."
        : "This creates a new link for this player. Any previous link or printed QR code will stop working. Share the new link with supporters instead."}</p>
      <p className="mt-3 text-sm font-medium text-ink">{confirmation === "revoke"
        ? "Choose Cancel to keep your link working."
        : "Already have a working link? Choose Cancel and keep sharing it."}</p>
    </Sheet>
  </div>;
}
