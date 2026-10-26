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

  auto_updates true
  depends_on macos: :monterey

  app "Erwin.app"

  zap trash: [
    "~/Library/Application Support/Erwin",
    "~/Library/Caches/com.kaitosoeno.erwin",
    "~/Library/Caches/com.kaitosoeno.erwin.ShipIt",
    "~/Library/Logs/Erwin",
    "~/Library/Preferences/com.kaitosoeno.erwin.plist",
    "~/Library/Saved Application State/com.kaitosoeno.erwin.savedState",
  ]
end
