"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState, useId } from "react";
import { AuthNotice } from "@/components/auth-card/auth-card";
import { login } from "./actions";

const field =
  "h-9 w-full rounded-md border border-line bg-surface px-3 text-base text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-danger";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  const errorId = useId();
  const invalid = state ? true : undefined;
  const describedBy = state ? errorId : undefined;

  return (
    <form action={action} className="space-y-4">
      {state && (
        <AuthNotice tone="danger" id={errorId}>
          {state.error}
        </AuthNotice>
      )}

      <div className="space-y-1.5">
        <label htmlFor="username" className="block text-sm font-medium">
          ชื่อผู้ใช้
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          autoFocus
          defaultValue={state?.username}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={field}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium">
          รหัสผ่าน
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={field}
        />
      </div>

      {/* Reads the URL, so it suspends under cacheComponents; the rest of the form stays in the static shell. */}
      <Suspense fallback={null}>
        <CallbackUrl />
      </Suspense>

      <button
        type="submit"
        disabled={pending}
        className="h-9 w-full rounded-md bg-accent text-base font-semibold text-accent-fg transition-colors outline-none hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}

function CallbackUrl() {
  return <input type="hidden" name="callbackUrl" value={useSearchParams().get("callbackUrl") ?? "/"} />;
}
