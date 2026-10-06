// `security` endpoint: what the bar admin sees of the anti PIN-sharing checks
// (photos taken at unlock / punch, and alerts). Router only: `handle` (from the
// generated `./_guard.ts`, never edited here) builds Ctx and maps errors. The
// photos and alerts are written by `attendance` and `terminals`.
import { handle } from './_guard.ts';
import { listAlerts, markSeen } from './handlers/alerts.ts';
import { getPhoto, listPhotos } from './handlers/photos.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, { listAlerts, markSeen, listPhotos, getPhoto });
}
