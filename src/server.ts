import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Mistral } from "@mistralai/mistralai";

const MODEL = "mistral-large-latest";
const MAX_TOKENS = 8192;
const PORT = Number(process.env.PORT ?? 3000);
const HOST = "127.0.0.1";
const MAX_HISTORY_MESSAGES = 200;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const systemPromptPath = path.join(rootDir, "system-prompt.md");

if (!process.env.MISTRAL_API_KEY) {
  console.error("MISTRAL_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const sessions = new Map<string, { messages: ChatMessage[] }>();

function readSystemPrompt(): string {
  return fs.readFileSync(systemPromptPath, "utf8");
}

function getSessionId(req: express.Request, res: express.Response): string {
  const pairs = (req.headers.cookie ?? "").split(";");
  const cookies: Record<string, string> = {};
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  let id = cookies["bot_session"];
  if (!id || !sessions.has(id)) {
    id = crypto.randomUUID();
    sessions.set(id, { messages: [] });
    res.setHeader("Set-Cookie", `bot_session=${id}; Path=/; HttpOnly; SameSite=Lax`);
  }
  return id;
}

function deltaToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const part of content) {
    if (
      part !== null &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      out += part.text;
    }
  }
  return out;
}

const app = express();
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  const text = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!text) {
    res.status(400).json({ error: "Message is empty." });
    return;
  }

  const sessionId = getSessionId(req, res);
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(500).json({ error: "Session could not be created." });
    return;
  }

  let systemPrompt: string;
  try {
    systemPrompt = readSystemPrompt();
  } catch {
    res.status(500).json({
      error: "system-prompt.md is missing or unreadable. Create it in the project root folder.",
    });
    return;
  }

  session.messages.push({ role: "user", content: text });
  if (session.messages.length > MAX_HISTORY_MESSAGES) {
    session.messages.splice(0, session.messages.length - MAX_HISTORY_MESSAGES);
  }
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...session.messages];

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const write = (payload: string): boolean => {
    try {
      res.write(payload);
      return true;
    } catch {
      return false;
    }
  };

  let full = "";
  try {
    const stream = await client.chat.stream({ model: MODEL, maxTokens: MAX_TOKENS, messages });
    for await (const event of stream) {
      const piece = deltaToText(event.data.choices?.[0]?.delta?.content);
      if (piece) {
        full += piece;
        if (!write(`data: ${JSON.stringify({ text: piece })}\n\n`)) break;
      }
    }
    session.messages.push({ role: "assistant", content: full });
    write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    write(`data: ${JSON.stringify({ error: `Mistral API error: ${message}` })}\n\n`);
  } finally {
    res.end();
  }
});

app.post("/api/reset", (req, res) => {
  const sessionId = getSessionId(req, res);
  const session = sessions.get(sessionId);
  if (session) session.messages = [];
  res.json({ ok: true });
});

app.use(express.static(publicDir));

app.listen(PORT, HOST, () => {
  console.log(`JanitorAI bot builder running at http://localhost:${PORT}`);
});
