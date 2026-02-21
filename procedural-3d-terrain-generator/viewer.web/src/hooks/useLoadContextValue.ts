import {useEffect, useState} from "react";
import {ViewerManager} from "../modules/viewer-api/viewer-manager";

/**
 * useLoadContextValue
 * -------------------
 * Custom React hook that packages the ViewerManager and toast ref into
 * the shape expected by ViewerContext.
 *
 * Why a custom hook?
 *  Centralises the context-value construction so that any future additions
 *  to the context shape (e.g. selected objects, UI state) are managed in
 *  one place without bloating App.tsx.
 *
 * Behaviour:
 *  - Returns an empty object `{}` until both `viewer` and `toast` are ready.
 *  - Re-runs whenever `viewer` or `toast` change, keeping the context fresh.
 *
 * @param viewer - The initialised ViewerManager instance (or an empty object
 *                 before it is created).
 * @param toast  - PrimeReact Toast ref forwarded from App.
 * @returns      An object `{ toast, manager }` suitable for ViewerContext.Provider.
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
