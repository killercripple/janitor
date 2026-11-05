# JanitorAI Bot Builder

A small local web app that turns your ideas into JanitorAI character cards using the
Mistral API (`mistral-large-latest`) through the official TypeScript SDK
(`@mistralai/mistralai`). Responses stream in live, the full conversation is kept so
you can ask for revisions, and each labeled section (NAME, TAGLINE, PERSONALITY,
SCENARIO, FIRST MESSAGE, EXAMPLE DIALOGUES) gets its own box with a Copy button.

Your API key stays on your computer: the server reads it from `.env` and never sends
it to the browser.

## What you need first

1. **Node.js** (version 20 or newer): download the LTS installer from
   [nodejs.org](https://nodejs.org), run it, and keep "Add to PATH" checked.
2. **A Mistral API key**: sign in at [console.mistral.ai](https://console.mistral.ai),
   go to **API Keys**, click **Create API key**, and copy the key.

## Setup (one time)

1. Open this project folder in File Explorer, click the address bar at the top,
   type `cmd`, and press Enter. A black Command Prompt window opens inside the folder.
2. Make your env file and open it in Notepad:

   ```
   copy .env.example .env
   notepad .env
   ```

3. In Notepad, replace `put-your-key-here` with your Mistral API key and save
   (Ctrl+S), then close Notepad.
4. Install the dependencies:

   ```
   npm install
   ```

5. Put your system prompt in its own file. Open it in Notepad:

   ```
   notepad system-prompt.md
   ```

   Delete the placeholder text and paste your system prompt (the text that was
   below `=== SYSTEM PROMPT ===`), then save. The app sends this file verbatim as
   the system message, and re-reads it on every request, so you can edit it any
   time without touching code or restarting the app.

## Run it

In the same Command Prompt window:

```
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.
To stop the app, go back to the Command Prompt and press Ctrl+C.

For development with automatic reload after code changes, use `npm run dev` instead.

## Using the app

- Type a character description (or a revision request like "make her more
  sarcastic") into the big text box and click **Send**, or press **Ctrl+Enter**.
- The reply streams in below. Each labeled section is rendered in its own box with
  a large **Copy** button.
- **Download all as .txt** saves the whole conversation (your requests and the
  generated text) to a file called `janitorai-character.txt`.
- **New Character** clears the conversation so the model forgets the previous
  character and starts fresh.

## Project layout

```
src/server.ts       Express server: streaming Mistral calls, session history, .env key
public/index.html   The page
public/style.css    Dark, high-contrast, large-text styling
public/app.js       Streaming UI, section boxes, copy/download/reset
system-prompt.md    Your system prompt, sent verbatim as the system message
.env                Your API key (never committed; create from .env.example)
```

## Security notes

- `MISTRAL_API_KEY` is read from `.env` on the server only.
- `.env` is listed in `.gitignore`; never paste your key into code or chat.
- The server binds to `127.0.0.1` only, so it is reachable just from your own machine.
