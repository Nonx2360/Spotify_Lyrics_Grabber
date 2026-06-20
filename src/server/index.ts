import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { setupWebSocket } from "./ws.js";
import { spotifyRouter, startPolling } from "./spotify.js";
import { initRomaji } from "./romaji.js";

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.PORT || "4000", 10);

app.use(express.json());

app.use("/api", spotifyRouter);

app.get("/api/now", (_req, res) => {
  res.json({ message: "SLG backend running" });
});

setupWebSocket(server);

async function start() {
  await initRomaji();
  server.listen(PORT, () => {
    console.log(`SLG backend running on http://localhost:${PORT}`);
    startPolling();
  });
}

start();
