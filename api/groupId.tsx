"use client";

import React, { createContext, useContext, useState } from "react";

interface GroupGameContextType {
    groupId: string | null;
    setGroupId: (id: string | null) => void;
}

const GroupGameContext = createContext<GroupGameContextType | undefined>(undefined);

export const GroupGameProvider = ({ children }: { children: React.ReactNode }) => {
    const [groupId, setGroupId] = useState<string | null>(null);

    return (
        <GroupGameContext.Provider value={{ groupId, setGroupId }}>
            {children}
        </GroupGameContext.Provider>
    );
};

export const useGroupGame = () => {
    const context = useContext(GroupGameContext);
    if (!context) {
        throw new Error("useGroupGame must be used within a GroupGameProvider");
    }
    return context;
};
