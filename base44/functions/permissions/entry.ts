// `permissions` endpoint (module 3). Router only: `handle` (from `./_guard.ts`,
// the generated copy, never edited here) builds Ctx and maps errors.
import { handle, remoteOnly } from './_guard.ts';
import { getProfile } from './handlers/getProfile.ts';
import { upsertProfile } from './handlers/upsertProfile.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, { getProfile, upsertProfile: remoteOnly(upsertProfile) });
}
