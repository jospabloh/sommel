import { useContext } from 'react';
import { PrintStationContext } from './PrintStationContext';

/** The app-wide print station (see PrintStationProvider). */
export default function usePrintStationContext() {
  const ctx = useContext(PrintStationContext);
  if (!ctx) throw new Error('usePrintStationContext needs PrintStationProvider');
  return ctx;
}
