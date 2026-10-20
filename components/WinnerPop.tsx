// import { Button } from "./ui/button";
// import { AiFillStar } from "react-icons/ai";
// import { useUser } from "@/api/session";

// interface WinnerPopupProps {
//   onClick: () => void;
//   pattern: number[][];
//   name: string;
//   card_id: string;
//   user_id: string;
//   winnerData?: { name: string; score: number };
//   highlightPositions?: number[];
//   calledNumbers?: number[];
//   bones_won?: number; // ✅ Add this
// }

// export default function WinnerPopup({
//   onClick,
//   pattern,
//   card_id,
//   name,
//   user_id,
//   highlightPositions = [],
//   calledNumbers = [],
//   bones_won = 0, // ✅ Default to 0 if not provided
// }: WinnerPopupProps) {
//   const isValidNumbers = Array.isArray(pattern) && pattern.every(Array.isArray);
//   const user = useUser();
//   const { displayReference } = useUser();
//   const userInfo = user.user;

//   const getCellStyle = (positionKey: number, num: number) => {
//     if (highlightPositions.includes(positionKey)) {
//       return { backgroundColor: "#22C55E", color: "white" };
//     }
//     if (calledNumbers.includes(num) || num === 0) {
//       return { backgroundColor: "#FBBF24", color: "white" };
//     }
//     return { backgroundColor: "white", color: "#2d3748" };
//   };

//   return (
//     <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
//       <div
//         className={`relative w-11/12 max-w-lg p-6 md:p-10 rounded-xl shadow-xl bg-[#0c1424]/90 border border-[#d4af37]/20 text-[#d4af37]`}
//       >

//         <h2 className="text-3xl md:text-5xl font-extrabold text-center mb-4 md:mb-6 text-white drop-shadow-lg">
//           🎉 Bingo! 🎉
//         </h2>
//         <p className="text-center text-lg md:text-2xl text-white font-semibold drop-shadow mb-4 md:mb-6">
//           {userInfo && userInfo.id === user_id
//             ? `Congratulations, you have won!`
//             : `You lost, ${name} has won!`}
//         </p>

//         {bones_won > 0 && ( // ✅ Show bonus only if not zero
//           <p className="text-center text-xl font-bold text-yellow-200 mb-4">
//             💰 Bonus Won: {bones_won} Birr
//           </p>
//         )}

//         {card_id && (
//           <p className="text-center text-sm md:text-md text-black-200 font-light mb-4">
//             Card: {card_id}
//           </p>
//         )}

//         <div className="relative grid grid-cols-5 gap-1">
//           {isValidNumbers ? (
//             pattern.flat().map((num, index) => {
//               const positionKey = index + 1;
//               const cellStyle = getCellStyle(positionKey, num);
//               return (
//                 <Button
//                   key={index}
//                   variant="outline"
//                   className="w-full h-full font-medium text-[14px] rounded-md shadow"
//                   style={cellStyle}
//                 >
//                   {num === 0 ? <AiFillStar size={18} /> : num}
//                 </Button>
//               );
//             })
//           ) : (
//             <div className="col-span-5 text-center text-red-500">
//               Invalid Bingo Card Data
//             </div>
//           )}
//         </div>

//         <div className="flex justify-center mt-2">
//           <Button
//             onClick={onClick}
//             className="bg-yellow-400 text-black text-md md:text-lg px-6 md:px-8 py-2 rounded-lg shadow-md hover:bg-yellow-500 transition duration-300 ease-in-out"
//           >
//             Play Again
//           </Button>
//         </div>
//       </div>
//     </div>
//   );
// }
"use client";

import { Button } from "./ui/button";
import { AiFillStar } from "react-icons/ai";
import { useUser } from "@/api/session";

interface WinnerPopupProps {
  onClick: () => void;
  pattern: number[][];
  name: string;
  card_id: string;
  user_id: string;
  winnerData?: { name: string; score: number };
  highlightPositions?: number[];
  calledNumbers?: number[];
  bones_won?: number; // ✅ Add this
  amount_won?: number; // ✅ Add this
  jackpot_won_total?: number;
  showJackpotAnimation?: boolean;
  x_bonus_won_total?: number;
  x_scenario?: string;
  showXAnimation?: boolean;
}

