"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { Socket } from "socket.io-client";

import { useUser } from "@/api/session";

interface WebSocketContextType {
    socket: Socket | null;
    isConnected: boolean;
    isReconnecting: boolean;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
    const { tokens } = useUser();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isReconnecting, setIsReconnecting] = useState(false);

    useEffect(() => {
        if (!tokens?.access) {
            disconnectSocket();
            setSocket(null);
            setIsConnected(false);
            setIsReconnecting(false);
            return;
        }

        const s = getSocket();
        setSocket(s);

        const syncState = () => {
            const connected = s.connected;
            const active = (s as any).active ?? true;
            setIsConnected(connected);
            setIsReconnecting(!connected && active);
        };

        (s as any).auth = { token: tokens.access };
        if (!s.connected) {
            s.connect();
        }

        syncState();

        const onConnect = () => {
            setIsConnected(true);
            setIsReconnecting(false);
            console.log("WebSocket connected");
        };

        const onDisconnect = (reason: string) => {
            setIsConnected(false);
            // "io server disconnect" means the server closed it, "io client disconnect" means we did
            if (reason !== "io server disconnect" && reason !== "io client disconnect") {
                setIsReconnecting(true);
            }
            console.log("WebSocket disconnected:", reason);
            syncState();
        };

        const onConnectError = (error: any) => {
            setIsConnected(false);
            setIsReconnecting(true);
            console.warn("Realtime connection unavailable; retrying:", error?.message ?? "connection failed");
            syncState();
        };

        const onReconnectAttempt = (attempt: number) => {
            setIsConnected(false);
            setIsReconnecting(true);
            console.log(`WebSocket attempting reconnection #${attempt}...`);
        };

        s.on("connect", onConnect);
        s.on("reconnect", onConnect);
        s.on("disconnect", onDisconnect);
        s.on("connect_error", onConnectError);

        const manager = (s as any).io;
        if (manager) {
            manager.on("reconnect_attempt", onReconnectAttempt);
            manager.on("reconnect", onConnect);
            manager.on("reconnect_error", onConnectError);
        }

        // Fast heartbeat to ensure UI stays in sync
        const interval = setInterval(syncState, 500);

        return () => {
            s.off("connect", onConnect);
            s.off("reconnect", onConnect);
            s.off("disconnect", onDisconnect);
            s.off("connect_error", onConnectError);
            if (manager) {
                manager.off("reconnect_attempt", onReconnectAttempt);
                manager.off("reconnect", onConnect);
                manager.off("reconnect_error", onConnectError);
            }
            clearInterval(interval);
        };
    }, [tokens?.access]);

    return (
        <WebSocketContext.Provider value={{ socket, isConnected, isReconnecting }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error("useWebSocket must be used within a WebSocketProvider");
    }
    return context;
};
