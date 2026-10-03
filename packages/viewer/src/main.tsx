import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { HttpDataSource } from "./data/source";
import { repoConfigFromEnv } from "./github/config";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App publicSource={new HttpDataSource("./data")} repo={repoConfigFromEnv()} siteTitle="Novel Wiki" />
  </StrictMode>,
);
