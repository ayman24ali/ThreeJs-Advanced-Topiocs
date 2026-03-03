import {useEffect, useState} from "react";
import {ViewerManager} from "../modules/viewer-api/viewer-manager";

/**
 * useLoadContextValue
 *
 * Custom React hook that builds the value object for `ViewerContext`.
 *
 * Watches for a valid `ViewerManager` instance and a `toast` ref, then
 * constructs a context value object containing both. The value is updated
 * via `useState` whenever either dependency changes, triggering a re-render
 * in any component that consumes `ViewerContext`.
 *
 * @param viewer - The `ViewerManager` instance created in `App.tsx`.
 *                 May be an empty object `{}` before the viewer is ready.
 * @param toast  - PrimeReact toast ref passed down from `App.tsx`.
 * @returns      An object `{ toast, manager }` once the viewer is available,
 *               or an empty object `{}` while the viewer is still initialising.
 */
export default function useLoadContextValue(viewer: ViewerManager, toast: any): any {
  const [viewerContextVal, setViewerContextVal] = useState({});
  
  useEffect(() => {
    if (viewer)
      setViewerContextVal({
        toast,
        manager: viewer
      } as any);
  }, [toast, viewer]);
  
  return viewerContextVal;
}
