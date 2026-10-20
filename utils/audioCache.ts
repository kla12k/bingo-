const CACHE_NAME = 'bingo-audio-v1';

/**
 * Pre-caches a list of audio URLs.
 */
export async function cacheAudioFiles(urls: string[]) {
    if (typeof window === 'undefined' || !('caches' in window)) return;

    try {
        const cache = await caches.open(CACHE_NAME);
        const existingKeys = await cache.keys();
        const existingUrls = new Set(existingKeys.map(request => request.url));

        const toCache = urls.filter(url => {
            const fullUrl = new URL(url, window.location.origin).toString();
            return !existingUrls.has(fullUrl);
        });

        if (toCache.length > 0) {
            console.log(`[AudioCache] Caching ${toCache.length} new audio files...`);
            // Cache in chunks to be safe
            const chunkSize = 20;
            for (let i = 0; i < toCache.length; i += chunkSize) {
                const chunk = toCache.slice(i, i + chunkSize);
                await cache.addAll(chunk).catch(err => console.warn(`[AudioCache] Failed to cache some files:`, err));
            }
            console.log(`[AudioCache] Caching complete.`);
        }
    } catch (error) {
        console.error('[AudioCache] Cache error:', error);
    }
}

/**
 * Plays an audio file, attempting to use the cache first.
 * If not in cache, it will fetch, cache, and then play.
 */
export async function playAudio(url: string) {
    if (typeof window === 'undefined') return;

    try {
        if ('caches' in window) {
            const cache = await caches.open(CACHE_NAME);
            let response = await cache.match(url);

            if (!response) {
                // Not in cache, fetch and cache it now
                console.log(`[AudioCache] Miss: ${url}. Fetching and caching...`);
                try {
                    await cache.add(url);
                    response = await cache.match(url);
                } catch (fetchErr) {
                    console.warn(`[AudioCache] Failed to fetch and cache ${url}:`, fetchErr);
                }
            }

            if (response) {
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                const audio = new Audio(blobUrl);
                audio.onended = () => URL.revokeObjectURL(blobUrl);
                return audio.play();
            }
        }
    } catch (error) {
        console.error('[AudioCache] Play error:', error);
    }

    // Final fallback: play directly from URL
    const audio = new Audio(url);
    return audio.play().catch(err => console.error('[AudioCache] Fallback play failed:', err));
}
