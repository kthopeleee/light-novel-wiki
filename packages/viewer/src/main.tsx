import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { HttpDataSource } from "./data/source";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App source={new HttpDataSource("./data")} siteTitle="Novel Wiki" />
  </StrictMode>,
);
