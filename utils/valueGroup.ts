export const valueGroup = (value: number) => {
  switch (true) {
    case value >= 1 && value <= 15:
      return "B";
    case value >= 16 && value <= 30:
      return "I";
    case value >= 31 && value <= 45:
      return "N";
    case value >= 46 && value <= 60:
      return "G";
    case value >= 61 && value <= 75:
      return "O";
    default:
      return "Invalid";
  }
};