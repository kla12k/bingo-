export const createList = () => {
  const result = Array.from({ length: 15 }, () => Array(5).fill(0));

  let value = 1;

  // Loop to fill columns first, then rows
  for (let col = 0; col < 5; col++) {
    for (let row = 0; row < 15; row++) {
      result[row][col] = value;
      value++;
    }
  }

  return result;
};
