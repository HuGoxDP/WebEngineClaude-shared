#!/usr/bin/env bash
# Same as clone-all.ps1, for Git Bash / Linux / macOS. Run from an empty folder.
set -euo pipefail
gh=https://github.com/HuGoxDP
git clone "$gh/webengineclaude-shared.git" .claude-shared
git clone -b master "$gh/WebEngineTS.git"       WebEngineTS
git clone -b master "$gh/ScenarioCreator.git"   ScenarioCreator
git clone -b master "$gh/WebEngineTSEditor.git" WebEngineTSEditor
mkdir -p testv
git clone -b main   "$gh/virtual-lab.git"       testv/virtual-lab
cp .claude-shared/workspace/CLAUDE.md ./CLAUDE.md
cp .claude-shared/workspace/WebEngine.code-workspace ./WebEngine.code-workspace
(cd WebEngineTS && npm install && npm run build)
for d in ScenarioCreator WebEngineTSEditor/app testv/virtual-lab/frontend testv/virtual-lab/backend; do (cd "$d" && npm install); done
(cd WebEngineTS && npm run release:local)
echo "Done. Open this folder in the IDE."
