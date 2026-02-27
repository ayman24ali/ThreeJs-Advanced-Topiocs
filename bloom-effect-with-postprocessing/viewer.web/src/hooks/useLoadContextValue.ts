import {useEffect, useState} from "react";
import {ViewerManager} from "../modules/viewer-api/viewer-manager";

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
