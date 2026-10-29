# Snap

Sigwald has no `snapcraft.yaml`. electron-builder builds the snap itself.

## Why

electron-builder 26 has a `snap` target. With the `snap:` block in
`desktop/electron-builder.yml` and no `stagePackages`, it assembles the snap
from a prebuilt Electron template and does not call snapcraft. That path
exists for x64 and armv7l only, so Sigwald ships a snap for x64. Linux arm64
users get the AppImage, deb, rpm, tar.gz and the AUR package instead.

A `snapcraft.yaml` is not needed. electron-builder runs snapcraft itself when
the template is off (custom `stagePackages` or `useTemplateApp: false`) or when
the base is `core24`, which it documents as beta. That path needs snapcraft on
the runner, with LXD or destructive mode, and it builds for other architectures.
It is how an arm64 snap would ship later. In that case add
`sudo snap install snapcraft --classic` to the Linux build job.

## What CI does

- `build-linux` (x64) builds `Sigwald-<version>-linux-amd64.snap` with the other Linux files.
- The `snap` job in `.github/workflows/release.yml` uploads it to the `edge`
  channel with `snapcraft upload --release=edge`. It runs only when the
  `SNAPCRAFT_STORE_CREDENTIALS` secret exists and the draft release was created.

## One-time setup

1. Create a free account at https://snapcraft.io/account.
2. Install snapcraft and reserve the name:

   ```sh
   snapcraft register sigwald
   ```

3. Export a login that can only touch this snap and its edge and stable channels:

   ```sh
   snapcraft export-login --snaps=sigwald --channels=edge,stable \
     --acls=package_access,package_push,package_update,package_release \
     --expires=2027-10-29 credentials.txt
   ```

4. Save the file contents as the `SNAPCRAFT_STORE_CREDENTIALS` repo secret, then
   delete `credentials.txt`:

   ```sh
   gh secret set SNAPCRAFT_STORE_CREDENTIALS < credentials.txt
   ```

The login expires on the date you set, written `YYYY-MM-DD` or
`YYYY-MM-DDTHH:MM:SSZ` (snapcraft rejects a time without the `Z`). Export a new
one before then.

## Promoting to stable

A draft release only reaches `edge`. Test it with
`sudo snap install sigwald --edge`. Publishing the release runs
`.github/workflows/channels.yml`, which releases the revision with that
release's version to `stable`. Edge can hold a newer build, such as a
pre-release, and that one stays on edge.
By hand:

```sh
snapcraft status sigwald
snapcraft release sigwald <revision> stable
```

The first stable release goes through the Snap Store review.

## What the snap needs

`snap:` in `desktop/electron-builder.yml` sets strict confinement and the plugs
`default` and `network-bind`. Sigwald's own server listens on 127.0.0.1, which is
what `network-bind` is for. The snap name comes from `linux.executableName`
(`sigwald`).
