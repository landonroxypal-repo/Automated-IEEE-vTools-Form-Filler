// Entry point for popup.html: connects the controller to the real extension APIs.
import { createChromeDeps, type ChromeLike } from "./chromeDeps";
import { createPopupController } from "./popupController";

createPopupController({ document, ...createChromeDeps(chrome as unknown as ChromeLike) });
