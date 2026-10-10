import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function routerBasename(): string | undefined {
  const configuredBase = import.meta.env.BASE_URL;
  if (configuredBase && configuredBase !== "/" && configuredBase !== "./") return configuredBase.replace(/\/$/, "");
  if (typeof window === "undefined") return undefined;
  const marker = "/Frontend/dist";
  const markerIndex = window.location.pathname.indexOf(marker);
  if (markerIndex < 0) return undefined;
  return window.location.pathname.slice(0, markerIndex + marker.length);
}

const routerBase = routerBasename();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={routerBase}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
