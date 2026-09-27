import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, loadRoutes } from "./lib/routes.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3000);

const here = dirname(fileURLToPath(import.meta.url));
const routes = await loadRoutes(join(here, "api"));

createApp(routes).listen(PORT, HOST, () => {
  console.log(`proposal-generator listening on ${HOST}:${PORT}`);
  console.log(`routes: ${[...routes.keys()].sort().join(", ")}`);
});
