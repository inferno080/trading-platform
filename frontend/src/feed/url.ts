/** Where the backend listens. Set VITE_WS_URL to point at another address. */
export const WS_URL: string = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";
