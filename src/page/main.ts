// Entry point injected into the vTools page's own JavaScript world (bundled as page.js).
import type { VtoolsWindow } from "../executor/pageEnv";
import { installPageApi } from "./fillEventInPage";

installPageApi(window as unknown as VtoolsWindow);
