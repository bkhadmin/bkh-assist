"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useFormStatus } from "react-dom";
import { AuthNotice } from "@/components/auth-card/auth-card";
import { ssoLogin } from "./actions";

const focus = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

// ?error= from Auth.js (pages.error = /login) or the signIn callback ("pending"); ?logged_out=1 from sign-out.
function UrlNotice() {
  const sp = useSearchParams();
  const error = sp.get("error");
  if (error === "pending") return <AuthNotice tone="warning">บัญชีรอการอนุมัติ</AuthNotice>;
  if (error) return <AuthNotice tone="danger">เข้าสู่ระบบไม่ได้ ลองใหม่อีกครั้ง</AuthNotice>;
  if (sp.has("logged_out")) return <AuthNotice tone="success">ออกจากระบบแล้ว</AuthNotice>;
  return null;
}

export function SsoLogin() {
  return (
    <div className="space-y-4">
      {/* Reads the URL, so it suspends under cacheComponents; the button stays in the static shell. */}
      <Suspense fallback={null}>
        <UrlNotice />
      </Suspense>
      <form action={ssoLogin}>
        <Suspense fallback={null}>
          <CallbackUrl />
        </Suspense>
        <SsoButton />
      </form>
    </div>
  );
}

// The logo is drawn for a white background, so the button stays light in both themes: surface (white) in light,
// foreground (near-white) in dark. No token is light in both, and these two are the closest pair.
function SsoButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label="เข้าสู่ระบบด้วย Provider ID"
      className={`grid h-14 w-full place-items-center rounded-md border border-accent-line bg-surface shadow-xs transition-colors hover:bg-accent-soft disabled:cursor-wait dark:border-transparent dark:bg-foreground dark:hover:bg-foreground/90 ${focus}`}
    >
      {/* Rendered at 111x44 CSS px; the 236x94 source covers 2x screens without upscaling. */}
      <Image src="/provider-id.png" alt="Provider ID" width={111} height={44} priority className={pending ? "animate-pulse" : undefined} />
    </button>
  );
}

function CallbackUrl() {
  return <input type="hidden" name="callbackUrl" value={useSearchParams().get("callbackUrl") ?? "/"} />;
}
