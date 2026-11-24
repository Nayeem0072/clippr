import React from "react";
import ReactDOM from "react-dom/client";
import { THEME_STORAGE_KEY, resolveTheme, setThemeAttributes } from "./lib/themes";

// Apply the saved colour theme before first render to prevent a flash.
(function () {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // ignore
  }
  setThemeAttributes(resolveTheme(stored));
})();
// Excalidraw (diagram pastes) loads its fonts from here instead of a CDN.
// The files are copied into public/ by scripts/copy-excalidraw-assets.mjs.
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw/";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
