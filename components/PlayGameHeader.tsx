import { FiRefreshCcw, FiVolume2, FiVolumeX, FiZap } from "react-icons/fi";
import { KineticLoader } from "@/components/KineticLoader";

type GameStat = {
  game_number?: number | string;
  player_count?: number;
  number_of_players?: number;
  bonus?: string;
  winner_price?: number;
};

type Props = {
  wsConnected: boolean;
  reconnecting: boolean;
  muted: boolean;
  language: string;
  onAudioToggle: () => void;
  autoBingo: boolean;
  onAutoToggle: () => void;
  showAuto: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  stat: GameStat | null;
  gameId: string | number | null;
  stake: number;
  totalCalls: number;
  lastCalled?: number | null;
};

export default function PlayGameHeader({
  wsConnected,
  reconnecting,
  muted,
  onAudioToggle,
  autoBingo,
  onAutoToggle,
  showAuto,
  isRefreshing,
  onRefresh,
  stat,
  gameId,
  stake,
  totalCalls,
  lastCalled = null,
}: Props) {
  const gameLabel =
    stat?.game_number != null
      ? String(stat.game_number)
      : gameId
        ? String(gameId).slice(-4)
        : "—";
  const players = stat?.player_count ?? stat?.number_of_players ?? 0;
  const pot = Number(stat?.winner_price ?? 0);

  return (
    <header className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0B1224]/85 px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-[#3B82F6]/25 blur-3xl" />
      <div className="pointer-events-none absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-[#22D3EE]/15 blur-3xl" />

      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#38BDF8] to-[#2563EB] text-lg font-black text-white shadow-[0_0_24px_rgba(37,99,235,0.55)]">
            {lastCalled != null && lastCalled > 0 ? lastCalled : <FiZap />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#93C5FD]">
              Arena · Round #{gameLabel}
            </p>
            <p className="truncate text-sm font-black text-white">
              {stake} ETB · Pot {pot.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {wsConnected && !reconnecting ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#052e16]/80 px-2 py-1 text-[10px] font-black uppercase text-[#4ADE80] ring-1 ring-[#22C55E]/40">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
              Live
            </span>
          ) : reconnecting ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#1e3a5f] px-2 py-1 text-[10px] font-black text-[#93C5FD]">
              <KineticLoader variant="dot-pulse" size="sm" className="shrink-0" />
              Sync
            </span>
          ) : (
            <span className="rounded-full bg-[#450a0a]/80 px-2 py-1 text-[10px] font-black uppercase text-[#F87171] ring-1 ring-[#EF4444]/40">
              Offline
            </span>
          )}

          <button
            type="button"
            onClick={onAudioToggle}
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${
              muted
                ? "border-red-400/30 bg-red-500/15 text-red-300"
                : "border-white/10 bg-white/5 text-[#93C5FD]"
            }`}
            aria-label="Sound"
          >
            {muted ? <FiVolumeX size={14} /> : <FiVolume2 size={14} />}
          </button>

          {showAuto && (
            <button
              type="button"
              onClick={onAutoToggle}
              className={`rounded-xl px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${
                autoBingo
                  ? "bg-[#22D3EE] text-[#0B1224] shadow-[0_0_18px_rgba(34,211,238,0.45)]"
                  : "border border-white/10 bg-white/5 text-[#94A3B8]"
              }`}
            >
              Auto {autoBingo ? "On" : "Off"}
            </button>
          )}

          <button
            type="button"
            disabled={isRefreshing}
            onClick={onRefresh}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#93C5FD] disabled:opacity-40"
            aria-label="Refresh"
          >
            <FiRefreshCcw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "Players", value: String(players) },
          { label: "Calls", value: String(totalCalls) },
          { label: "Bonus", value: stat?.bonus ?? "—" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-white/10 bg-white/5 px-2.5 py-2 text-center"
          >
            <p className="text-[9px] font-bold uppercase tracking-wider text-[#64748B]">{item.label}</p>
            <p className="mt-0.5 text-sm font-black tabular-nums text-white">{item.value}</p>
          </div>
        ))}
      </div>
    </header>
  );
}
