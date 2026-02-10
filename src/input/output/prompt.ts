export type PromptState = {
  semanticPromptSeen: boolean;
  promptClickEvents: boolean;
  promptInputActive: boolean;
  commandRunning: boolean;
};

export function createPromptState(): PromptState {
  return {
    semanticPromptSeen: false,
    promptClickEvents: false,
    promptInputActive: false,
    commandRunning: false,
  };
}

export function isPromptClickEventsEnabled(state: PromptState, altScreen: boolean): boolean {
  return (
    state.semanticPromptSeen &&
    state.promptClickEvents &&
    state.promptInputActive &&
    !state.commandRunning &&
    !altScreen
  );
}

function readOsc133BoolOption(options: string, key: string): boolean | null {
  if (!options) return null;
  const prefix = `${key}=`;
  const fields = options.split(";");
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    if (!field.startsWith(prefix)) continue;
    const value = field.slice(prefix.length);
    if (value === "1") return true;
    if (value === "0") return false;
    return null;
  }
  return null;
}

export function observeSemanticPromptOsc(
  state: PromptState,
  action: string,
  options: string,
): void {
  const clickEvents = readOsc133BoolOption(options, "click_events");
  if (clickEvents !== null) state.promptClickEvents = clickEvents;

  switch (action) {
    case "A":
    case "B":
    case "I":
      state.semanticPromptSeen = true;
      state.promptInputActive = true;
      state.commandRunning = false;
      break;
    case "C":
      state.semanticPromptSeen = true;
      state.promptInputActive = false;
      state.commandRunning = true;
      break;
    case "D":
      state.semanticPromptSeen = true;
      state.promptInputActive = false;
      state.commandRunning = false;
      break;
    case "P":
      state.semanticPromptSeen = true;
      break;
    default:
      break;
  }
}

/** Observe OSC 133 prompt metadata and update prompt state. */
export function observeOscPromptState(state: PromptState, seq: string): void {
  const content = seq.slice(2);
  const sep = content.indexOf(";");
  if (sep < 0) return;
  const code = content.slice(0, sep);
  if (code !== "133") return;
  const rest = content.slice(sep + 1);
  if (!rest) return;
  const action = rest[0] ?? "";
  if (!action) return;
  const options = rest.length > 2 && rest[1] === ";" ? rest.slice(2) : "";
  observeSemanticPromptOsc(state, action, options);
}
