// One print station for the whole signed-in app (mounted in Layout). With a
// USB printer on this device it prints queued jobs from any screen; the
// Impresión page only adds the queue view and the dialog fallback.
import React, { useMemo, useState } from 'react';
import { PrintStationContext } from './PrintStationContext';
import PrintArea from './PrintArea';
import usePrintStation from './usePrintStation';

export default function PrintStationProvider({ tenantId, allowed, children }) {
  const [pageOpen, setPageOpen] = useState(false);
  const station = usePrintStation(tenantId, { allowed, pageOpen });
  const value = useMemo(() => ({ ...station, setPageOpen }), [station]);
  return (
    <PrintStationContext.Provider value={value}>
      {children}
      <PrintArea job={station.paperJob} />
    </PrintStationContext.Provider>
  );
}
