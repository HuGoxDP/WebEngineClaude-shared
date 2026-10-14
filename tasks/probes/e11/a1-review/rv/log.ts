import * as fs from "node:fs";
export const LOG = "/tmp/claude-0/-home-user/18df1101-ad89-5883-a34b-4290928909de/scratchpad/a1-review-sem/log";
export function log(file: string, ...parts: unknown[]): void {
    fs.mkdirSync(LOG, { recursive: true });
    fs.appendFileSync(`${LOG}/${file}.txt`, parts.map(p => typeof p === "string" ? p : JSON.stringify(p)).join(" ") + "\n");
}
