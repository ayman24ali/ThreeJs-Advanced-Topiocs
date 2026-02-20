import React from "react";
import {ViewerManager} from "../modules/viewer-api/viewer-manager";

const ViewerContext = React.createContext<{
  toast: any;
  manager: ViewerManager
}>({} as any);

export default ViewerContext;
