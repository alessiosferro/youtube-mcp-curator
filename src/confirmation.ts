export type ConfirmationAction = "accept" | "decline" | "cancel" | string | undefined;
export type ConfirmationOutcome = "confirmed" | "cancelled" | "pending";

/** A write is allowed only after the MCP host returns an accepted true value. */
export function confirmationOutcome(
  confirmed: boolean | undefined,
  action: ConfirmationAction
): ConfirmationOutcome {
  if (action !== undefined && action !== "accept") return "cancelled";
  if (confirmed === true && action === "accept") return "confirmed";
  if (confirmed === false) return "cancelled";
  return "pending";
}
