import { LogOut } from "lucide-react";

export function UserMenu({ name, email, roleLabel }: { name: string | null; email: string; roleLabel: string | null }) {
  const display = name || email;
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
        {initials(display)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{display}</p>
        <p className="truncate text-[11px] text-muted">{roleLabel ?? email}</p>
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-control p-1.5 text-muted hover:bg-canvas hover:text-ink"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}

function initials(value: string) {
  const parts = value.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
