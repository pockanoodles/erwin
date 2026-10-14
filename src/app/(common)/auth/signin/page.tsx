import { brand, pageTitle } from "@/lib/brand";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/SignInForm";

import { getAuthOptions } from "@/lib/auth/auth-options";

export const metadata = {
  title: pageTitle("Sign In"),
  description: `Sign in to your ${brand.name} account`,
};

export default async function SignInPage() {
  // Check if user is already signed in
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/focus");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Sign in to {brand.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your calendar and tasks efficiently
          </p>
        </div>

        <SignInForm />
      </div>
    </div>
  );
}
