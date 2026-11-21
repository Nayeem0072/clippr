import React from "react";
import ReactDOM from "react-dom/client";

// Apply saved theme before first render to prevent flash
(function () {
  try {
    if (localStorage.getItem("clippr-theme") === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch {
    // ignore
  }
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
