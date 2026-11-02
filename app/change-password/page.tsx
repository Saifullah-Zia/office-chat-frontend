"use client";

import { useEffect } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { apiPost } from "@/lib/api";
import { clearAuth, isAuthenticated } from "@/lib/auth";
import AuthCard from "@/components/AuthCard";
import ChangePasswordForm from "@/components/ChangePasswordForm";

/** After signing in with a temporary password (admin reset or CSV import): choose your own. */
export default function ChangePasswordPage() {
  useEffect(() => {
    if (!isAuthenticated()) window.location.replace("/login");
  }, []);

  const signOut = async () => {
    await apiPost("/api/account/logout").catch(() => {});
    clearAuth();
    window.location.href = "/login";
  };

  return (
    <AuthCard icon={<KeyRound size={22} />} title="Choose a new password"
      subtitle="You signed in with a temporary password. Pick your own to continue.">
      <ChangePasswordForm
        currentLabel="Temporary password"
        submitLabel="Save and continue"
        onDone={() => { window.location.href = "/"; }}
      />
      <button type="button" className="auc-link" onClick={signOut}><LogOut size={14} /> Sign out</button>
    </AuthCard>
  );
}
