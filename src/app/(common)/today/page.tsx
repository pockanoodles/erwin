import { CommandDashboard } from "@/components/today/CommandDashboard";

/** The daily-driver command surface: today's ranked queue beside the goal
 *  each task ladders to. The post-login landing (see src/middleware.ts). */
export default function TodayPage() {
  return <CommandDashboard />;
}
