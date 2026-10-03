import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../assets/ui.css";
import { Library } from "./Library";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Library />
  </StrictMode>,
);
