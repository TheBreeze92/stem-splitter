# Stem Splitter

Take any song and pull the vocals, drums, bass, and everything else apart onto their own
separate tracks. Handy for making a karaoke version, practicing along to just the drums,
grabbing a vocal for a remix, or just hearing a favorite song in a completely new way.

Try it right now, nothing to install: **https://stemsplitter-two.vercel.app**

Upload a song, or just paste a YouTube link, and your separated tracks come back a couple of
minutes later, ready to download. It's free.

## Already have Claude Code?

Paste these two lines in, once:

```
/plugin marketplace add TheBreeze92/stem-splitter
/plugin install stemsplitter@stem-splitter
```

From then on, just type `/stemsplitter` any time you want to use it. First time it'll take a
couple of minutes to quietly set itself up, every time after that it just opens.

## Want to run your own copy without Claude Code?

The steps below are for that. You don't need any of this to use the link above, it's only for
people who want their own private version running locally.

### On a Mac, easiest way

Double-click `start.command` in the main folder. First time, it quietly sets everything up on
its own, no other steps needed, then opens the site. Every time after that it just opens
straight away. `stop.command` shuts it back down.

### By hand, on any computer

Two things need to be running at once: the part that actually splits the audio, and the website
you use to upload songs and download the results.

#### 1. Start the splitter

Open a terminal and run:

```bash
cd engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

The first run downloads the model that does the actual separating (a few hundred MB), so give
it a minute or two.

One note if you're on a Mac with Apple Silicon (M1, M2, M3): leave this on the regular
processor, not the graphics chip. Pushing it onto the graphics chip crashes every job, that's a
known limitation and not something to try to fix.

#### 2. Start the website

In a second terminal:

```bash
cd web
cp .env.local.example .env.local
```

Open the new `.env.local` file and point it at the splitter you just started
(`http://localhost:8000`), then:

```bash
npm install
npm run dev
```

Open http://localhost:3000 and use it the same way you would the live site.

## Want to host your own copy for other people to use?

The splitter can be hosted for free (see the `engine` folder, it's ready to go on Hugging Face
Spaces), and the website can be put up anywhere that hosts a Next.js site, like Vercel. Point
the website at your hosted splitter and you've got your own link to share.
