"use client";

import { useRouter } from "next/router";
import { createContext, useContext, useState, ReactNode, useEffect } from "react";

interface User {
    id: string;
    name: string;
    phone_number: string;
    wallet: number;
    bonus: number;
    telegram_id?: string;
    is_affiliate?: boolean;
    affiliate_wallet?: number;
}

interface Token {
    access: string;
    refresh: string;
}

interface UserContextType {
    user: User | null;
    tokens: Token | null;
    displayReference: boolean;
    toggleDisplayReference: () => void;
    saveUser: (userInfo: User) => void;
    clearUser: () => void;
    saveTokens: (tokenInfo: Token) => void;
    clearTokens: () => void;
    telegram: boolean;
    saveTelegram: (telegramInfo: boolean) => void;
    refreshTokens: (refreshToken: string) => Promise<Token | null>;
    refreshUser: () => Promise<User | null>;
    apiRequest: (
        url: string,
        method: "GET" | "POST" | "PUT" | "DELETE",
        body?: Record<string, unknown>
    ) => Promise<Response | null>;
    saveTokenAndUser: (userString: string, tokensString: string) => void;
    loading: boolean;
    telegramLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
    children: ReactNode;
}

interface TelegramWebApp {
    ready: () => void;
    expand: () => void;
    requestFullscreen?: () => void;
    initData: string;
    openLink: (url: string) => void;
    platform?: string;
}

interface TelegramWindow extends Window {
    Telegram?: {
        WebApp: TelegramWebApp;
    };
}

