import { SettingsSection } from "./SettingsSection";

export function NotificationSettings() {
  return (
    <SettingsSection
      title="Notification Settings"
      description="Configure your notification preferences."
    >
      <div className="mt-4 text-sm text-muted-foreground">
        More notification settings coming soon! You&apos;ll be able to customize
        event reminders, updates, and more.
      </div>
    </SettingsSection>
  );
}
