import path from "node:path";

export function workspaceRoot() {
  return path.resolve(process.cwd(), "..");
}

export function toWorkspaceRelativePath(filePath: string) {
  if (!path.isAbsolute(filePath)) return filePath.split(path.sep).join("/");
  const relative = path.relative(workspaceRoot(), filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return path.basename(filePath);
  }
  return relative.split(path.sep).join("/");
}
