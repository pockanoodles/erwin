# Releasing Erwin

One tag ships Erwin to every channel below. CI builds and uploads what it can.
Three channels need you to push a manifest by hand: winget, the AUR and the
Homebrew tap.

## Channels

| Channel | Install | How it updates |
| --- | --- | --- |
| GitHub Releases | Download from https://github.com/pockanoodles/erwin/releases | The macOS DMG and zip, the Windows installer and the AppImage update themselves from the release feed. deb, rpm and tar.gz do not. Download the new file. |
| Mac App Store | Search for Erwin in the App Store | App Store |
| Microsoft Store | Search for Erwin in the Microsoft Store | Microsoft Store |
| winget | `winget install KaitoSoeno.Erwin` | `winget upgrade KaitoSoeno.Erwin`, or the in-app updater |
| Homebrew | `brew install --cask pockanoodles/tap/erwin` | In-app updater, or `brew upgrade --cask --greedy erwin` |
| Snap Store | `sudo snap install erwin` | snapd refreshes it |
| AUR | `yay -S erwin-bin` | `yay -Syu` |
| Docker (self-hosted server) | `docker pull ghcr.io/pockanoodles/erwin:latest` | Pull a newer tag |

The in-app updater is off in every build that a store or package manager
updates (`desktop/src/updater.ts`).

## How a release goes

1. Set the version in `desktop/package.json`, and the same version in
   `package.json`, and commit it.
2. Tag and push: `git tag v1.0.0 && git push origin v1.0.0`. The tag must match
   the version in `desktop/package.json`. The workflow stops if it does not.
3. `release.yml` builds every package and drafts a GitHub Release with the
   files and `SHA256SUMS.txt`. `docker.yml` builds the server image.
4. Download and test the draft. Publish it. The manifests below point at the
   published files, so publish before you update them.
5. Update the manifests and push them to the channels (see "Every release").

A manual run of `release.yml` (Actions tab, Run workflow) builds everything and
keeps the files as workflow artifacts. Tick `create_release` to also draft the
release and run the store jobs.

## What runs on a tag

| Job | Runs | Result |
| --- | --- | --- |
| `plan` | Always | Checks the tag against `desktop/package.json` and records which secrets exist. The run summary shows the plan. |
| `build-macos` | Always, on `macos-15` | DMG and zip for arm64 and x64. Signed and notarized when the Apple secrets exist. Otherwise ad-hoc signed. electron-builder says such an app only runs on the machine that built it. |
| `build-windows` | Always | NSIS installer. Signed when the `WIN_CSC_*` secrets exist. |
| `build-linux` | Always, x64 and arm64 | AppImage, deb, rpm and tar.gz. The x64 job also builds the snap. |
| `release` | Tag push, or a manual run with `create_release` | Draft release with every file and `SHA256SUMS.txt`. |
| `snap` | `SNAPCRAFT_STORE_CREDENTIALS` exists | Uploads the snap to the `edge` channel. |
| `mas` | Mac App Store secrets exist, stable version | Builds a signed universal `.pkg`, keeps it as the `store-mas` artifact, and uploads it to App Store Connect when the API key secrets exist. |
| `msstore` | `MS_STORE_IDENTITY_NAME` and `MS_STORE_PUBLISHER` exist, stable version 1.0.0 or later | Builds the `.appx`, keeps it as the `store-appx` artifact, and uploads a draft submission when the Partner Center secrets exist. |

The store jobs start after the draft release exists, so nothing reaches a
store unless every direct build passed. The `.pkg` and `.appx` stay out of the
GitHub Release. Nobody can install them outside their store.

`docker.yml` runs on its own. A push to `main` publishes `ghcr.io/pockanoodles/erwin:edge`.
A tag publishes `:X.Y.Z`, `:X.Y` and `:latest`, and a pre-release tag publishes
only its own version.

Without any secrets the run still succeeds. You get unsigned packages and no
store uploads.

## Before the first release

