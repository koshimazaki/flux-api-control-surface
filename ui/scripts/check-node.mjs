// Keep direct MCP/CLI launches on the patched runtime, too.
const [major, minor, patch] = process.versions.node.split(".").map(Number);
if (major !== 26 || minor < 12 || (minor === 12 && patch < 1)) {
  throw new Error(`FLUX API Control Surface requires Node.js >=26.12.1 <27 (October 2026 security release). Running ${process.version}. Run nvm install && nvm use from ui/, then reinstall dependencies and restart the dashboard and MCP.`);
}
