# Clones the whole WebEngineTS ecosystem into the current folder, in the layout every
# repo's CLAUDE.md and the engine's `npm run release:local` expect. Run it from an empty
# folder, e.g. C:\Users\<you>\WebstormProjects\WebEngine:
#   powershell -ExecutionPolicy Bypass -File clone-all.ps1
$ErrorActionPreference = "Stop"
$gh = "https://github.com/HuGoxDP"

git clone "$gh/webengineclaude-shared.git" .claude-shared
git clone -b master "$gh/WebEngineTS.git"       WebEngineTS
git clone -b master "$gh/ScenarioCreator.git"   ScenarioCreator
git clone -b master "$gh/WebEngineTSEditor.git" WebEngineTSEditor
New-Item -ItemType Directory -Force testv | Out-Null
git clone -b main   "$gh/virtual-lab.git"       testv/virtual-lab

Copy-Item .claude-shared/workspace/CLAUDE.md          ./CLAUDE.md -Force
Copy-Item .claude-shared/workspace/WebEngine.code-workspace ./WebEngine.code-workspace -Force

Push-Location WebEngineTS
npm install
npm run build
Pop-Location
foreach ($d in "ScenarioCreator", "WebEngineTSEditor/app", "testv/virtual-lab/frontend", "testv/virtual-lab/backend") {
    Push-Location $d; npm install; Pop-Location
}
# Fresh engine into every consumer (they are installed now, so it reinstalls them too).
Push-Location WebEngineTS
npm run release:local
Pop-Location
Write-Host "Done. Open this folder in the IDE (or WebEngine.code-workspace in VS Code)."
