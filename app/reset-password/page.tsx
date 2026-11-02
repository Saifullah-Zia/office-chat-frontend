"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound, ArrowLeft } from "lucide-react";
import AuthCard from "@/components/AuthCard";
import ChangePasswordForm from "@/components/ChangePasswordForm";

/** Landing page of the emailed link: /reset-password?token=… */
function ResetPassword() {
  const token = useSearchParams().get("token");
  const [done, setDone] = useState(false);

  return (
    <AuthCard icon={<KeyRound size={22} />} title={done ? "Password changed" : "Choose a new password"}
      subtitle={!done && token ? "Use at least 8 characters." : undefined}>
      {done ? (
        <p className="auc-ok">Your password was changed and you were signed out everywhere. Sign in with the new one.</p>
      ) : token ? (
        <ChangePasswordForm resetToken={token} submitLabel="Save new password" onDone={() => setDone(true)} />
      ) : (
        <p className="auc-error">This link is incomplete. Open the link from the email again, or ask for a new one.</p>
      )}
      <Link href={done ? "/login" : "/forgot-password"} className="auc-link">
        <ArrowLeft size={14} /> {done ? "Go to sign in" : "Ask for a new link"}
      </Link>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <ResetPassword />
    </Suspense>
  );
}
