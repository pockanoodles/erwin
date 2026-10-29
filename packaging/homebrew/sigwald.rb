cask "sigwald" do
  arch arm: "arm64", intel: "x64"

  version "{{VERSION}}"
  sha256 arm:   "{{SHA256_MAC_ARM64}}",
         intel: "{{SHA256_MAC_X64}}"

  url "https://github.com/pockanoodles/sigwald/releases/download/v#{version}/Sigwald-#{version}-mac-#{arch}.dmg",
      verified: "github.com/pockanoodles/sigwald/"
  name "Sigwald"
  desc "Planner that reads your calendar and tasks and names the next one to start"
  homepage "https://kaitosoeno.com/sigwald"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :monterey

  app "Sigwald.app"

  # Releases are ad-hoc signed until there is an Apple Developer ID
  # (packaging/README.md). Gatekeeper refuses such an app while it carries the
  # quarantine flag, so the cask clears it on the app it just checked against
  # sha256 above. Such a build can't update itself either, so `brew upgrade`
  # updates it. With notarization: drop this block and add `auto_updates true`.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Sigwald.app"]
  end

  zap trash: [
    "~/Library/Application Support/Sigwald",
    "~/Library/Caches/com.kaitosoeno.sigwald",
    "~/Library/Caches/com.kaitosoeno.sigwald.ShipIt",
    "~/Library/Logs/Sigwald",
    "~/Library/Preferences/com.kaitosoeno.sigwald.plist",
    "~/Library/Saved Application State/com.kaitosoeno.sigwald.savedState",
  ]
end
