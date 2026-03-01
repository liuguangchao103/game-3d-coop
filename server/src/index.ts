import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { PROTOCOL_VERSION } from "@game/shared";
import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";

import { startGameLoop } from "./gameLoop";
import { handleClientMessage, handleDisconnect, type ClientContext } from "./protocolGateway";
import { RoomManager } from "./roomManager";

const PORT = Number(process.env.PORT ?? 8787);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get("/version", (_req, res) => {
  res.json({
    protocolVersion: PROTOCOL_VERSION,
    appVersion: process.env.npm_package_version ?? "0.1.0"
  });
});

app.post("/rooms", (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  res.json({
    ok: true,
    transport: "websocket",
    endpoint: "/ws",
    action: { t: "room.create", name }
  });
});

app.post("/rooms/:code/join", (req, res) => {
  const code = typeof req.params?.code === "string" ? req.params.code.toUpperCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  res.json({
    ok: true,
    transport: "websocket",
    endpoint: "/ws",
    action: { t: "room.join", code, name }
  });
});

const httpServer = createServer(app);
const wsServer = new WebSocketServer({ server: httpServer, path: "/ws" });

const roomManager = new RoomManager();
const loop = startGameLoop(roomManager);

wsServer.on("connection", (ws) => {
  const context: ClientContext = {
    clientId: randomUUID(),
    ws
  };

  ws.on("message", (raw) => {
    const payload = typeof raw === "string" ? raw : raw.toString("utf8");
    handleClientMessage(context, payload, roomManager);
  });

  ws.on("close", () => {
    handleDisconnect(context, roomManager);
  });

  ws.on("error", () => {
    handleDisconnect(context, roomManager);
  });
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  clearInterval(loop);
  wsServer.close();
  httpServer.close(() => process.exit(0));
});
