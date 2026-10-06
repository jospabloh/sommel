// Stand-in for npm:@base44/sdk, used ONLY by `npm run check:functions`.
// The sandbox cannot download the SDK, and Base44's bundler does not type
// check, so a broken import (a name a file does not export) only shows up as
// a failed deploy that keeps serving the old function. Compiling every
// entry.ts against this stub catches that, and any type error, before merge.
// deno-lint-ignore-file no-explicit-any
export const createClientFromRequest = (_req: Request): any => ({}) as any;
export const createClient = (_options: any): any => ({}) as any;
