/**
 * Format stake for display. DB stores: cents for USD/EUR/GBP, whole units for "tokens".
 */
export function formatStake(stake: number, stakeCurrency: string): string {
  if (stakeCurrency === "tokens") {
    return `${stake} ${stakeCurrency}`;
  }
  const value = stake / 100;
  return `${value.toFixed(2)} ${stakeCurrency}`;
}
