import { sequences } from "./constants";

/**
 * Encode beforeinput events (IME/paste/backspace) into terminal sequences.
 */
export function encodeBeforeInputEvent(event: InputEvent): string {
  if (!event) return "";
  const type = event.inputType;
  if (type === "insertText") return event.data || "";
  if (type === "insertLineBreak") return sequences.enter;
  if (type === "deleteContentBackward") return sequences.backspace;
  if (type === "deleteContentForward") return sequences.delete;
  if (type === "insertFromPaste") {
    return event.dataTransfer?.getData("text/plain") || "";
  }
  return "";
}