export const UserProvider = ({ children }: UserProviderProps) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [tokens, setTokens] = useState<Token | null>(null);
    const [displayReference, setDisplayReference] = useState<boolean>(false);
    const [telegram, setTelegram] = useState<boolean>(false);
    const [telegramLoading, setTelegramLoading] = useState(false);
    const router = useRouter();
    const pathname = router.pathname;
    const serverUrl = `/api/v2`;

    // ==========================
    //   INITIAL LOAD + AUTH CHECK
    // ==========================
    useEffect(() => {
        const savedUser = sessionStorage.getItem("user");
        const savedTokens = sessionStorage.getItem("tokens");
        const savedTelegram = sessionStorage.getItem("telegram");

        const verifyInitData = async (initData: string) => {
            try {
                const response = await fetch(`${serverUrl}/auth/verify-init-data`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ initData }),
                });

                if (response.status === 200) {
                    const { user, tokens } = await response.json();
                    saveUser(user);
                    saveTokens(tokens);
                    saveTelegram(true);
                    // Redirect to stake page as requested
                    if (router.pathname.startsWith("/auth/")) {
                        router.push("/stake");
                    }
                } else {
                    console.error("❌ Telegram verification failed:", await response.text());
                }
            } catch (error) {
                console.error("❌ Failed to verify Telegram init data:", error);
            } finally {
                setTelegramLoading(false);
            }
        };

        const loadTelegramScript = (): Promise<void> => {
            return new Promise((resolve, reject) => {
                if ((window as TelegramWindow).Telegram) {
                    resolve();
                    return;
                }
                const script = document.createElement("script");
                script.src = "https://telegram.org/js/telegram-web-app.js";
                script.async = true;
                script.onload = () => resolve();
                script.onerror = reject;
                document.body.appendChild(script);
            });
        };

        (async () => {
            await loadTelegramScript();
            const tg = (window as TelegramWindow).Telegram?.WebApp;
            let userWasSetViaTelegram = false;

            if (tg) {
                setTelegramLoading(true);
                tg.ready?.();

                // Enforce full screen only on Telegram mobile (not web or desktop)
                const platform = tg.platform?.toLowerCase() ?? "";
                const isMobile = platform === "android" || platform === "ios";
                // if (isMobile) {
                //     try {
                //         tg.expand?.();
                //         if (tg.requestFullscreen) {
                //             tg.requestFullscreen();
                //         }
                //     } catch (e) {
                //         console.warn("Failed to expand Telegram WebApp:", e);
                //     }
                // }

                const initData = tg.initData;
                if (initData) {
                    await verifyInitData(initData);
                    userWasSetViaTelegram = true;
                } else {
                    setTelegramLoading(false);
                }
            }

            // Load saved user/tokens/telegram if no Telegram data
            if (!userWasSetViaTelegram && savedUser) {
                try {
                    const parsedUser: User = JSON.parse(savedUser);
                    setUser(parsedUser);
                } catch {
                    clearUser();
                }
            }

            if (savedTokens) {
                try {
                    const parsedTokens: Token = JSON.parse(savedTokens);
                    setTokens(parsedTokens);
                } catch {
                    clearTokens();
                }
            }

            if (savedTelegram) {
                try {
                    const parsedTelegram: boolean = JSON.parse(savedTelegram);
                    setTelegram(parsedTelegram);
                } catch {
                    console.error("Error parsing telegram data");
                }
            }

            const savedMode = getCookie("displayReference");
            //  if (savedMode) setDisplayReference(true);

            setLoading(false);
        })();
    }, []);

    // ==========================
    //   AUTH REDIRECT LOGIC (FIXED)
    // ==========================
    useEffect(() => {
        if (loading) return; // wait until all user state is ready

        const isAuthPage = ["/auth/signin", "/auth/signup", "/auth/verify"].includes(pathname);
        const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

        // internal flag to prevent duplicate redirects
        let redirecting = false;

        // If not logged in and not already on auth route
        if (!user && !isAuthPage && !redirecting) {
            if (currentPath !== "/auth/signin") {
                redirecting = true;
                router.replace("/auth/signin").catch(() => { });
            }
            return;
        }

        // Affiliate page access is gated by AffiliateLayout (payment API GET /affiliate/status)
    }, [loading, user, pathname]);

    // ==========================
    //   SESSION STORAGE SYNC
    // ==========================
    useEffect(() => {
        if (user && tokens) {
            sessionStorage.setItem("tokens", JSON.stringify(tokens));
            sessionStorage.setItem("user", JSON.stringify(user));
        }
    }, [user, tokens]);

    // ==========================
    //   UTIL + API HELPERS
    // ==========================
    const toggleDisplayReference = () => {
        const newMode = true;
        setDisplayReference(newMode);
        setCookie("displayReference", newMode.toString());
    };

    const saveUser = (userInfo: User) => {
        setUser(userInfo);
        sessionStorage.setItem("user", JSON.stringify(userInfo));
    };

    const clearUser = () => {
        setUser(null);
        sessionStorage.removeItem("user");
    };

    const saveTokens = (tokenInfo: Token) => {
        setTokens(tokenInfo);
        sessionStorage.setItem("tokens", JSON.stringify(tokenInfo));
    };

    const clearTokens = () => {
        setTokens(null);
        sessionStorage.removeItem("tokens");
    };

    const saveTelegram = (telegramInfo: boolean) => {
        setTelegram(telegramInfo);
        sessionStorage.setItem("telegram", JSON.stringify(telegramInfo));
    };

    /** Decode JWT payload (client-side only, no verify) to read exp. Returns expiry time in ms, or 0 if invalid. */
    const getAccessTokenExpiry = (token: string): number => {
        try {
            const payload = token.split(".")[1];
            if (!payload) return 0;
            const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
            const exp = decoded?.exp;
            return typeof exp === "number" ? exp * 1000 : 0;
        } catch {
            return 0;
        }
    };

    const refreshTokens = async (refreshToken: string) => {
        try {
            const response = await fetch(`${serverUrl}/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh: refreshToken }),
            });

            if (response.ok) {
                const data = await response.json();
                const tokens: Token = {
                    access: data.access ?? data.access_token,
                    refresh: data.refresh ?? data.refresh_token,
                };
                if (tokens.access && tokens.refresh) {
                    saveTokens(tokens);
                    return tokens;
                }
            }
            return null;
        } catch (error) {
            console.error("Error refreshing tokens:", error);
            return null;
        }
    };

    const apiRequest = async (
        url: string,
        method: "GET" | "POST" | "PUT" | "DELETE",
        body?: Record<string, unknown>
    ): Promise<Response | null> => {
        const defaultHeaders = { "Content-Type": "application/json" };

        try {
            let accessToken = tokens?.access;
            const refreshToken = tokens?.refresh;

            // Proactive refresh: if access token expires within 60s, refresh before the request
            if (accessToken && refreshToken) {
                const expMs = getAccessTokenExpiry(accessToken);
                if (expMs && expMs - Date.now() < 60 * 1000) {
                    const newTokens = await refreshTokens(refreshToken);
                    if (newTokens?.access) accessToken = newTokens.access;
                }
            }

            const headers = {
                ...defaultHeaders,
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            };

            const options: RequestInit = { method, headers, credentials: "include" };
            if (body) options.body = JSON.stringify(body);

            let response = await fetch(`${serverUrl}${url}`, options);

            // On 401, try refresh once and retry
            if (response.status === 401 && refreshToken) {
                const newTokens = await refreshTokens(refreshToken);
                const newHeaders = {
                    ...defaultHeaders,
                    ...(newTokens?.access ? { Authorization: `Bearer ${newTokens.access}` } : {}),
                };

                response = await fetch(`${serverUrl}${url}`, {
                    ...options,
                    headers: newHeaders,
                });

                if (!response.ok) {
                    clearTokens();
                    clearUser();
                    if (router.pathname !== "/auth/signin") router.replace("/auth/signin");
                }
            }

            return response;
        } catch (error) {
            console.error("Error during API request:", error);
            clearTokens();
            clearUser();
            if (router.pathname !== "/auth/signin") router.replace("/auth/signin");
            return null;
        }
    };

    const refreshUser = async (): Promise<User | null> => {
        try {
            const response = await apiRequest("/auth/profile", "GET");
            if (response && response.ok) {
                const freshUser: User = await response.json();
                saveUser(freshUser);
                return freshUser;
            }
            return null;
        } catch (e) {
            console.error("Error refreshing user session:", e);
            return null;
        }
    };

    const saveTokenAndUser = (userString: string, tokensString: string) => {
        const decodedUser = JSON.parse(decodeURIComponent(userString));
        const decodedTokens = JSON.parse(decodeURIComponent(tokensString));
        setUser(decodedUser);
        setTokens(decodedTokens);
    };

    const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(";").shift();
        return null;
    };

    const setCookie = (name: string, value: string) => {
        document.cookie = `${name}=${value}; path=/; samesite=strict; max-age=31536000`;
    };

    return (
        <UserContext.Provider
            value={{
                user,
                tokens,
                displayReference,
                toggleDisplayReference,
                saveUser,
                clearUser,
                saveTokens,
                clearTokens,
                telegram,
                saveTelegram,
                refreshTokens,
                refreshUser,
                apiRequest,
                saveTokenAndUser,
                loading,
                telegramLoading,
            }}
        >
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) throw new Error("useUser must be used within a UserProvider");
    return { ...context };
};