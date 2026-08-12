# Stem Splitter

Take any song and pull the vocals, drums, bass, and everything else apart onto their own
separate tracks. Handy for making a karaoke version, practicing along to just the drums,
grabbing a vocal for a remix, or just hearing a favorite song in a completely new way.

Try it right now, nothing to install: **https://stemsplitter-two.vercel.app**

Upload a song, or just paste a YouTube link, and your separated tracks come back a couple of
minutes later, ready to download. It's free.

## Want to run your own copy on your computer?

The steps below are for that. You don't need any of this to use the link above, it's only for
people who want their own private version running locally.

Two things need to be running at once: the part that actually splits the audio, and the website
you use to upload songs and download the results.

### 1. Start the splitter

Open a terminal and run:

```bash
cd engine
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

The first run downloads the model that does the actual separating (a few hundred MB), so give
it a minute or two.

One note if you're on a Mac with Apple Silicon (M1, M2, M3): leave this on the regular
processor, not the graphics chip. Pushing it onto the graphics chip crashes every job, that's a
known limitation and not something to try to fix.

### 2. Start the website

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

### On a Mac, there's a shortcut

Double-click `start.command` in the main folder and it starts both pieces for you and opens the
site automatically. `stop.command` shuts everything back down.

## Want to host your own copy for other people to use?

The splitter can be hosted for free (see the `engine` folder, it's ready to go on Hugging Face
Spaces), and the website can be put up anywhere that hosts a Next.js site, like Vercel. Point
the website at your hosted splitter and you've got your own link to share.
