import React from "react";
import {ViewerManager} from "../modules/viewer-api/viewer-manager";

/**
 * ViewerContext
 *
 * React context that exposes the `ViewerManager` instance and the PrimeReact
 * `toast` ref to any descendant component in the tree.
 *
 * Usage:
 * ```tsx
 * const { manager, toast } = useContext(ViewerContext);
 * ```
 *
 * The context is provided by `App.tsx` via `<ViewerContext.Provider>` and
 * populated by the `useLoadContextValue` hook once the viewer is ready.
 *
 * Shape:
 *  - `toast`   — PrimeReact toast ref for showing notifications.
 *  - `manager` — The `ViewerManager` instance that owns the Three.js scene,
 *                renderer, and post-processing pipeline.
 */
const ViewerContext = React.createContext<{
  toast: any;
  manager: ViewerManager
}>({} as any);

export default ViewerContext;
