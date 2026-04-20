import { handleError } from "@w3-io/action-core";
import { createRouter } from "./commands.js";

const router = createRouter();

// Suppress noisy unhandled rejection warnings; the wrapper below
// catches via handleError, which calls core.setFailed.
process.on("unhandledRejection", () => {});
(async () => {
  try {
    await router();
  } catch (error) {
    handleError(error);
  }
})();
