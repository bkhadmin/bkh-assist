"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { safePath } from "@/lib/safe-path";

export type LoginState = { error: string; username: string } | null;

// Errors come back as state, so they show on /super/login itself rather than on /login.
export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const username = String(form.get("username") ?? "");
  try {
    await signIn("credentials", {
      username,
      password: form.get("password"),
      redirectTo: safePath(form.get("callbackUrl")),
    });
    return null;
  } catch (e) {
    if (!(e instanceof AuthError)) throw e; // success throws NEXT_REDIRECT, which must propagate
    const error = e.type === "CredentialsSignin" ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" : "เข้าสู่ระบบไม่ได้ ลองใหม่อีกครั้ง";
    return { error, username };
  }
}
