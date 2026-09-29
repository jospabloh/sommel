// `attendance` (checador) endpoint, contract section 3. Router only: handle()
// (from the canonical _guard.ts, nobody edits that copy) does
// requireContext/dispatch/error-mapping; each action's own check order lives
// in its handler.
import { handle } from './_guard.ts';
import { roster } from './handlers/roster.ts';
import { punch } from './handlers/punch.ts';
import { setMyPin } from './handlers/setMyPin.ts';
import { resetPin } from './handlers/resetPin.ts';
import { records } from './handlers/records.ts';
import { correct } from './handlers/correct.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, { roster, punch, setMyPin, resetPin, records, correct });
}
