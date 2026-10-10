const b = require("bcryptjs");
const h = "$2b$10$Ds3BCo6nvmRcJkTAbhDyhu9M1lrNzBtkzvm7vEPBpBlkrNWyEFjAC";
console.log("compare 2b:", b.compareSync("Test#2026x", h));
console.log("compare 2a:", b.compareSync("Test#2026x", h.replace("$2b$", "$2a$")));
