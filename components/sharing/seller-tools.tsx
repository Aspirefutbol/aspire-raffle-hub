"use client";
import { useState, useTransition } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { manageSellerLink } from "@/lib/sharing/actions";
import { shareLinks } from "@/lib/sharing/schemas";
import { formatMoney } from "@/lib/fundraising/money";
import { bundleOfferText } from "@/lib/fundraising/campaign-pricing";
export function SellerTools({ orgSlug, participantId, price, ticketPackages = [] }: { orgSlug: string; participantId: string; price: number | null; ticketPackages?: unknown }) {
  const [url, setUrl] = useState(""), [qr, setQr] = useState(""), [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const links = shareLinks(url, price === null ? "the published price" : formatMoney(price), bundleOfferText(ticketPackages));
  function manage(revoke: boolean) {
    start(async () => {
      try {
        const result = await manageSellerLink(orgSlug, { participant: participantId, revoke });
        if (!result.ok) { setMessage(result.error); return; }
        setQr("");
        setUrl(result.data.token ? `${window.location.origin}/s/${result.data.token}` : "");
        setMessage(revoke ? "Link revoked. Existing requests remain private in your inbox." : "Link ready. Replacing it stops the previous link.");
      } catch { setMessage("Link result uncertain. Replace it to recover safely; only the newest link will work."); }
    });
  }
  return <div className="space-y-3 rounded-control border border-line p-3" data-testid="seller-tools">
    <div>
      <h4 className="text-sm font-semibold text-ink">Share your raffle</h4>
      <p className="mt-1 text-xs text-muted">Create a private link for friends and family to request tickets. Requests do not collect payment or issue tickets.</p>
    </div>
    <Button variant="secondary" className="w-full" disabled={pending} onClick={() => manage(false)}>{url ? "Create a new sharing link" : "Get my sharing link"}</Button>
    {!url && <p className="text-xs text-muted">For privacy, your player’s name is not shown on this page. A new link replaces any previous link, so share the newest one.</p>}
    {url && <>
      <p className="text-xs font-medium text-ink">Your link is ready. Pick how to share it:</p>
      <p className="break-all text-xs text-muted" data-testid="seller-url">{url}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm underline [&>*]:inline-flex [&>*]:min-h-11 [&>*]:items-center">
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage("Link copied"); } catch { setMessage("Copy the displayed link manually."); } }}>Copy link</button>
        <a href={links.sms}>Text / SMS</a><a href={links.email}>Email</a><a href={links.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a href={url} target="_blank" rel="noopener noreferrer">Preview supporter page</a>
        <button type="button" onClick={async () => setQr(await QRCode.toDataURL(url, { width: 240, margin: 4, errorCorrectionLevel: "M" }))}>Show QR code</button>
      </div>
      {qr && <div><Image unoptimized src={qr} alt="QR code for your supporter request page" width={240} height={240} className="max-w-full"/><a href={qr} download="fundraiser-qr.png" className="text-sm underline">Download QR code</a></div>}
      <p className="break-words text-xs">{links.text}</p>
      <Button variant="ghost" disabled={pending} onClick={() => manage(true)}>Revoke seller link</Button>
    </>}
    {!url && <Button variant="ghost" disabled={pending} onClick={() => manage(true)}>Revoke any saved seller link</Button>}
    {message && <p role="status" className="text-xs">{message}</p>}
  </div>;
}
