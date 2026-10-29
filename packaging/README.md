# Releasing Sigwald

A tag builds every package and drafts a GitHub Release. Publishing the draft
ships it to every package manager below: `channels.yml` pushes the Homebrew
cask, the AUR package and the winget manifests, and releases the snap to
stable. Nothing is pushed by hand once each channel's secret is set.

The Mac App Store and the Microsoft Store come later, if people ask for them.
Their jobs stay in `release.yml` and do nothing until their secrets exist. The
Apple and Windows signing certificates come later too, so for now the macOS
app is ad-hoc signed and the Windows installer is unsigned (see "Unsigned
builds").

## Channels

| Channel | Install | How it updates |
| --- | --- | --- |
| GitHub Releases | Download from https://github.com/pockanoodles/sigwald/releases | The Windows installer and the AppImage update themselves from the release feed, and so will the macOS DMG and zip once they are notarized. deb, rpm and tar.gz do not. Download the new file. |
| winget | `winget install KaitoSoeno.Sigwald` | `winget upgrade KaitoSoeno.Sigwald`, or the in-app updater |
| Homebrew | `brew install --cask pockanoodles/tap/sigwald` | `brew upgrade --cask sigwald` |
| Snap Store | `sudo snap install sigwald` | snapd refreshes it |
| AUR | `yay -S sigwald-bin` | `yay -Syu` |
| Docker (self-hosted server) | `docker pull ghcr.io/pockanoodles/sigwald:latest` | Pull a newer tag |
| Mac App Store, Microsoft Store | Later | Their store |

The in-app updater is off in every build that a store or package manager
updates (`desktop/src/updater.ts`).

## How a release goes

1. Set the version in `desktop/package.json`, and the same version in
   `package.json`, and commit it.
2. Tag and push: `git tag v1.0.0 && git push origin v1.0.0`. The tag must match
   the version in `desktop/package.json`. The workflow stops if it does not.
3. `release.yml` builds every package and drafts a GitHub Release with the
   files and `SHA256SUMS.txt`. `docker.yml` builds the server image.
4. Download and test the draft (the snap is on `edge`). Publish it.
5. Publishing runs `channels.yml`. Its run summary lists which channels it
   pushed. A channel without its secret is skipped. Push that one by hand with
   the manifest script (see "Every release").

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
| `release` | Tag push, or a manual run with `create_release` | Draft release with every file and `SHA256SUMS.txt`, and a signed build provenance attestation for each file. |
| `snap` | `SNAPCRAFT_STORE_CREDENTIALS` exists | Uploads the snap to the `edge` channel. |
| `mas` | Mac App Store secrets exist, stable version | Builds a signed universal `.pkg`, keeps it as the `store-mas` artifact, and uploads it to App Store Connect when the API key secrets exist. |
| `msstore` | `MS_STORE_IDENTITY_NAME` and `MS_STORE_PUBLISHER` exist, stable version 1.0.0 or later | Builds the `.appx`, keeps it as the `store-appx` artifact, and uploads a draft submission when the Partner Center secrets exist. |

The store jobs start after the draft release exists, so nothing reaches a
store unless every direct build passed. The `.pkg` and `.appx` stay out of the
GitHub Release. Nobody can install them outside their store.

`docker.yml` runs on its own. A push to `main` publishes `ghcr.io/pockanoodles/sigwald:edge`.
A tag publishes `:X.Y.Z`, `:X.Y` and `:latest`, and a pre-release tag publishes
only its own version. Every published image carries a provenance attestation
in the registry.

## What runs on publish

`channels.yml` runs when a release is published, or by hand with a tag. It
checks out the tag, renders the manifests from the release's
`SHA256SUMS.txt`, keeps them as the `manifests` artifact, and then:

| Job | Runs when this secret exists | Result |
| --- | --- | --- |
| `tap` | `TAP_DEPLOY_KEY` | Commits `Casks/sigwald.rb` to `pockanoodles/homebrew-tap` |
| `aur` | `AUR_SSH_PRIVATE_KEY` | Pushes `PKGBUILD` and `.SRCINFO` to `sigwald-bin` on the AUR |
| `winget` | `WINGET_CREATE_GITHUB_TOKEN` | Opens the pull request on `microsoft/winget-pkgs` with `wingetcreate submit`, unless the version is already there or has an open pull request |
| `snap` | `SNAPCRAFT_STORE_CREDENTIALS` | Releases the revision with this release's version to `stable` |

Pre-releases stop after the plan. A job that finds its version already there
changes nothing, so a re-run is safe. The files in `packaging/` stay templates
with `{{...}}` tokens, and nothing commits rendered manifests back to this
repo.

## Checking a download

Every file in a release is in `SHA256SUMS.txt` and has a signed attestation
that says which workflow run, commit and tag built it:

```sh
gh attestation verify Sigwald-1.0.0-mac-arm64.dmg -R pockanoodles/sigwald
gh attestation verify oci://ghcr.io/pockanoodles/sigwald:1.0.0 -R pockanoodles/sigwald
```

## Unsigned builds

Until there is an Apple Developer ID and a Windows certificate:

- **macOS.** CI signs the app ad hoc and marks it `sigwaldBuild: adhoc`, which
  turns the in-app updater off (`desktop/src/updater.ts`): Squirrel.Mac can't
  update an ad-hoc signed app. Gatekeeper refuses the app while it carries the
  quarantine flag. The cask clears the flag in `postflight` and leaves updates
  to `brew upgrade`, and someone who downloads the DMG clears it with
  `xattr -dr com.apple.quarantine /Applications/Sigwald.app`. When notarization
  lands, drop the `postflight` block, add `auto_updates true` back to the cask
  and update the README's Install section.
  The same flag keeps the install keys out of the Keychain
  (`desktop/src/secrets.ts`). The Keychain trusts only the build that made an
  item, so every update would ask for the login password before the app could
  start. The keys stay in a file only the user can read, and the first signed
  build moves them into the Keychain by itself.
- **Windows.** SmartScreen asks once before the installer runs. winget
  installs it without asking.

Without any secrets the run still succeeds. You get unsigned packages and no
store uploads.

## Before the first release

- **Icon.** `desktop/build/icon.png` (square, 1024 px) is the icon source.
  Keep it committed. electron-builder uses it for the app, and the AUR package
  fetches it from the tag. `node scripts/brand-assets.mjs` regenerates it from
  `brand/app-icon.svg`.
- **Privacy policy.** Both app stores ask for a privacy policy URL. `DATAFLOW.md`
  is the source for what it says.
- **Docker image.** GitHub creates `ghcr.io/pockanoodles/sigwald` as a private
  package. After the first push, open the package settings and make it public.
  If a package with that name already exists, add this repo under "Manage
  Actions access" with write access.

## One-time setup per channel

| Channel | Account | Cost | Where |
| --- | --- | --- | --- |
| GitHub Releases and GHCR | Your GitHub account | Free | The repo |
| Homebrew tap | A repo named `pockanoodles/homebrew-tap`, with a deploy key | Free | https://github.com/new |
| AUR | AUR account with an SSH key for CI | Free | https://aur.archlinux.org/register |
| winget | A classic GitHub token with `public_repo` | Free | https://github.com/settings/tokens |
| Snap Store | Snapcraft account | Free | https://snapcraft.io/account |
| Apple (Developer ID, notarization, Mac App Store), later | Apple Developer Program | US$99 a year | https://developer.apple.com/programs/enroll/ |
| Windows code signing, later | An OV or EV certificate, or Azure Artifact Signing | Paid. Check the current price and eligibility with the provider. | Without it, SmartScreen warns on first run |
| Microsoft Store, later | Partner Center individual account | No registration fee in the current sign-up flow. It checks a government ID and a selfie. | https://storedeveloper.microsoft.com |

### Homebrew tap

1. Create the empty repo `pockanoodles/homebrew-tap` on GitHub and push
   `~/Projects/homebrew-tap` to it (see "First submission by hand"). CI clones
   it, so it needs that first commit.
2. Make a key for CI only: `ssh-keygen -t ed25519 -N "" -C sigwald-ci -f tap_key`.
3. In the tap's Settings, Deploy keys, add `tap_key.pub` with write access.
4. `gh secret set TAP_DEPLOY_KEY -R pockanoodles/sigwald < tap_key`, then delete
   both files.

The key can write to the tap and nothing else.

### AUR

1. Make a key for CI only: `ssh-keygen -t ed25519 -N "" -C sigwald-ci -f aur_key`.
2. Add `aur_key.pub` to your AUR account (My Account, SSH Public Key). The AUR
   takes several keys, one per line.
3. `gh secret set AUR_SSH_PRIVATE_KEY -R pockanoodles/sigwald < aur_key`, then
   delete both files.

The first push creates `sigwald-bin`. CI checks the AUR's host key against the
ED25519 fingerprint it publishes on https://aur.archlinux.org.

### winget

1. Create a classic token with the `public_repo` scope, as
   https://aka.ms/winget-create-token describes. wingetcreate forks
   `microsoft/winget-pkgs` into the token's account and opens the pull request
   from there.
2. `gh secret set WINGET_CREATE_GITHUB_TOKEN -R pockanoodles/sigwald`.

The first pull request is a new package, and the winget reviewers check it by
hand. Run the validation under "First submission by hand" on a Windows machine
first.

### Apple (later)

1. Enroll in the Apple Developer Program.
2. In Certificates, Identifiers & Profiles, create three certificates and
   export each from Keychain Access as a `.p12` with a password:
   - Developer ID Application, for the DMG and zip.
   - Apple Distribution, for the Mac App Store app.
   - Mac Installer Distribution, for the Mac App Store `.pkg`.
3. Register the explicit App ID `com.kaitosoeno.sigwald` and create a Mac App
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

### Microsoft Store (later)

1. Open the Partner Center account and reserve the name Sigwald as a new MSIX app.
2. Under Product management, Product identity, copy:
   - Package/Identity/Name into `MS_STORE_IDENTITY_NAME`.
   - Package/Identity/Publisher (it starts with `CN=`) into `MS_STORE_PUBLISHER`.
   - The Store ID (it starts with `9`) into `MS_STORE_PRODUCT_ID`.
   - Set `appx.publisherDisplayName` in `desktop/electron-builder.yml` to the
     publisher display name shown there.
3. Submit the first version by hand. Push a 1.0.0 tag with the two identity
   secrets in place. The `msstore` job keeps the `.appx` as the `store-appx`
   artifact. Download it from the run and upload it on the Packages page. Sigwald
   asks for the restricted `runFullTrust` capability, so Partner Center wants a
   sentence on why. The reason is that it runs its own local server.
4. After the app is live, set up automatic uploads. Register an application in
   Microsoft Entra ID and add a client secret. In Partner Center, open Account
   settings, User management, Microsoft Entra applications, and add it with the
   Manager role. Microsoft supports this route for free products only, and Sigwald
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
| `SNAPCRAFT_STORE_CREDENTIALS` | Snap upload and promotion | Output of `snapcraft export-login` |
| `TAP_DEPLOY_KEY` | Homebrew tap push | Private half of the tap's deploy key |
| `AUR_SSH_PRIVATE_KEY` | AUR push | Private half of the CI key on your AUR account |
| `WINGET_CREATE_GITHUB_TOKEN` | winget pull request | Classic token with `public_repo` |

`GITHUB_TOKEN` is built in. It pushes the Docker image and drafts the release.

## First submission by hand

CI can make every first submission. These are the checks to run before the
first one, and the fallback when a channel has no secret.

### winget

Run the manifest script (below), publish the release, then:

```sh
git clone git@github.com:<you>/winget-pkgs.git && cd winget-pkgs
dir=manifests/k/KaitoSoeno/Sigwald/1.0.0
mkdir -p "$dir" && cp /path/to/sigwald/packaging/winget/*.yaml "$dir"
```

On Windows, check it before you push:

```powershell
winget validate --manifest manifests\k\KaitoSoeno\Sigwald\1.0.0
winget settings --enable LocalManifestFiles
winget install --manifest manifests\k\KaitoSoeno\Sigwald\1.0.0
```

Commit on a branch and open a pull request titled
`New package: KaitoSoeno.Sigwald version 1.0.0`. The installer is the per-user
NSIS build (`Scope: user`). That matches `nsis.oneClick: true` and
`nsis.perMachine: false` in `desktop/electron-builder.yml`.

Later versions can go through `wingetcreate`, which needs a GitHub token (see
https://aka.ms/winget-create-token):

```powershell
wingetcreate update KaitoSoeno.Sigwald --version <version> --urls <installer url> --submit
```

### AUR

```sh
git clone ssh://aur@aur.archlinux.org/sigwald-bin.git
cp /path/to/sigwald/packaging/aur/sigwald-bin/PKGBUILD sigwald-bin/
cd sigwald-bin
makepkg --printsrcinfo > .SRCINFO    # on Arch
makepkg -f && namcap PKGBUILD *.pkg.tar.zst
git add PKGBUILD .SRCINFO && git commit -m "sigwald-bin 1.0.0" && git push origin master
```

The AUR only accepts the `master` branch. Cloning a new name gives you an
empty repository, and the first push creates the package.

### Homebrew tap

Once, before the first release:

```sh
cd ~/Projects/homebrew-tap
git remote add origin git@github.com:pockanoodles/homebrew-tap.git
git push -u origin main
```

After `channels.yml` has pushed the cask:

```sh
brew install --cask pockanoodles/tap/sigwald
brew audit --cask --online --strict pockanoodles/tap/sigwald
```

The cask in the tap is a copy of `packaging/homebrew/sigwald.rb`, and CI
overwrites it on every release.

## Every release

Publish the draft. `channels.yml` does the rest, and its run summary says which
channels it pushed. For a channel it skipped, render the manifests and push
them as in "First submission by hand":

```sh
gh release download v1.0.0 -p SHA256SUMS.txt -D /tmp/sigwald-release
node scripts/release/update-manifests.mjs 1.0.0 /tmp/sigwald-release/SHA256SUMS.txt \
  --tap ~/Projects/homebrew-tap
git diff packaging
```

Don't commit the rendered files. `packaging/` keeps the templates, and
`git checkout packaging` puts them back.

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

CI relies on `artifactName: "Sigwald-${version}-${os}-${arch}.${ext}"` in
`desktop/electron-builder.yml`. electron-builder fills `${arch}` per file type,
so the names differ by type:

| File | Name |
| --- | --- |
| DMG, zip | `Sigwald-<version>-mac-arm64.dmg`, `Sigwald-<version>-mac-x64.dmg` |
| NSIS installer | `Sigwald-<version>-win-x64.exe` |
| AppImage | `Sigwald-<version>-linux-x86_64.AppImage`, `-linux-arm64.AppImage` |
| deb | `Sigwald-<version>-linux-amd64.deb`, `-linux-arm64.deb` |
| rpm | `Sigwald-<version>-linux-x86_64.rpm`, `-linux-aarch64.rpm` |
| tar.gz | `Sigwald-<version>-linux-x64.tar.gz`, `-linux-arm64.tar.gz` |
| snap | `Sigwald-<version>-linux-amd64.snap` |

The tar.gz holds one top-level folder named after the file. The cask, the
winget manifest and the PKGBUILD read the five files named in
`scripts/release/update-manifests.mjs`.
