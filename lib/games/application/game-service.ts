export type NewGame = {
  code: string;
  name: string;
  status: string;
  stake: number;
  stakeCurrency: string;
};

export type GameSummary = {
  id: string;
  code: string | null;
  name: string | null;
  stake: number;
  stakeCurrency: string;
  status: string;
  maxPlayers: number;
  playerCount: number;
};

export interface GameRepository {
  codeExists(code: string): Promise<boolean>;
  create(data: NewGame): Promise<Pick<GameSummary, "id" | "code" | "name" | "stake" | "stakeCurrency">>;
  list(where: { status: string; stake?: number }): Promise<GameSummary[]>;
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createGame(repository: GameRepository, input: Record<string, unknown>) {
  const name = String(input.name ?? "").trim() || "Bingo game";
  const stakeCurrency = String(input.stakeCurrency ?? "USD").trim().slice(0, 20) || "USD";
  const rawStake = Number(input.stake) ?? 0;
  const stake =
    stakeCurrency === "tokens"
      ? Math.max(0, Math.floor(rawStake))
      : Math.max(0, Math.round(rawStake * 100));

  let code = randomCode();
  while (await repository.codeExists(code)) {
    code = randomCode();
  }

  return repository.create({ code, name, status: "waiting", stake, stakeCurrency });
}

export async function listGames(
  repository: GameRepository,
  input: { stake?: string; stakeCurrency?: string; status?: string }
) {
  const stakeCurrency = input.stakeCurrency ?? "USD";
  const where: { status: string; stake?: number } = {
    status: input.status ?? "waiting",
  };

  if (input.stake !== undefined && input.stake !== "") {
    const rawStake = Number(input.stake);
    if (!Number.isNaN(rawStake) && rawStake >= 0) {
      where.stake =
        stakeCurrency === "tokens" ? Math.floor(rawStake) : Math.round(rawStake * 100);
    }
  }

  return repository.list(where);
}