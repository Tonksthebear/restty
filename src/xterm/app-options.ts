import type { ResttyOptions } from "../surface/restty";

export function createCompatAppOptions(
  userAppOptions: ResttyOptions["appOptions"],
  emitData: (data: string) => void,
): ResttyOptions["appOptions"] {
  return (context) => {
    const resolved =
      typeof userAppOptions === "function" ? userAppOptions(context) : (userAppOptions ?? {});
    const userBeforeInput = resolved.beforeInput;
    return {
      ...resolved,
      beforeInput: ({ text, source }) => {
        const maybeNext = userBeforeInput?.({ text, source });
        if (maybeNext === null) return null;
        const nextText = maybeNext === undefined ? text : maybeNext;
        if (source !== "pty" && nextText) {
          emitData(nextText);
        }
        return nextText;
      },
    };
  };
}
