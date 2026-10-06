// Context only (react-refresh: never export a hook and a component from one
// file). The value is the single usePrintStation instance plus setPageOpen.
import { createContext } from 'react';

export const PrintStationContext = createContext(null);