- **Icon.** `desktop/build/icon.png` (square, 1024 px) is the icon source.
  Keep it committed. electron-builder uses it for the app, and the AUR package
  fetches it from the tag. `node scripts/brand-assets.mjs` regenerates it from
  `brand/app-icon.svg`.
- **Privacy policy.** Both app stores ask for a privacy policy URL. `DATAFLOW.md`
  is the source for what it says.
- **Docker image.** GitHub creates `ghcr.io/pockanoodles/erwin` as a private
  package. After the first push, open the package settings and make it public.
  If a package with that name already exists, add this repo under "Manage
  Actions access" with write access.

## One-time setup per channel

| Channel | Account | Cost | Where |
| --- | --- | --- | --- |
| GitHub Releases and GHCR | Your GitHub account | Free | The repo |
| Apple (Developer ID, notarization, Mac App Store) | Apple Developer Program | US$99 a year | https://developer.apple.com/programs/enroll/ |
| Microsoft Store | Partner Center individual account | No registration fee in the current sign-up flow. It checks a government ID and a selfie. | https://storedeveloper.microsoft.com |
| Windows code signing (optional) | An OV or EV certificate, or Azure Artifact Signing | Paid. Check the current price and eligibility with the provider. | Without it, SmartScreen warns on first run |
| Snap Store | Snapcraft account | Free | https://snapcraft.io/account |
| AUR | AUR account with your SSH public key | Free | https://aur.archlinux.org/register |
| winget | GitHub account and a fork of `microsoft/winget-pkgs` | Free | https://github.com/microsoft/winget-pkgs |
| Homebrew tap | A repo named `pockanoodles/homebrew-tap` | Free | https://github.com/new |

### Apple

1. Enroll in the Apple Developer Program.
2. In Certificates, Identifiers & Profiles, create three certificates and
   export each from Keychain Access as a `.p12` with a password:
   - Developer ID Application, for the DMG and zip.
   - Apple Distribution, for the Mac App Store app.
   - Mac Installer Distribution, for the Mac App Store `.pkg`.
3. Register the explicit App ID `com.kaitosoeno.erwin` and create a Mac App
   Store Connect provisioning profile for it. Download the
   `.provisionprofile`.
4. Create an app-specific password in your Apple Account settings, for
   notarization. Your team id is on the Membership page.
5. In App Store Connect, add a macOS app with that bundle id. Fill in the
   listing, the screenshots, the age rating and the privacy policy URL. The
   numeric Apple ID on the App Information page becomes `APP_STORE_APP_ID`.
6. In Users and Access, open Integrations, App Store Connect API, and create a key
   with the App Manager role. Note the key id and issuer id and download the
   `.p8` once.
7. The first build has to boot inside the App Sandbox. The MAS entitlements in
   `desktop/build/` carry no JIT entitlement, and PGlite runs WebAssembly.
   Install the first upload through TestFlight before you submit it for review.

### Microsoft Store

1. Open the Partner Center account and reserve the name Erwin as a new MSIX app.
2. Under Product management, Product identity, copy:
   - Package/Identity/Name into `MS_STORE_IDENTITY_NAME`.
   - Package/Identity/Publisher (it starts with `CN=`) into `MS_STORE_PUBLISHER`.
   - The Store ID (it starts with `9`) into `MS_STORE_PRODUCT_ID`.
   - Set `appx.publisherDisplayName` in `desktop/electron-builder.yml` to the
     publisher display name shown there.
3. Submit the first version by hand. Push a 1.0.0 tag with the two identity
   secrets in place. The `msstore` job keeps the `.appx` as the `store-appx`
   artifact. Download it from the run and upload it on the Packages page. Erwin
   asks for the restricted `runFullTrust` capability, so Partner Center wants a
   sentence on why. The reason is that it runs its own local server.
4. After the app is live, set up automatic uploads. Register an application in
   Microsoft Entra ID and add a client secret. In Partner Center, open Account
   settings, User management, Microsoft Entra applications, and add it with the
   Manager role. Microsoft supports this route for free products only, and Erwin
   is free.
