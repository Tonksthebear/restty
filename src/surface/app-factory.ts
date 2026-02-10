import type { ResttyApp, ResttyAppOptions } from "./types";
import { createResttyApp as createResttyAppImpl } from "./create-app";

/** Internal app-construction boundary used by pane manager wiring. */
export function createResttyApp(options: ResttyAppOptions): ResttyApp {
  return createResttyAppImpl(options);
}
