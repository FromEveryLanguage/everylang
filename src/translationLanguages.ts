/**
 * The languages a viewer can pick for notes and slides (display names, not BCP-47 codes).
 *
 * Kept free of imports so the server can read it too: it decides what translate-ahead pays
 * for (server.ts), and pulling it from configAtoms.ts would load jotai's browser state into
 * the server's boot path.
 */
export const languages = ["French", "Haitian Creole", "Spanish"] as const;
