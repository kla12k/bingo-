import toast, { ToastOptions } from 'react-hot-toast';

/**
 * Shows a toast only once per session based on a unique key.
 */
export const toastOnce = (key: string, message: string, options?: ToastOptions) => {
    if (typeof window === 'undefined') return;

    const seenKey = `toast_seen_${key}`;
    if (sessionStorage.getItem(seenKey)) return;

    toast(message, options);
    sessionStorage.setItem(seenKey, 'true');
};

/**
 * Shows an error toast only once per session based on a unique key.
 */
export const toastErrorOnce = (key: string, message: string, options?: ToastOptions) => {
    if (typeof window === 'undefined') return;

    const seenKey = `toast_seen_${key}`;
    if (sessionStorage.getItem(seenKey)) return;

    toast.error(message, options);
    sessionStorage.setItem(seenKey, 'true');
};

/**
 * Shows a success toast only once per session based on a unique key.
 */
export const toastSuccessOnce = (key: string, message: string, options?: ToastOptions) => {
    if (typeof window === 'undefined') return;

    const seenKey = `toast_seen_${key}`;
    if (sessionStorage.getItem(seenKey)) return;

    toast.success(message, options);
    sessionStorage.setItem(seenKey, 'true');
};
