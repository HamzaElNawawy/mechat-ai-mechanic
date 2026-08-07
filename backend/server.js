require("dotenv").config();

const config = require("./config");
const app = require("./app");

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
