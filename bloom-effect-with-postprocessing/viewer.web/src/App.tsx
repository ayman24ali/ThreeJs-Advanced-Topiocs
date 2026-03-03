import {Toast} from "primereact/toast";
import React, {useEffect, useRef, useState} from 'react';
import './App.css';
import useLoadContextValue from "./hooks/useLoadContextValue";
import {ViewerManager} from "./modules/viewer-api/viewer-manager";
import ViewerContext from './stores/viewer-context';

/**
 * App  (Root Component)
 *
 * The top-level React component for the bloom-effect POC.
 *
 * Responsibilities:
 *  - Holds a ref to the viewer `<div>` that the Three.js canvas is mounted into.
 *  - Creates a `ViewerManager` instance exactly once (guarded by `isViewerCreated`)
 *    and stores it in state so downstream components can access it.
 *  - Builds the `ViewerContext` value via `useLoadContextValue` and provides it
 *    to the entire component tree.
 *  - Renders a PrimeReact `<Toast>` for in-app notifications.
 *
 * Rendering:
 *  ```
 *  <ViewerContext.Provider>
 *    <Toast />                 ← notification overlay
 *    <div #viewerDivRef />     ← Three.js canvas is appended here by ViewerManager
 *  </ViewerContext.Provider>
 *  ```
 */
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
