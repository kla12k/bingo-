# Cheating Prevention & Disconnection Recovery

## Cheating prevention (implemented)

1. **Server-authoritative validation**
   - Bingo is validated only on the server. The client cannot declare a win; the server checks the card against **server-known called numbers** (Redis + DB), not client-submitted marked numbers.
   - Card contents are read from the DB (`game_card`), not from the client.

2. **Card ownership**
   - Only cards assigned to the user in `Game.playerCard` can be claimed. Claiming another player’s card is rejected.

3. **Invalid attempt limit**
   - After 3 invalid bingo attempts in the same game, the user is removed (`terminated_${userId}`). They receive `game_terminated` and are kicked from the room.

4. **Rate limiting**
   - Bingo claims are rate-limited per user per game (e.g. 2s cooldown) to prevent claim spam.

5. **Game state checks**
   - Server rejects bingo if the game is not running, or if a bingo was already accepted for that game.

- **Idempotent claims**: Duplicate claims (same user, same card, same game) are detected via an `accepted_claims` set per game. If the claim was already accepted, the server re-sends the stored result payload to that socket and skips processing, so the client sees the same “Bingo” outcome without double-crediting or errors.

## Optional hardening (you can add)
- **Stricter timing**: Reject claims that arrive before the Nth number is called if you enforce a minimum call count.
- **Admin tools**: Log invalid attempts and allow staff to ban or review repeat offenders.

---

## Disconnection & stuck-game recovery

### Client

1. **Reconnection**
   - Socket.IO is configured with `reconnection: true` and backoff so the client reconnects after network drops.

2. **State sync on reconnect**
   - On `connect`, the client refetches: `join_stake_room`, `get_stake_stat`, `get_my_cards_for_game`.
   - The play page listens for **`game_in_progress`**: when the server sends it (e.g. after reconnect during an active game), the client sets `gameId` and `called_numbers` from the payload so the board and called numbers stay in sync.

3. **Refetch on connect**
   - Both stake and play pages refetch on `socket.on("connect")` so after a disconnect/reconnect the UI matches server state.

### Server

1. **Stuck-game cleanup (cron job)**
   - A cron job (`stuck-game-cron.ts`) runs every **3 minutes** by default (configurable via `STUCK_GAME_CRON_INTERVAL_MS` env). It finds games with `status=playing` that have been running longer than **STUCK_GAME_SEC** (400s). For each stuck game:
     - **Refunds** all players (real users + bots) their stake × card count.
     - Logs each refund to **`RefundLog`** (gameId, userId, amount, reason).
     - Sets the game status to `failed` in the DB.
     - Clears `current_game_id` and `is_running` in Redis. This allows the next round to start cleanly and ensures users are refunded when games get stuck.
     - Calls **`clearGameState(gameId)`** to remove all Redis keys for that game so reconnecting clients don’t see stale state.

2. **Join during active game**
   - When a client joins a stake room while a game is running, the server sends `game_in_progress` (with `game_id` and `called_numbers`) and `game_stat` so the client can show the correct board and called numbers immediately.

### If the game feels stuck

- **Stuck countdown**: If the timer doesn’t start, the next `tryStartGame` (triggered when `nextStart` is null or in the past) will schedule a new countdown.
- **Stuck in “playing”**: The cron job will detect it within 3 minutes, refund all players, and clear the game state so the next round can start cleanly.
- **Redis/DB issues**: Ensure Redis and the DB are reachable; otherwise game state and recovery cannot work correctly.
