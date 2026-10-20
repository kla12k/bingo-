"use client";

import React, { createContext, useContext, useState } from "react";

interface GameContextType {
    gameId: string | null;
    setGameId: (id: string | null) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: React.ReactNode }) => {
    const [gameId, setGameId] = useState<string | null>(null);

    return (
        <GameContext.Provider value={{ gameId, setGameId }}>
            {children}
        </GameContext.Provider>
    );
};

export const useGame = () => {
    const context = useContext(GameContext);
    if (!context) {
        throw new Error("useGame must be used within a GameProvider");
    }
    return context;
};
