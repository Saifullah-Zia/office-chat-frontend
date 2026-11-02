// Copies the Agora AI noise suppression engine (WASM) into public/ so the browser can load it.
// Runs after npm install; safe to run any time.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const from = "node_modules/agora-extension-ai-denoiser/external";
const to = "public/agora-denoiser";
if (existsSync(from)) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`Copied Agora denoiser assets to ${to}`);
}
