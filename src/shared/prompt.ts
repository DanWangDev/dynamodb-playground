import { createInterface } from "node:readline";

let stepMode = false;

/** Enable step-by-step mode (call once at exercise start if --step passed) */
export function enableStepMode(): void {
  stepMode = true;
}

export function isStepMode(): boolean {
  return stepMode;
}

/** Pause and wait for user to press Enter before continuing */
export async function stepPause(): Promise<void> {
  if (!stepMode) return;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question("\n  ⏸  Press Enter to continue...", () => {
      rl.close();
      resolve();
    });
  });
  console.log();
}