5. Add `MS_STORE_TENANT_ID`, `MS_STORE_CLIENT_ID`, `MS_STORE_CLIENT_SECRET` and
   `MS_STORE_SELLER_ID` (the publisher id in Account settings).

From then on a tag uploads the package to a draft submission with `--noCommit`.
Open Partner Center and press Submit. If `msstore` rejects the file, upload the
`store-appx` artifact by hand. The CLI documents `.msix` and `.msixupload`, and
the workflow copies the `.appx` to a `.msix` name before it uploads.

### Snap Store

See `packaging/snap/README.md`.

## Repo secrets

Add them under Settings, Secrets and variables, Actions, or with
`gh secret set NAME`. Encode a binary file in one line:
`base64 -i file | tr -d '\n' | gh secret set NAME`. Every secret is optional.
A job that lacks its secrets skips that step.

| Secret | Used for | Value |
| --- | --- | --- |
| `CSC_LINK` | macOS signing | Developer ID Application `.p12`, base64 |
| `CSC_KEY_PASSWORD` | macOS signing | Password of that `.p12` |
| `APPLE_ID` | Notarization | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | Notarization | App-specific password |
| `APPLE_TEAM_ID` | Notarization, Mac App Store | Ten-character team id |
| `MAS_CSC_LINK` | Mac App Store | Apple Distribution `.p12`, base64 |
| `MAS_CSC_KEY_PASSWORD` | Mac App Store | Password of that `.p12` |
| `MAS_INSTALLER_CSC_LINK` | Mac App Store | Mac Installer Distribution `.p12`, base64 |
| `MAS_INSTALLER_CSC_KEY_PASSWORD` | Mac App Store | Password of that `.p12` |
| `MAS_PROVISIONING_PROFILE` | Mac App Store | `.provisionprofile`, base64 |
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect upload | API key id |
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect upload | Issuer id |
| `APP_STORE_CONNECT_API_KEY` | App Store Connect upload | Contents of the `.p8` file |
| `APP_STORE_APP_ID` | App Store Connect upload | Numeric Apple ID of the app record |
| `WIN_CSC_LINK` | Windows signing, optional | `.pfx`, base64 |
| `WIN_CSC_KEY_PASSWORD` | Windows signing, optional | Password of the `.pfx` |
| `MS_STORE_IDENTITY_NAME` | Microsoft Store package | Package/Identity/Name |
| `MS_STORE_PUBLISHER` | Microsoft Store package | Package/Identity/Publisher |
| `MS_STORE_PRODUCT_ID` | Microsoft Store submission | Store ID |
| `MS_STORE_TENANT_ID` | Microsoft Store submission | Entra tenant id |
| `MS_STORE_SELLER_ID` | Microsoft Store submission | Partner Center seller id |
| `MS_STORE_CLIENT_ID` | Microsoft Store submission | Entra application id |
| `MS_STORE_CLIENT_SECRET` | Microsoft Store submission | Entra client secret |
| `SNAPCRAFT_STORE_CREDENTIALS` | Snap upload | Output of `snapcraft export-login` |

`GITHUB_TOKEN` is built in. It pushes the Docker image and drafts the release.

## First submission by hand

### winget

Run the manifest script (below), publish the release, then:

```sh
git clone git@github.com:<you>/winget-pkgs.git && cd winget-pkgs
dir=manifests/k/KaitoSoeno/Erwin/1.0.0
mkdir -p "$dir" && cp /path/to/erwin/packaging/winget/*.yaml "$dir"
```

On Windows, check it before you push:

```powershell
winget validate --manifest manifests\k\KaitoSoeno\Erwin\1.0.0
winget settings --enable LocalManifestFiles
winget install --manifest manifests\k\KaitoSoeno\Erwin\1.0.0
```

Commit on a branch and open a pull request titled
`New package: KaitoSoeno.Erwin version 1.0.0`. The installer is the per-user
NSIS build (`Scope: user`). That matches `nsis.oneClick: true` and
`nsis.perMachine: false` in `desktop/electron-builder.yml`.

