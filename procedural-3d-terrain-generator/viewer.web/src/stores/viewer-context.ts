import React from "react";
import {ViewerManager} from "../modules/viewer-api/viewer-manager";

/**
 * ViewerContext
 * -------------
 * React Context that makes the ViewerManager and the PrimeReact Toast ref
 * available to any component in the tree without prop-drilling.
 *
 * Shape:
 *  - toast   : PrimeReact Toast ref — call `toast.current.show(...)` to
 *              display notifications from deep child components.
 *  - manager : The live ViewerManager instance — exposes the Three.js scene,
 *              camera, and all manager helpers to UI components that need
 *              to trigger 3-D actions (e.g. regenerate terrain, change settings).
 *
 * Usage:
 *  const { manager, toast } = useContext(ViewerContext);
 */
const ViewerContext = React.createContext<{
  toast: any;
  manager: ViewerManager
}>({} as any);

export default ViewerContext;
