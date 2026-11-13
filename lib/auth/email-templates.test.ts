import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");

describe("canonical token-bearing auth email templates", () => {
  const templates = [
    ["magic_link", "magiclink"],
    ["invite", "invite"],
    ["recovery", "recovery"],
    ["email_change", "email_change"],
  ] as const;

  it.each(templates)("%s uses only canonical /auth/confirm for a %s token", (filename, type) => {
    const html = readFileSync(join(root, "supabase/templates", filename + ".html"), "utf8");
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(links).toEqual([
      "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=" + type,
    ]);
    expect(html).not.toMatch(/\.RedirectTo|\.ConfirmationURL/);
    expect(html).not.toMatch(/[?&](?:next|redirect_to|token)=/i);
    expect(config).toContain("[auth.email.template." + filename + "]");
    expect(config).toContain('content_path = "./supabase/templates/' + filename + '.html"');
  });

  it("does not accidentally include the local configuration in a hosted push instruction", () => {
    const docs = readFileSync(join(root, "docs/deployment.md"), "utf8");
    expect(docs).toContain("NEVER run `supabase config push`");
    expect(docs).toContain("redacted");
  });
});
