import { brand, pageTitle } from "@/lib/brand";
import { PasswordResetForm } from "@/components/auth/PasswordResetForm";

export const metadata = {
  title: pageTitle("Reset Password"),
  description: `Reset your ${brand.name} account password`,
};

export default function ResetPasswordPage() {
  return (
    <div className="container flex h-screen w-screen flex-col items-center justify-center">
      <PasswordResetForm />
    </div>
  );
}
