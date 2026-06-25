import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let connectionToken: string | null = null;

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const socketManager = {
  connect(token: string) {
    // If socket exists and token hasn't changed, reuse connection (Strict Mode guard)
    if (socket && connectionToken === token) {
      if (!socket.connected) {
        socket.connect();
      }
      return socket;
    }

    // If token changed or socket doesn't exist, close previous first
    if (socket) {
      this.disconnect();
    }

    connectionToken = token;
    
    // Initialize socket connection with auth credentials and standard transports
    socket = io(SOCKET_URL, {
      auth: {
        token,
      },
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
    });

    return socket;
  },

  disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    connectionToken = null;
  },

  getSocket(): Socket | null {
    return socket;
  },
};
