import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

/* PWA registration is injected by vite-plugin-pwa (autoUpdate) at build
   time — see vite.config.ts. Nothing to do here. */
