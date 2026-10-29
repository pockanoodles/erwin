import { app, Menu, shell, type MenuItemConstructorOptions } from "electron";

import { brand } from "./brand";

/**
 * The OS menu bar. Standard roles do the work (copy and paste, zoom, window
 * management) so Sigwald behaves like every other app on the machine; the only
 * additions are Settings in the app menu and help links.
 */
export function buildMenu(actions: { openSettings: () => void; openLogs: () => void; openBackups: () => void }): Menu {
  const isMac = process.platform === "darwin";
  const settings: MenuItemConstructorOptions = {
    label: isMac ? "Settings…" : "Settings",
    accelerator: "CmdOrCtrl+,",
    click: actions.openSettings,
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              settings,
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: isMac ? [{ role: "close" }] : [settings, { type: "separator" }, { role: "quit" }],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" } satisfies MenuItemConstructorOptions]),
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: `${brand.name} website`, click: () => void shell.openExternal(brand.siteUrl) },
        { label: "Report a problem", click: () => void shell.openExternal(brand.issuesUrl) },
        { type: "separator" },
        { label: "Show backups", click: actions.openBackups },
        { label: "Show logs", click: actions.openLogs },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
