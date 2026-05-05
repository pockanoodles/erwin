import { PasswordResetForm } from "@/components/auth/PasswordResetForm";

export const metadata = {
  title: "Reset Password - Erwin",
  description: "Reset your Erwin account password",
};

export default function ResetPasswordPage() {
  return (
    <div className="container flex h-screen w-screen flex-col items-center justify-center">
      <PasswordResetForm />
    </div>
  );
}