export default function WinnerPopup({
  onClick,
  pattern,
  card_id,
  name,
  user_id,
  highlightPositions = [],
  calledNumbers = [],
  bones_won = 0, // ✅ Default to 0 if not provided
  amount_won = 0,
  jackpot_won_total = 0,
  showJackpotAnimation = false,
  x_bonus_won_total = 0,
  x_scenario = "",
  showXAnimation = false,
}: WinnerPopupProps) {
  const isValidNumbers = Array.isArray(pattern) && pattern.every(Array.isArray);
  const user = useUser();
  const userInfo = user.user;

  const getCellStyle = (positionKey: number, num: number) => {
    if (highlightPositions.includes(positionKey)) {
      return "bg-[var(--stake-green)] text-white border-[var(--stake-green)]";
    }
    if (calledNumbers.includes(num) || num === 0) {
      return "bg-primary text-foreground border-primary";
    }
    return "bg-white text-foreground border-border";
  };

  return (
    <div className="relative w-full max-w-md ps-2 sm:ps-4">
      <div
        className="
          relative w-11/12 max-w-lg mx-auto
          p-4 md:p-5 rounded-3xl
          bg-surface border border-border
          shadow-[0_8px_32px_rgba(30,36,51,0.14)]
          text-foreground
        "
      >
        <h2 className="text-3xl md:text-4xl font-extrabold text-center text-foreground mb-1">
          🎉 BINGO! 🎉
        </h2>

        <p className="text-center text-base md:text-xl font-semibold text-foreground mb-1">
          {userInfo && String(userInfo.id) === String(user_id)
            ? `Congratulations, you have won!`
            : `${name} has won!`}
        </p>

        {amount_won > 0 && (
          <p className="text-center text-base font-bold text-[var(--stake-green)] mb-1">
            🏆 Amount Won: {amount_won} Birr
          </p>
        )}

        {jackpot_won_total > 0 && (
          <div
            className={[
              "text-center rounded-2xl border bg-primary-muted border-[var(--primary-border)] px-3 py-2 mb-2",
              showJackpotAnimation ? "animate-pulse shadow-[0_0_20px_rgba(var(--primary-rgb),0.25)]" : "",
            ].join(" ")}
          >
            <p className="text-sm font-black text-foreground">🎰 Jackpot Won</p>
            <p className="text-lg font-extrabold text-foreground">
              Total: {jackpot_won_total} Birr
            </p>
          </div>
        )}

        {x_bonus_won_total > 0 && (
          <div
            className={[
              "text-center rounded-2xl border px-3 py-2 mb-2",
              "bg-[var(--playing-bg)]/40 border-[var(--stake-green)]/30",
              showXAnimation ? "animate-pulse shadow-[0_0_20px_rgba(45,138,62,0.2)]" : "",
            ].join(" ")}
          >
            <p className="text-sm font-black text-foreground">
              {x_scenario || "xBonus"} Bonus
            </p>
            <p className="text-lg font-extrabold text-foreground">
              Added: {x_bonus_won_total} Birr
            </p>
          </div>
        )}

        {bones_won > 0 && (
          <p className="text-center text-base font-bold text-primary mb-1">
            💰 Bonus Won: {bones_won} Birr
          </p>
        )}

        {card_id && (
          <p className="text-center text-xs md:text-sm text-muted mb-3">
            Card: <span className="font-semibold text-foreground">{card_id}</span>
          </p>
        )}

        <div className="relative grid grid-cols-5 gap-[3px] p-2 rounded-xl bg-background/40 border border-border">
          {isValidNumbers ? (
            pattern.flat().map((num, index) => {
              const positionKey = index + 1;
              const styles = getCellStyle(positionKey, num);
              return (
                <div
                  key={index}
                  className={`flex items-center justify-center h-8 text-sm font-bold rounded-md border ${styles}`}
                >
                  {num === 0 ? <AiFillStar size={14} /> : num}
                </div>
              );
            })
          ) : (
            <div className="col-span-5 text-center text-error text-sm font-semibold">
              Invalid Bingo Card Data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}