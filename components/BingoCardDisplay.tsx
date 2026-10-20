"use client";

import { AiFillStar } from "react-icons/ai";
import { Button } from "./ui/button";

interface BingoCardPropType {
  numbers: number[][]; // Expecting an array of arrays
}

export default function BingoCardDisplay(props: BingoCardPropType) {
  const { numbers = [] } = props;

  // Check if numbers is a valid array of arrays
  const isValidNumbers = Array.isArray(numbers) && numbers.every(Array.isArray);

  const bingo = "BINGO";
  const bingoArray = bingo.split("");

  return (
    <div className="relative md:m-1">
      <div className="relative grid grid-cols-5 gap-1">
        {bingoArray.map((t, index) => (
          <Button
            key={index} // Add unique `key` here
            className="w-[20px] h-[20px] text-[#d4af37]  bg-[#0c1424]  font-bold text-[12px] rounded-md shadow-lg"
          >
            {t}
          </Button>
        ))}

        {isValidNumbers ? (
          numbers.flat().map((num, index) => (
            <Button
              key={index} // Add unique `key` here
              variant="outline"
              className={`w-[20px] h-[20px] font-medium text-[10px] rounded-md shadow`}
              style={{
                backgroundColor: "white", // Default background color
                color: "#2d3748", // Default text color
              }}
            >
              {num === 0 ? <AiFillStar size={13} /> : num}
            </Button>
          ))
        ) : (
          <div className="col-span-5 text-center text-red-500">
            Invalid Bingo Card Data
          </div>
        )}

      </div>
    </div>
  );
}
