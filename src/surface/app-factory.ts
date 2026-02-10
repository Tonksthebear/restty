import type { ResttyApp, ResttyAppOptions } from "../runtime/types";
import { createResttyApp as createResttyAppImpl } from "../runtime/create-runtime";

/** Internal app-construction boundary used by pane manager wiring. */
export function createResttyApp(options: ResttyAppOptions): ResttyApp {
  return createResttyAppImpl(options);
}
