import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { campaignTicketQuote, ticketAmountsForQuote } from "./campaign-pricing";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
describe.skipIf(!url)("ticket packages: SQL/client exact parity on disposable local DB", () => {
  it("matches quotes, bundle choices, and ticket-level cents for all 1–500 quantities", () => {
    if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Package parity tests refuse hosted databases.");
    const socket = process.env.DOCKER_HOST ?? "unix:///var/run/docker.sock";
    if (!/^unix:\/\/\/[^\s?#\0]+$/.test(socket)) throw new Error("Only a local Docker socket is permitted.");
    const cases = [
      { single: 2000, bundles: [{ quantity: 5, priceCents: 9000 }] },
      { single: 2000, bundles: [{ quantity: 5, priceCents: 9000 }, { quantity: 3, priceCents: 5000 }] },
      { single: 500, bundles: [{ quantity: 3, priceCents: 1000 }] },
      { single: 2000, bundles: [] },
    ];
    for (const config of cases) {
      // Only fixed, JSON-encoded numeric test fixtures enter the local SQL text.
      const sql = `select jsonb_agg(public.campaign_sale_pricing(q,${config.single},'${JSON.stringify(config.bundles)}'::jsonb) order by q) from generate_series(1,500) q;`;
      const output = execFileSync("docker", ["--host", socket, "exec", "supabase_db_aspire-raffle-hub", "psql", "-U", "postgres", "-d", "postgres", "-AtX", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", timeout: 45_000, maxBuffer: 8_000_000 });
      const results = JSON.parse(output) as Array<{ quote: unknown; ticketAmountsCents: number[] }>;
      expect(results).toHaveLength(500);
      results.forEach((result, index) => {
        const quote = campaignTicketQuote(index + 1, config.single, config.bundles);
        expect(result.quote, `Quantity ${index + 1}`).toEqual(quote);
        expect(result.ticketAmountsCents).toEqual(ticketAmountsForQuote(quote!));
      });
    }
  }, 180_000);
});
