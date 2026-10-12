import { app, Menu, shell, type MenuItemConstructorOptions } from "electron";

const SITE = "https://kaitosoeno.com/erwin";
const ISSUES = "https://github.com/pockanoodles/erwin/issues";

/**
 * The OS menu bar. Standard roles do the work (copy and paste, zoom, window
 * management) so Erwin behaves like every other app on the machine; the only
 * additions are Settings in the app menu and help links.
 */
export function buildMenu(actions: { openSettings: () => void; openLogs: () => void }): Menu {
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
        { label: "Erwin website", click: () => void shell.openExternal(SITE) },
        { label: "Report a problem", click: () => void shell.openExternal(ISSUES) },
        { type: "separator" },
        { label: "Show logs", click: actions.openLogs },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
