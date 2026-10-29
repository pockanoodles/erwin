cask "erwin" do
  arch arm: "arm64", intel: "x64"

  version "{{VERSION}}"
  sha256 arm:   "{{SHA256_MAC_ARM64}}",
         intel: "{{SHA256_MAC_X64}}"

  url "https://github.com/pockanoodles/erwin/releases/download/v#{version}/Erwin-#{version}-mac-#{arch}.dmg",
      verified: "github.com/pockanoodles/erwin/"
  name "Erwin"
  desc "Planner that reads your calendar and tasks and names the next one to start"
  homepage "https://kaitosoeno.com/erwin"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :monterey

  app "Erwin.app"

  # Releases are ad-hoc signed until there is an Apple Developer ID
  # (packaging/README.md). Gatekeeper refuses such an app while it carries the
  # quarantine flag, so the cask clears it on the app it just checked against
  # sha256 above. Such a build can't update itself either, so `brew upgrade`
  # updates it. With notarization: drop this block and add `auto_updates true`.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Erwin.app"]
  end

  zap trash: [
    "~/Library/Application Support/Erwin",
    "~/Library/Caches/com.kaitosoeno.erwin",
    "~/Library/Caches/com.kaitosoeno.erwin.ShipIt",
    "~/Library/Logs/Erwin",
    "~/Library/Preferences/com.kaitosoeno.erwin.plist",
    "~/Library/Saved Application State/com.kaitosoeno.erwin.savedState",
  ]
end
