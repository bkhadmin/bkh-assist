"use server";

import { signIn } from "@/auth";
import { safePath } from "@/lib/safe-path";

// Manual retry from /login (after an error or sign-out). The automatic start is /login/sso.
export async function ssoLogin(form: FormData) {
  await signIn("plkhealth", { redirectTo: safePath(form.get("callbackUrl")) });
}
