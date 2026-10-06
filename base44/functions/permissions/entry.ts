// `permissions` endpoint (module 3). Router only: `handle` (from `./_guard.ts`,
// the generated copy, never edited here) builds Ctx and maps errors.
import { freshReads, handle, remoteOnly } from './_guard.ts';
import { getProfile } from './handlers/getProfile.ts';
import { upsertProfile } from './handlers/upsertProfile.ts';
import { getPerson, setPersonOverrides } from './handlers/person.ts';

export default function (req: Request): Promise<Response> {
  // The Permisos and Staff screens edit these: no 20 s cache.
  return handle(req, {
    getProfile: freshReads(getProfile),
    upsertProfile: freshReads(remoteOnly(upsertProfile)),
    getPerson: freshReads(remoteOnly(getPerson)),
    setPersonOverrides: freshReads(remoteOnly(setPersonOverrides)),
  });
}
