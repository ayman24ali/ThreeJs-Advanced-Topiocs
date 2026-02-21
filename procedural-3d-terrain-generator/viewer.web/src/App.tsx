import {Toast} from "primereact/toast";
import React, {useEffect, useRef, useState} from 'react';
import './App.css';
import useLoadContextValue from "./hooks/useLoadContextValue";
import {ViewerManager} from "./modules/viewer-api/viewer-manager";
import ViewerContext from './stores/viewer-context';

/**
 * App
 * ---
 * Root React component for the Procedural 3-D Terrain Generator.
 *
 * Responsibilities:
 *  - Mounts a full-screen <div> that serves as the Three.js canvas container.
 *  - Creates a ViewerManager instance exactly once (guarded by `isViewerCreated`).
 *  - Provides the ViewerContext (containing the manager + toast) to the component tree.
 *  - Renders a PrimeReact Toast for bottom-centred UI notifications.
 *
 * Why `isViewerCreated` guard?
 *  React 18 Strict Mode runs effects twice in development to surface side-effect
 *  bugs.  Without the ref guard, two renderer canvases would be appended to the
 *  same div.  The boolean ref prevents the second execution from creating a second
 *  ViewerManager.
 */
function App() {
  /** Ref to the PrimeReact Toast component for imperative notifications. */
  const toast = useRef<any>(null);

  /** Ref to the host <div> passed to ViewerManager as the canvas container. */
  const viewerDivRef = useRef<HTMLDivElement>(null);

  /** Guards against creating more than one ViewerManager (Strict Mode double-invoke). */
  const isViewerCreated = useRef(false);

  /** The live ViewerManager instance — undefined until the div is mounted. */
  const [viewer, setViewer] = useState<ViewerManager | undefined>(undefined);

  /** Derives the context value (toast + manager) from the current viewer state. */
  const viewerContextVal = useLoadContextValue(viewer || ({} as any), toast);

  /**
   * Creates the ViewerManager on first render, after the container div is available.
   * Depends on `viewer` so it re-evaluates if the viewer is reset, but the
   * `isViewerCreated` ref ensures the body only runs once.
   */
  useEffect(() => {
    if (viewerDivRef.current && !isViewerCreated.current && !viewer) {
      const container = viewerDivRef.current;
      const newViewer = new ViewerManager(container, toast);
      setViewer(newViewer);
      isViewerCreated.current = true;
    }
  }, [viewer]);

  return (
    <ViewerContext.Provider value={{...(viewerContextVal as any)}}>
      <Toast className="toast-element" ref={toast} position="bottom-center"/>
      {/* Full-screen div — the WebGL canvas is appended here by ViewerManager */}
      <div id="viewerDivRef" className="viewerDivRef" ref={viewerDivRef}/>
    </ViewerContext.Provider>
  );
}

export default App;
