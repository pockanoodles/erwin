import { brand } from "@/lib/brand";
import { redirect } from "next/navigation";

import { SetupForm } from "@/components/setup/SetupForm";

import { checkSetupStatus } from "@/lib/setup-actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Setup ${brand.name}`,
  description: `Set up your ${brand.name} admin account`,
};

export default async function SetupPage() {
  // Check if any users already exist
  const { needsSetup } = await checkSetupStatus();

  // If users already exist, redirect to home page
  if (!needsSetup) {
    redirect("/focus");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-4xl font-bold">{brand.name} Setup</h1>
        <p className="text-muted-foreground">
          Create your admin account to get started with the multi-user version
        </p>
      </div>

      <SetupForm />
    </div>
  );
}
