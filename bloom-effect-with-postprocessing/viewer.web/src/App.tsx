import {Toast} from "primereact/toast";
import React, {useEffect, useRef, useState} from 'react';
import './App.css';
import useLoadContextValue from "./hooks/useLoadContextValue";
import {ViewerManager} from "./modules/viewer-api/viewer-manager";
import ViewerContext from './stores/viewer-context';

function App() {
  const toast = useRef<any>(null);
  const viewerDivRef = useRef<HTMLDivElement>(null);
  const isViewerCreated = useRef(false);
  const [viewer, setViewer] = useState<ViewerManager | undefined>(undefined);
  const viewerContextVal = useLoadContextValue(viewer || ({} as any), toast);
  
  useEffect(() => {
    if (viewerDivRef.current && !isViewerCreated.current && !viewer) {
      const container = viewerDivRef.current;
      const newViewer = new ViewerManager(container,toast);
      setViewer(newViewer);
      isViewerCreated.current = true;
    }
  }, [viewer]);
  
  return (
    <ViewerContext.Provider value={{...(viewerContextVal as any)}}>
      <Toast className="toast-element" ref={toast} position="bottom-center"/>
      <div id="viewerDivRef" className="viewerDivRef" ref={viewerDivRef}/>
    </ViewerContext.Provider>
  );
}

export default App;
