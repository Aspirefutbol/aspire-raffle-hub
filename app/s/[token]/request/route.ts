import { supporterClient } from "@/lib/sharing/public";
import { sellerToken, submissionSchema } from "@/lib/sharing/schemas";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const accepted = () => Response.json({ accepted: true }, { headers });
  // Same-origin browser flow, strict body limit, no arbitrary public fields.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403, headers });
  if (Number(request.headers.get("content-length") || 0) > 8192) return new Response(null, { status: 413, headers });
  let text = "";
  const reader = request.body?.getReader();
  if (!reader) return accepted();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); return new Response(null, { status: 413, headers }); }
    chunks.push(value);
  }
  const decoder = new TextDecoder();
  for (const chunk of chunks) text += decoder.decode(chunk, { stream: true });
  text += decoder.decode();
  const { token } = await params;
  if (!sellerToken.safeParse(token).success) return accepted();
  let body: unknown;
  try { body = JSON.parse(text); } catch { return accepted(); }
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) return accepted();
  const { error } = await supporterClient().rpc("submit_seller_interest_request", { p_token: token, p_submission_key: parsed.data.key, p_request: parsed.data.request });
  if (error) return Response.json({ error: "Please retry the same request." }, { status: 503, headers });
  return accepted();
}
