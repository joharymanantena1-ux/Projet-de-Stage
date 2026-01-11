import { createRoot } from "react-dom/client";
import { Buffer } from 'buffer';
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
if (!window.Buffer) window.Buffer = Buffer;