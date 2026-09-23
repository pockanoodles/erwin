"use client";

import { useState } from "react";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

import { LogOut, Settings } from "lucide-react";
import { HiDesktopComputer, HiMoon, HiOutlineCog, HiSun } from "react-icons/hi";

import { useTheme } from "@/components/providers/ThemeProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ThemeMode } from "@/types/settings";

interface SettingsMenuProps {
  labelClassName?: string;
}

/** Bottom-of-rail Settings entry: a single icon+label row whose menu holds
 *  the profile info, theme switcher, settings link, and sign-out. */
export function SettingsMenu({ labelClassName }: SettingsMenuProps) {
  const { data: session, status } = useSession();
  const { theme, setTheme } = useTheme();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const getInitials = () => {
    if (!session?.user?.name) return "U";
    return session.user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await signOut({ callbackUrl: "/auth/signin" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title="Settings"
          className="mx-2 flex h-8 w-[calc(100%-1rem)] items-center gap-2 whitespace-nowrap rounded-md px-2 text-[13px] font-normal tracking-tight text-muted-foreground transition-colors duration-150 hover:bg-background/80 hover:text-foreground dark:hover:bg-secondary"
        >
          <HiOutlineCog className="h-4 w-4 flex-none" />
          <span className={labelClassName}>Settings</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56"
        side="right"
        align="end"
        sideOffset={8}
      >
        {status === "authenticated" && session ? (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={session.user?.image || ""}
                    alt={session.user?.name || "User"}
                  />
                  <AvatarFallback>{getInitials()}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col space-y-1">
                  <p className="truncate text-sm font-medium leading-none">
                    {session.user?.name}
                  </p>
                  <p className="truncate text-xs leading-none text-muted-foreground">
                    {session.user?.email}
                  </p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as ThemeMode)}
        >
          <DropdownMenuRadioItem value="light">
            <HiSun className="mr-2 h-4 w-4" />
            <span>Light</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <HiMoon className="mr-2 h-4 w-4" />
            <span>Dark</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <HiDesktopComputer className="mr-2 h-4 w-4" />
            <span>System</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {status === "authenticated" && session ? (
          <>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>All settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>{isLoggingOut ? "Logging out..." : "Log out"}</span>
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/auth/signin" className="cursor-pointer">
              <span>Sign In</span>
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