Later versions can go through `wingetcreate`, which needs a GitHub token (see
https://aka.ms/winget-create-token):

```powershell
wingetcreate update KaitoSoeno.Erwin --version <version> --urls <installer url> --submit
```

### AUR

```sh
git clone ssh://aur@aur.archlinux.org/erwin-bin.git
cp /path/to/erwin/packaging/aur/erwin-bin/PKGBUILD erwin-bin/
cd erwin-bin
makepkg --printsrcinfo > .SRCINFO    # on Arch
makepkg -f && namcap PKGBUILD *.pkg.tar.zst
git add PKGBUILD .SRCINFO && git commit -m "erwin-bin 1.0.0" && git push origin master
```

The AUR only accepts the `master` branch. Cloning a new name gives you an
empty repository, and the first push creates the package.

### Homebrew tap

```sh
cd ~/Projects/homebrew-tap
git remote add origin git@github.com:pockanoodles/homebrew-tap.git
git add -A && git commit -m "erwin 1.0.0" && git push -u origin main
brew install --cask pockanoodles/tap/erwin
brew audit --cask --online --strict pockanoodles/tap/erwin
```

Create the empty GitHub repo `pockanoodles/homebrew-tap` first. The cask in the
tap is a copy of `packaging/homebrew/erwin.rb`. The script writes both.

A DMG that is not notarized fails Gatekeeper after `brew install`. Notarize
before you publish the cask.

## Every release

```sh
gh release download v1.0.0 -p SHA256SUMS.txt -D /tmp/erwin-release
node scripts/release/update-manifests.mjs 1.0.0 /tmp/erwin-release/SHA256SUMS.txt \
  --tap ~/Projects/homebrew-tap
git diff packaging
```

Then:

- Commit the changes in this repo.
- Commit and push the tap.
- Copy `packaging/winget/*.yaml` into a new version folder in your
  `winget-pkgs` fork and open the pull request.
- Copy `PKGBUILD` and `.SRCINFO` into the AUR clone and push.

### The manifest script

```sh
node scripts/release/update-manifests.mjs <version> <SHA256SUMS.txt>           # rewrite in place
node scripts/release/update-manifests.mjs <version> <SHA256SUMS.txt> --check   # report only, exit 1 if stale
```

Other options: `--tap <dir>` writes the cask into a tap checkout, `--date
YYYY-MM-DD` sets the release date, `--root <dir>` points at another repo
checkout. It updates the cask, the three winget files, `PKGBUILD` and
`.SRCINFO` (derived from the `PKGBUILD`). Run it from a checkout of the release
tag. The AUR checksums for `LICENSE` and the
icon come from that checkout. Stable versions only.

The `{{...}}` tokens in the manifests mark values that do not exist before the
first release. The script replaces them and keeps working on later runs.

## File names

CI relies on `artifactName: "Erwin-${version}-${os}-${arch}.${ext}"` in
`desktop/electron-builder.yml`. electron-builder fills `${arch}` per file type,
so the names differ by type:

| File | Name |
| --- | --- |
| DMG, zip | `Erwin-<version>-mac-arm64.dmg`, `Erwin-<version>-mac-x64.dmg` |
| NSIS installer | `Erwin-<version>-win-x64.exe` |
| AppImage | `Erwin-<version>-linux-x86_64.AppImage`, `-linux-arm64.AppImage` |
| deb | `Erwin-<version>-linux-amd64.deb`, `-linux-arm64.deb` |
| rpm | `Erwin-<version>-linux-x86_64.rpm`, `-linux-aarch64.rpm` |
| tar.gz | `Erwin-<version>-linux-x64.tar.gz`, `-linux-arm64.tar.gz` |
| snap | `Erwin-<version>-linux-amd64.snap` |

The tar.gz holds one top-level folder named after the file. The cask, the
winget manifest and the PKGBUILD read the five files named in
`scripts/release/update-manifests.mjs`.
