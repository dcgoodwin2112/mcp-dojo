// Scripted stdio MCP server for stdio-manager integration tests.
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin });
const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
let sawInitialized = false;

rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: msg.params.protocolVersion,
        serverInfo: { name: "scripted", version: "1" },
        capabilities: {},
      },
    });
  } else if (msg.method === "notifications/initialized") {
    sawInitialized = true;
  } else if (msg.method === "tools/call") {
    const name = msg.params?.name;
    if (name === "echo") {
      send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "ok" }] } });
    } else if (name === "saw-initialized") {
      send({ jsonrpc: "2.0", id: msg.id, result: { saw: sawInitialized } });
    } else if (name === "notify-then-respond") {
      send({ jsonrpc: "2.0", method: "notifications/progress", params: { progress: 1 } });
      send({ jsonrpc: "2.0", id: msg.id, result: { done: true } });
    } else if (name === "later-notify") {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
      setTimeout(() => send({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info" } }), 30);
    } else if (name === "slow") {
      setTimeout(() => send({ jsonrpc: "2.0", id: msg.id, result: { slow: true } }), 150);
    } else if (name === "silent") {
      // never respond
    } else if (name === "flood") {
      for (let i = 0; i < 600; i++) {
        send({ jsonrpc: "2.0", method: "notifications/progress", params: { i } });
      }
    } else if (name === "stderr-secret") {
      process.stderr.write(`token is ${process.env.CHILD_SECRET ?? "none"}\n`);
      // never respond — the timeout error carries the stderr excerpt
    } else if (name === "env-keys") {
      send({ jsonrpc: "2.0", id: msg.id, result: { keys: Object.keys(process.env).sort() } });
    } else {
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "unknown tool" } });
    }
  }
});
