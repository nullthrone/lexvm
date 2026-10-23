/** LexVM web app entry point. No engine calls happen at import time. */
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/game.css";
import "./styles/sheets.css";
import "./styles/pages.css";
import { startApp } from "./app.ts";
import { toast } from "./components/toast.ts";
import { t } from "./i18n.ts";
import { applyUpdate, initPwa, pwa } from "./services/pwa.ts";
import { initSettings } from "./services/settings.ts";

initSettings();

const root = document.getElementById("app");
if (root) startApp(root);

initPwa();

let updateShown = false;
pwa.subscribe((state) => {
  if (!state.updateReady || updateShown) return;
  updateShown = true;
  toast(t("pwa.update"), { duration: 0, action: { label: t("pwa.reload"), run: applyUpdate } });
});
