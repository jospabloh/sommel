// `security` endpoint: what the bar admin sees of the anti PIN-sharing checks
// (photos taken at unlock / punch, and alerts). Router only: `handle` (from the
// generated `./_guard.ts`, never edited here) builds Ctx and maps errors. The
// photos and alerts are written by `attendance` and `terminals`; approvals by
// `orders`, `payments` and `shifts` (manager approval).
import { handle } from './_guard.ts';
import { listAlerts, markSeen } from './handlers/alerts.ts';
import { getPhoto, listPhotos } from './handlers/photos.ts';
import { approvers, listApprovals } from './handlers/approvals.ts';
import {
  approvalRequestStatus,
  cancelApprovalRequest,
  createApprovalRequest,
  decideApprovalRequest,
  getApprovalRequest,
  passkeyDelete,
  passkeyList,
  passkeyRegister,
  passkeyRegisterOptions,
} from './handlers/passkeys.ts';

export default function (req: Request): Promise<Response> {
  // approvers: anyone in the bar (the staff member asking for approval).
  return handle(req, {
    listAlerts,
    markSeen,
    listPhotos,
    getPhoto,
    approvers,
    listApprovals,
    // Manager approval from the phone (QR + Face ID); handlers/passkeys.ts.
    passkeyRegisterOptions,
    passkeyRegister,
    passkeyList,
    passkeyDelete,
    createApprovalRequest,
    approvalRequestStatus,
    cancelApprovalRequest,
    getApprovalRequest,
    decideApprovalRequest,
  });
}
