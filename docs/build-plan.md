# Ghostline: Research Report and Vibe Coding Build Plan (Beginner Edition, June 2026)

This is the same plan as before, rewritten so it assumes you have never done AI-assisted development. Every technical term is explained the first time it appears, every abbreviation is expanded, and there is a vocabulary section up front you can flip back to whenever a word stops making sense. The prompts you paste into Claude Code are unchanged and still in code blocks. Everything around them is now written for a smart person who has simply never done this before.

How to use this document: read Part 0 once, skim the findings so you understand why the plan is shaped this way, then follow the build plan literally, step by step, top to bottom.

---

## Part 0: The vocabulary (read this once, refer back often)

### The AI tooling

**Vibe coding.** A way of building software where you describe what you want in plain English and an AI writes the actual code. Your job shifts from typing code to three things: specifying clearly what to build, reviewing what the AI did, and testing that it actually works. You are the engineering manager, the AI is the engineer.

**Claude Code.** Anthropic's AI coding agent. It is different from the Claude website you chat with. Claude Code runs on your computer, can see and edit the files in your project folder, and can run commands on your machine (like installing a library or starting your app). You give it instructions in plain English, it does the work, and it shows you what it changed.

**The Claude Code VS Code extension.** A version of Claude Code that lives in a side panel inside VS Code (your code editor) instead of in a separate terminal window. Same brain, more comfortable interface: you see file changes visually, and you can click to undo things. You will use this.

**Context window (or just "context").** The AI's short-term working memory for the current conversation. Everything you say, everything it reads, and everything it writes fills this memory up. When it gets close to full, the AI gets noticeably dumber and more forgetful. A lot of the workflow advice in this document exists purely to keep this memory clean.

**CLAUDE.md.** A plain text file you keep in your project folder. Claude Code automatically reads it at the start of every conversation. Think of it as the project's rulebook and cheat sheet: what the project is, how it is structured, what rules to follow, which commands to use. Writing a good one is the single highest-leverage thing you will do, because it means you never have to re-explain your project.

**Slash commands.** Commands you type into the Claude Code chat box that start with a forward slash. They control the tool itself rather than asking it to write code. The ones you will actually use:
- `/clear` wipes the conversation memory completely. Use between features.
- `/compact` summarizes the conversation to free up memory while keeping the important parts.
- `/context` shows how full the memory currently is.
- `/model` switches which Claude model is doing the work.
- `/rewind` opens the checkpoint menu (see below).
- `/status` shows your plan usage.

**Plan Mode.** A read-only mode where Claude Code is not allowed to touch your files. It can only read your project and propose a written step-by-step plan. You review the plan, edit it if needed, approve it, and only then does it start editing files. You switch between modes by pressing Shift+Tab (it cycles through: normal editing, auto-accept, and Plan Mode). Use Plan Mode for anything complicated. It is the single biggest quality lever in this whole workflow.

**Checkpoints and rewind.** The extension automatically snapshots your files every time Claude edits them. If Claude makes a mess, press Escape twice (or type `/rewind`) and you can restore the files, the conversation, or both, back to an earlier point. One catch: checkpoints only cover file edits Claude made. If Claude ran a command that did something (like deleting a folder), rewind cannot undo that. That is why you also use Git (below).

**Extended thinking.** A toggle (Alt+T on Windows) that makes the model reason longer and harder before answering. Slower, but better for genuinely difficult problems like designing the animation system. You will be told exactly when to turn it on.

**Subagent.** A temporary helper AI that Claude Code can spin up for a self-contained side task ("go research X and report back"). The point is that the side task's clutter fills the helper's memory instead of your main conversation's memory. You ask for one by literally saying "use a subagent to..." You will rarely need this, but now the word will not confuse you.

**Diff.** A side-by-side view of exactly what changed in a file. Removed lines are shown in red, added lines in green. The VS Code extension shows you a diff for every change Claude makes. Reading diffs before accepting them is how you stay in control without writing the code yourself.

**MCP (Model Context Protocol).** A plug-in standard that gives Claude Code extra abilities beyond editing files. An "MCP server" is one such plug-in. Example: the Playwright MCP lets Claude open a real browser, look at your running app, take screenshots, and read error messages, which means it can check its own visual work. You install these with one command; the plan tells you exactly when and how.

### Code and computer basics

**VS Code (Visual Studio Code).** Microsoft's free code editor. It is where your files live on screen and where the Claude Code extension panel sits.

**Terminal (also called the command line).** A text window where you type commands instead of clicking buttons. On Windows the default one is called PowerShell. VS Code has a terminal built in (open it with Ctrl+` or via the menu: Terminal, then New Terminal). When this document says "run this command," it means type it in a terminal and press Enter.

**Git, commit, push, repository, GitHub.** Git is a version control system: it takes permanent snapshots of your entire project so you can always go back to any earlier working state. The folder being tracked is called a repository (repo for short). A "commit" is one saved snapshot with a short description. A "push" uploads your commits to GitHub, a website that stores your repo online (free backup, plus it is what triggers your hosting service to update the live site). You will not need to learn Git deeply; Claude Code runs the Git commands for you when you ask it to commit.

**Node.js and npm.** Node.js lets JavaScript (the language of websites) run on your computer instead of only inside a browser. It comes with npm (Node Package Manager), the tool that downloads JavaScript libraries. A "library" or "package" is pre-written code you install instead of writing yourself.

**Python virtual environment (venv), pip, requirements.txt.** Python projects each get their own private folder of installed libraries called a virtual environment, so different projects' library versions never clash. You "activate" it before working, which just points your terminal at that private folder. pip is Python's library installer, and requirements.txt is the shopping list of libraries the project needs.

**CLI (command-line interface).** Any program you use by typing commands in a terminal rather than clicking. Our data pipeline will be a small CLI.

**REPL (read-evaluate-print loop).** The interactive Python prompt: you type one line of Python, it runs immediately, you see the result. Handy for quickly poking at data. You get one by typing `python` in a terminal (and leave it by typing `exit()`).

**JSON (JavaScript Object Notation).** A plain-text format for structured data: labeled values, lists, and nesting. Both Python and the browser read it natively. Our pipeline's entire output is one JSON file per session, which is why no database is needed.

**Monorepo.** One repository that contains multiple sub-projects. Ours holds the Python pipeline and the web app side by side in one folder.

### Web app concepts

**Frontend and backend.** The frontend is everything that runs in the visitor's browser: the visuals, buttons, charts. The backend is code that runs on a server somewhere else. Ghostline is almost entirely frontend; the only backend we ever add is one tiny function in V2.

**React and Vite.** React is the most popular library for building interactive browser interfaces out of reusable pieces called components. Vite is the tool that runs your React project while you develop (with instant reload when files change) and bundles it for release.

**Canvas vs SVG.** Two ways a browser can draw graphics. SVG (Scalable Vector Graphics) makes every shape a separate live object in the page, which gets slow when many shapes move every frame. Canvas is a single drawing surface you repaint from scratch each frame, like a whiteboard, which stays fast with lots of motion. Twenty cars animating at 60 frames per second is firmly canvas territory.

**localhost.** An address (like `http://localhost:5173`) that only exists on your own computer. While developing, your app runs there: live for you, invisible to the world.

**Deployment, Vercel, CDN.** Deploying means publishing your app to a real public web address. Vercel is the hosting service we use; its free tier covers everything this project needs. A CDN (content delivery network) is Vercel's worldwide network of servers that keeps copies of your files close to visitors so the site loads fast. You get it automatically.

**Serverless function.** A small piece of backend code that Vercel runs only when someone calls it. You never set up or maintain a server. We use exactly one, in V2, to keep a secret key away from the browser.

**API and API key.** An API (application programming interface) is how two programs talk to each other over the internet. An API key is the password that proves your program is allowed to use a paid API. Rule one of API keys: they must never appear in frontend code, because anything in the browser is publicly visible.

**Environment variable and .env file.** A named value (typically a secret like an API key) stored outside your code so it never gets saved into the repository. Locally they live in a file named `.env` which Git is told to ignore; on Vercel you store them in the project settings.

**Tailwind.** A popular shortcut system for styling web pages. Optional for this project; plain CSS is fine.

### Data concepts

**Sample rate, Hz.** How many measurements per second a data feed contains. Hz (hertz) means "times per second." F1's public telemetry feed is about 4 to 5 Hz, meaning roughly one position update every 200 to 250 milliseconds. The smooth-looking data between samples is interpolated, which means filled in by educated guessing. This is the project's main accuracy limit and it shapes several decisions below.

**Smoothing (Savitzky-Golay filter).** A standard technique that removes jitter from noisy data before you do calculus on it. Doing calculus (rates of change) on jittery data amplifies the noise into garbage, so we always smooth first. You will see `savgol_filter` in the prompts; that is this.

**PCA and clustering.** Two basic machine learning tools used in V2. PCA (principal component analysis) compresses many measurements per driver down to two numbers so drivers can be placed on a 2D map while keeping the meaningful differences between them. Clustering (we use an algorithm called KMeans) then groups nearby drivers into "style groups" automatically.

**MVP (minimum viable product).** The smallest version of the project that genuinely works end to end. You build the MVP first, get it live, then layer on the advanced features.

---

## TL;DR (plain English version)

- You will build Ghostline using the Claude Code extension inside VS Code on regular Windows (no special setup needed), with a Claude Pro subscription at $20 per month ($17 per month if billed annually). The workflow is always: have Claude plan, review the plan, let it build one small piece, verify it yourself with a real command, save a snapshot with Git, repeat. The architecture is a Python program that downloads F1 telemetry and precomputes everything into JSON files, plus a React website that reads those files. Hosting on Vercel is free. Total cash cost to ship the core product: just the subscription.
- Skip Supabase entirely, even though you see it in every vibe coding video. Supabase is a hosted database plus user-login system. Ghostline has no user accounts, no logins, and no data that changes after you generate it, so a database would add cost and complexity for zero benefit. Plain precomputed JSON files served by Vercel cover 100% of the data needs. The only backend you ever add is one tiny serverless function in V2 that holds your Anthropic API key for the AI debrief feature, and the AI model it calls (Claude Haiku 4.5) is so cheap that all your development testing will cost under a dollar.
- Use canvas (not SVG) for the 20-car replay animation, use a charting library called Recharts for the analysis charts, and respect the data's hard limits: the public position feed is only 4 to 5 measurements per second and somewhat jittery, sideways g-force calculated from speed and corner radius is trustworthy, but braking/acceleration g-force calculated from speed changes is unreliable per the data library's own maintainer. The app should label these as estimates. Honesty about data limits is a feature, not a weakness.

---

## Part 1: Key findings from the research

### How people get good results from Claude Code in 2026

1. **Plan before code.** Per DataCamp's 2026 analysis of production teams, Anthropic's own internal data shows unguided "just build it" attempts succeed only about a third of the time, and even Claude Code's creator abandons a meaningful fraction of his sessions. The disciplined loop of plan first, review the plan, then execute is the single biggest quality lever there is. In practice: for anything non-trivial, switch to Plan Mode (Shift+Tab), read the plan it produces, fix anything wrong, then approve.
2. **The AI's memory is the scarce resource.** Claude gets measurably worse as its context window fills up. Manage it deliberately: `/clear` between features, `/compact` at milestones (community consensus says compact when usage passes roughly 70 to 80%, which you check with `/context`), keep CLAUDE.md tight, and do one feature per session.
3. **Verify every step yourself.** Run the verification command with your own hands, every time. AI-written code often looks finished and runs without errors while still being subtly wrong. Concrete output you checked is the only signal that counts.
4. **Save working states constantly.** Checkpoints (Escape twice, or `/rewind`) let you instantly undo Claude's file edits, but they do not undo the side effects of commands Claude ran. Git commits are the real safety net: a permanent snapshot of the whole project you can always return to. Anthropic's own guidance is to commit or back up anything irreplaceable before letting an agent near it. The plan below tells you exactly when to commit.
5. **Tell it to keep things simple.** Left alone, Claude over-engineers: extra layers, helper files nobody asked for, premature flexibility. Putting "use the simplest possible approach" in CLAUDE.md measurably reduces this. Our CLAUDE.md does.

### The modern vibe coding loop

Plan it (Plan Mode plus your review), encode standards once (CLAUDE.md), build one small piece, verify with a real command, commit, repeat, deploy. Use extended thinking (Alt+T) only for the genuinely hard design steps, and read the diff (red removed, green added) for every change before accepting it.

What the VS Code extension specifically gives you over the plain terminal version: visual side-by-side diffs, automatic checkpoints with one-click rewind, the ability to reference a file by typing @ and its name, a plan review screen you can edit directly, and the Shift+Tab mode switcher. Under the hood it is the same engine, same login, same CLAUDE.md.

### Which paired tools actually matter for this project

- **GitHub: yes.** Free, backs up your work, gives you a public portfolio link, and is what triggers Vercel to redeploy your site automatically every time you push (about 60 to 90 seconds from push to live).
- **Vercel: yes.** The free Hobby tier hosts the static site and the one serverless function, with automatic HTTPS, a real URL, and preview deployments. This is the deployment target.
- **Supabase: no.** It is a hosted database plus authentication (user accounts and logins). Ghostline has neither users nor changing data. Static JSON files on Vercel's CDN fully cover it. Adding Supabase here would be resume-driven complexity. Only tools that earn their place get recommended in this plan.
- **MCP plug-ins worth installing:** Playwright MCP, which lets Claude open a browser, screenshot your running app, and read its error console, so it can verify visual work itself (this project is heavily visual, so this earns its place). Optionally context7, which pulls current, accurate library documentation into Claude's context mid-task, useful because FastF1 and React move fast. One Windows note: if the install command fails, the fix is given inline in Phase 2.4.
- **Not worth it:** the Vercel MCP (the Vercel CLI is simpler for a solo beginner), Linear or Notion integrations (no team to coordinate), and any database MCP (no database).

### Subscription, installation, and models (state of mid-2026)

- **Subscription.** Claude Code requires a paid plan; the free Claude.ai tier does not include it. Pro is $20 per month ($17 per month billed annually) and shares one usage pool with the Claude chat website, refilling on a 5-hour rolling window. Independent testing in 2026 (TrueFoundry) estimates roughly 45 prompts per 5-hour window on Pro, and Anthropic doubled Claude Code's window limits for paid plans in May 2026, but Anthropic no longer publishes fixed numbers, so treat any figure as guidance. Working one feature at a time, Pro is comfortably enough for this project. Upgrade to Max ($100 per month) only if limit resets actually interrupt you regularly. Current details: https://support.claude.com
- **Windows.** Claude Code runs natively on Windows 10/11; you do not need WSL (Windows Subsystem for Linux, a way of running Linux inside Windows that older guides insisted on). The native installer does not even need Node.js. You do need Git for Windows installed, because it provides the command toolkit Claude Code prefers to use. Official install docs: https://docs.claude.com/en/docs/claude-code/overview
- **Models.** Claude Code lets you pick which Claude model does the work (`/model`). Sonnet 4.6 is the default workhorse and what you will use for nearly everything; in Anthropic's own internal testing most Claude Code users preferred it even over the bigger model. Opus 4.8 is the heavyweight for the very hardest design steps. Haiku 4.5 is the small cheap one, irrelevant for coding but perfect as the model your app itself calls for the AI debrief feature, because at $1 per million input tokens and $5 per million output tokens (tokens are the word-fragments AI usage is billed in), hundreds of test debriefs cost under a dollar.

### FastF1 reality check (the data library, version 3.8.x in 2026)

FastF1 is the free Python library that downloads official F1 timing and telemetry data. What you get per lap: speed, throttle percentage, brake (only on/off, not pressure), gear, engine RPM, X/Y position on track, and timing. Seasons 2018 to present are available. It caches everything it downloads to a folder so you only wait once.

Its limits, which the plan is designed around:
- Position data arrives at only about 4 to 5 Hz and is jittery; everything smoother than that is interpolation (educated guessing between real samples). FastF1's own accuracy documentation warns against resampling raw data before doing math on it and against trusting anything computed by integration, because the low sample rate makes such results error-prone.
- Comparing where two different laps are at the same point carries roughly plus or minus 10 meters of position uncertainty. So the track map is for visualization; all timing math anchors to the reliable speed and time channels instead.
- Lateral (sideways) g-force computed from speed and corner radius comes out realistic, around 5 to 6 g in fast corners, matching published F1 figures. Longitudinal (braking/accelerating) g-force computed from how fast speed changes is, per the library's own maintainer, something many people have struggled to calculate accurately and the results are typically unreliable. We compute it anyway but label it approximate in the interface.
- 2026-specific gaps: the new active aerodynamics and electrical deployment data are not in the public feed, and DRS no longer exists under the 2026 rules. During development, use completed 2024 or 2025 sessions, which are stable and complete.
- One quirk you will see in the prompts: FastF1's X/Y coordinates are in tenths of a meter, so everything divides them by 10.

---

## Part 2: Project logistics and specifications

### The physics math, in plain terms

You do not need to fully follow this math to build the project (Claude Code does the implementing), but knowing what the words mean lets you sanity-check results.

- **Curvature** measures how tightly the racing line is bending at each point (1 divided by the corner radius). It is computed from the X/Y position trace using derivatives (rates of change). Because the position data is jittery, X and Y get smoothed with a Savitzky-Golay filter first; without smoothing, taking derivatives of jittery data produces nonsense.
- **Lateral g** (cornering force) = speed squared times curvature, divided by 9.81 to express it in g units. This one is trustworthy.
- **Longitudinal g** (braking and acceleration force) = how fast the speed is changing, divided by 9.81. This one is approximate, per the data library maintainer, and the app labels it as such.
- **Order of operations matters:** compute these on each lap's raw data first, then resample onto the common grid. Resampling first and differentiating after is exactly what the FastF1 accuracy docs warn against. This rule is baked into CLAUDE.md so Claude never forgets it.

### The data file plan (JSON size and shape)

Each session becomes one JSON file. For 20 drivers with about 1,000 points each (one point every 5 meters on a roughly 5 km track) and about 12 channels per driver:

- Stored in a **columnar layout**, meaning each channel is one long list (`"speed": [312, 311, 309, ...]`) instead of repeating labels on every point. Labels appear once per driver instead of a thousand times, which keeps the file small.
- Numbers get rounded hard: positions to 0.1 m, speed to whole km/h, g-forces to 0.01, times to a thousandth of a second. Precision beyond that is fake anyway given the source data.
- Result: roughly 1.3 to 1.5 MB per session file, which Vercel automatically compresses to roughly 250 to 350 KB when sending it to the browser (compression is free and automatic; you do nothing). That loads in well under a second on a normal connection. These are engineering estimates, not measured benchmarks; the rounding and layout above are what keep them true.
- One file per session is the right call for the MVP: one download, simple code.

### Tech stack choices, with reasoning

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | Vite + React (JavaScript) | The standard pairing Vercel is built around; instant reload while developing; enormous amount of training data means Claude writes it well |
| Replay animation | HTML canvas | Benchmarks consistently show canvas holds 60 frames per second with thousands of moving objects while SVG slows down past about 100, because every SVG shape is a live page object. 20 cars redrawn every frame is canvas territory |
| Charts | Recharts | A React charting library: declarative, simple, fine for a few hundred points per chart |
| Styling | Plain CSS (Tailwind optional) | One less thing to learn; add Tailwind later if you want |
| Pipeline | Python 3.11+, fastf1, pandas, numpy, scipy, scikit-learn | fastf1 is the data source; pandas/numpy handle tables and math; scipy provides the smoothing filter; scikit-learn provides PCA and clustering for V2 |
| Hosting | Vercel Hobby (free) | Static site, CDN, HTTPS, auto-deploy on Git push, serverless function support |

### Folder structure (the monorepo)

This is what your project folder will look like. Claude Code creates it in Phase 0; you just need to recognize the parts.

```
ghostline/
  CLAUDE.md              <- Claude Code's rulebook for this project
  README.md              <- the public description shown on GitHub
  .gitignore             <- tells Git which files to never snapshot (caches, secrets)
  pipeline/              <- the Python side: downloads data, does math, writes JSON
    requirements.txt     <- list of Python libraries the pipeline needs
    build_session.py     <- the command you run to process one session
    ghostline/           <- the Python package holding the actual logic
      load.py            <- talks to FastF1, finds each driver's fastest lap
      resample.py        <- puts every lap onto the common every-5-meters grid
      dynamics.py        <- curvature, g-forces, corner detection
      features.py        <- per-corner stats, style features, findings (V1/V2)
      delta.py           <- time gap to pole at every point
      export.py          <- writes the compact JSON
    cache/               <- FastF1's downloaded data (gitignored, can be huge)
  web/                   <- the React website
    public/sessions/     <- the JSON files the pipeline produced
    src/                 <- the website's code (components, logic)
  api/
    debrief.js           <- the one serverless function (V2 only)
  vercel.json            <- tells Vercel how to build and serve everything
```

### Complete software checklist

| # | Software | What it is | Cost |
|---|---|---|---|
| 1 | Git for Windows | Version control + the command toolkit Claude Code uses | Free |
| 2 | Node.js LTS | Runs JavaScript tooling; includes npm | Free |
| 3 | Python 3.11+ | Runs the data pipeline | Free |
| 4 | VS Code | The editor | Free |
| 5 | Claude Code + VS Code extension | The AI agent | Needs Claude Pro, $20/mo |
| 6 | GitHub account | Online backup + portfolio + deploy trigger | Free |
| 7 | Vercel account | Hosting | Free (Hobby tier) |
| 8 | Anthropic API key | Only for the V2 debrief feature | A few dollars total |

---

## Part 3: The build plan (follow literally, top to bottom)

### How each step works

Every numbered step has up to five parts:
- **The prompt:** the exact text to paste into the Claude Code chat panel. Copy it verbatim.
- **Mode:** whether to use Plan Mode first or just let it edit directly.
- **Expected result:** what should exist when it finishes.
- **Verify:** the exact command you run yourself, and what correct output looks like. Never skip this.
- **If it fails:** what to do, usually pasting the full error back.

General rules while following the plan: type `/clear` when a phase ends, read the diffs before accepting, and commit whenever a verification passes.

### Phase 0: Environment setup, repo creation, CLAUDE.md

**0.1 Install the software.** Do these yourself, in this order. After each install, close and reopen PowerShell before verifying (Windows only refreshes its program list, called PATH, in new terminal windows; "add to PATH" during an installer means "let me run this program by typing its name").

1. **Git for Windows** from git-scm.com. Accept the defaults; make sure the option about adding Git to PATH stays selected. Verify: open PowerShell (press the Windows key, type "powershell", Enter) and run `git --version`. A version number printed means it worked.
2. **Node.js LTS** from nodejs.org (LTS means the stable long-term-support version). Verify: `node --version` and `npm --version`.
3. **Python 3.11 or newer** from python.org. On the first installer screen, check the box that says "Add Python to PATH" before clicking install. Verify: `python --version`.
4. **VS Code** from code.visualstudio.com.
5. **Claude Code.** In PowerShell run: `irm https://claude.ai/install.ps1 | iex` (this downloads Anthropic's official installer and runs it; `irm` fetches, `iex` executes). Close PowerShell, open a new one, verify with `claude --version`.
6. **The extension.** Open VS Code, press Ctrl+Shift+X (Extensions), search "Claude Code", install the one published by Anthropic. Click the new spark icon in the left sidebar and sign in with your Claude Pro account when prompted. Important: sign in with the subscription account, not an API key, so your coding usage draws from the flat-rate plan instead of pay-per-token billing.
7. **Accounts.** Create a GitHub account at github.com, then a Vercel account at vercel.com choosing "Continue with GitHub" (linking them now enables one-click deploys later).

**0.2 Create the project folder.** In PowerShell:

```
mkdir $HOME\ghostline
cd $HOME\ghostline
git init
code .
```

Line by line: make a folder named ghostline in your user directory, move into it, tell Git to start tracking it (this creates the repository), and open it in VS Code. From now on, everything happens inside VS Code: prompts go in the Claude panel (spark icon), commands go in the built-in terminal (Ctrl+`).

**0.3 First prompt: scaffold the project.** "Scaffold" means create the empty skeleton: folders and starter files, no real logic. In the Claude Code panel, press Shift+Tab until the mode indicator says Plan Mode, then paste:

```
We are building "Ghostline", an F1 qualifying telemetry analysis web app. This is a monorepo with a Python data pipeline and a Vite + React frontend, deployed to Vercel as a static site plus one serverless function later.

Before writing anything, create a plan. Set up the following empty structure and starter files only. Do NOT implement logic yet:

ghostline/
  pipeline/   (Python 3.11, package "ghostline", requirements.txt with fastf1, pandas, numpy, scipy, scikit-learn; a build_session.py entrypoint stub; cache/ folder)
  web/        (Vite + React app, JavaScript not TypeScript, with a public/sessions/ folder)
  api/        (empty for now, for a future Vercel serverless function)
  vercel.json (static build of web/ plus api/ functions)
  .gitignore  (node_modules, dist, __pycache__, pipeline/cache, .env, .vercel)
  README.md   (one-paragraph project description)

Constraints: keep it minimal, no extra dependencies, no boilerplate components beyond a default App. Use the simplest possible approach. After you show the plan, wait for my approval before creating files.
```

- Mode: Plan Mode. Claude will print a numbered plan instead of touching files. Read it. If something looks wrong you can edit the plan directly (Ctrl+G) or just reply with corrections. When satisfied, approve it (the panel shows an approve action) and Claude switches to executing.
- Expected result: the folder tree appears in VS Code's file explorer; `web/` contains a runnable starter site; `pipeline/requirements.txt` lists the five libraries.
- Verify, part 1 (the website skeleton): in the VS Code terminal run `cd web`, then `npm install` (downloads the JavaScript libraries; takes a minute, creates a node_modules folder), then `npm run dev`. It prints a local address like `http://localhost:5173`. Ctrl+click it; a starter page should open in your browser. Press Ctrl+C in the terminal to stop the dev server.
- Verify, part 2 (the Python side): run `cd ..\pipeline`, then `python -m venv venv` (creates the virtual environment folder), then activate it with `.\venv\Scripts\Activate.ps1`. If PowerShell refuses with a "running scripts is disabled" error, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`, answer Y, and try activating again (one-time fix). You will see `(venv)` appear at the start of the terminal line; that is how you know it is active. Then run `pip install -r requirements.txt` and let it finish without red errors.
- If it fails: copy the entire error from the terminal and paste it to Claude with "this failed, here is the exact error". If the scaffold itself came out wrong, press Escape twice and rewind to before the changes, or type `/clear` and start the step over with a corrected prompt.

**0.4 Create CLAUDE.md.** Two pastes. First paste this prompt:

```
Create a CLAUDE.md in the repo root with exactly the content I paste next, then confirm it is saved.
```

Then paste this entire block as your next message (this is the rulebook Claude reads at the start of every future session; notice it encodes the accuracy rules, the simplicity rule, and the commands so you never have to repeat them):

```markdown
# Ghostline - Project Memory

## What this is
Browser-based F1 qualifying telemetry analysis. A Python pipeline (FastF1) precomputes one compact JSON per qualifying session. A Vite + React frontend loads those static JSONs and renders interactive visualizations. Deployed to Vercel (static site + one serverless function for an AI debrief).

## Golden rules
- Use the simplest approach that meets the spec. Do not add abstractions, helpers, or dependencies I did not ask for.
- One feature per session. Implement only what the current prompt asks.
- After any change, tell me the exact command to verify it and what correct output looks like.
- Never invent F1 numbers. The AI debrief narrates only precomputed values passed to it.
- Commit working states with clear messages when I ask. Do not add Co-Authored-By lines.

## Architecture
- pipeline/  Python 3.11. Package `ghostline`. Entry: build_session.py. FastF1 cache in pipeline/cache (gitignored).
- web/        Vite + React (JavaScript). Static. Reads JSON from web/public/sessions/.
- api/        Vercel serverless functions (Node). Only debrief.js. Holds ANTHROPIC_API_KEY server-side.
- Data flow: pipeline writes sessions/<year>_<gp>_<session>.json, copied into web/public/sessions/.

## Data format (JSON)
Compact columnar per driver: each channel is an array. Round positions to 0.1m, speed to 1 km/h, g-forces to 0.01, time to 0.001s. Common distance grid every 5m.

## FastF1 accuracy constraints (IMPORTANT)
- Position data is ~4-5 Hz, interpolated and jittery. Do NOT differentiate/integrate raw interpolated data carelessly.
- Compute curvature and g-forces on raw single-lap data, smoothing X/Y with scipy savgol_filter BEFORE differentiating, THEN resample onto the 5m grid.
- Lateral g = (speed_ms)^2 * curvature / 9.81 is reliable. Longitudinal g = d(speed_ms)/dt / 9.81 is approximate. Label it as such.
- X/Y from FastF1 are in 1/10 m (divide by 10 for meters).
- 2018+ only. No DRS/ERS/active-aero in the public 2026 feed.

## Tech choices (do not change without asking)
- Replay animation: HTML canvas (not SVG) for 20 cars at 60fps.
- Charts: Recharts.
- Python: fastf1, pandas, numpy, scipy, scikit-learn.

## Commands
- Build a session: `python pipeline/build_session.py --year 2024 --gp "Bahrain" --session Q`
- Run frontend: `cd web && npm run dev`
- Build frontend: `cd web && npm run build`
```

- Verify: open CLAUDE.md from the file explorer and confirm it matches what you pasted.
- About that "Co-Authored-By" rule: by default Claude Code credits itself inside every Git commit message. Harmless, but it clutters the history, so the rulebook turns it off.

**0.5 First commit.** Paste:

```
Commit everything so far with a descriptive message. Use git. Do not add a Co-Authored-By line.
```

- Verify: run `git log --oneline` in the terminal; you should see one line, your first snapshot.
- Optional but recommended, putting it on GitHub now: on github.com click New repository, name it `ghostline`, leave it empty (no README, you already have one), create it. GitHub then shows you two commands under "push an existing repository", looking like `git remote add origin https://github.com/YOURNAME/ghostline.git` and `git push -u origin main`. Run both in your terminal. Refresh the GitHub page and your code is there. From now on, asking Claude to "commit and push" keeps the online copy current.

### Phase 1: The Python pipeline (MVP)

Goal of this phase: a command that takes a year and a Grand Prix name and produces one JSON file containing every driver's fastest qualifying lap, resampled and with time deltas computed. Type `/clear` in the Claude panel before starting (fresh memory, and CLAUDE.md gets re-read automatically).

**1.1 Session loading.** Switch to Plan Mode and paste:

```
Implement pipeline/ghostline/load.py. It must:
- Enable the FastF1 cache at pipeline/cache (create the folder if missing).
- Provide load_quali_session(year, gp, session='Q') that returns a loaded FastF1 session.
- Provide get_fastest_laps(session) returning a dict of driver_code -> fastest Lap for every driver who set a valid lap, sorted by lap time (pole first).
Reference the FastF1 3.8 API: fastf1.Cache.enable_cache, fastf1.get_session, session.load(), session.laps.pick_drivers(code).pick_fastest(). Handle drivers with no valid lap by skipping them. Keep it simple. Then tell me how to test it in a Python REPL.
```

- Expected: a new `load.py` with the two functions.
- Verify: in the terminal, with `(venv)` showing and from inside the pipeline folder, run this one-liner (the `python -c "..."` form runs a single line of Python without opening a file):

```
python -c "from ghostline.load import load_quali_session,get_fastest_laps; s=load_quali_session(2024,'Bahrain','Q'); print(list(get_fastest_laps(s).keys()))"
```

  Correct output: a list of about 20 three-letter driver codes with the pole sitter first; for 2024 Bahrain that is VER. The first run downloads a few hundred MB into pipeline/cache and can take several minutes; every later run is fast because of the cache.
- If it fails: paste the full traceback (the multi-line error Python prints) to Claude. Common causes: the cache folder path is wrong, or you picked a session too recent to have complete data. Stick with completed 2024 sessions while building.

**1.2 Resampling onto the common grid.** Paste (normal mode is fine, this step is mechanical):

```
Implement pipeline/ghostline/resample.py with resample_lap(lap, step_m=5.0). It must:
- Get raw car data via lap.get_car_data().add_distance() and position via lap.get_pos_data().
- Build a common distance grid from 0 to lap total distance every step_m meters.
- Interpolate Speed, Throttle, Brake, nGear, X, Y, and Time onto that grid (convert X,Y to meters by dividing by 10).
- Return a dict of numpy arrays keyed by channel plus 'distance'.
Use linear interpolation for continuous channels and nearest for nGear/Brake. Do this per single lap only. Then tell me how to verify the output length and ranges.
```

What this does in plain terms: every driver's lap gets converted to the same ruler, one data point every 5 meters of track, so laps can be compared point for point.

- Verify: Claude will give you a REPL snippet; run it. Correct output: every array has the same length (track length divided by 5, so roughly 1,000 for Bahrain) and values are sane (speed between 0 and 360, throttle between 0 and 100).

**1.3 Time delta to pole.** Paste:

```
Implement pipeline/ghostline/delta.py with cumulative_delta(target_grid, pole_grid) that returns, for a driver resampled onto the common 5m grid, the cumulative time delta to pole at each distance point. Compute it by integrating the difference in (1/speed) over distance between the two laps on the shared grid (convert km/h to m/s). Positive = slower than pole. Do NOT use the deprecated fastf1.utils.delta_time. Tell me how to sanity-check the final delta against the lap time gap.
```

Why the prompt forbids that one function: FastF1 ships a ready-made delta helper, but its own documentation marks it deprecated and warns it tends to give inaccurate results, so we compute it properly ourselves.

- Verify: the sanity check is that the delta at the finish line should nearly equal the official lap-time gap between the two drivers (within a few hundredths of a second). Claude gives you the snippet; confirm the two numbers printed are close.

**1.4 JSON export and the command-line tool.** Paste:

```
Implement pipeline/ghostline/export.py and wire up pipeline/build_session.py as a CLI.
- build_session.py takes --year, --gp, --session (default Q), --out (default web/public/sessions).
- It loads the session, gets fastest laps, resamples each onto a 5m grid, computes cumulative delta to pole for each, and writes ONE compact JSON: web/public/sessions/<year>_<gp_slug>_<session>.json.
- JSON shape: { meta:{year,gp,session,track_length,pole_driver,pole_time}, drivers:{ CODE:{ lap_time, channels:{distance:[],x:[],y:[],speed:[],throttle:[],brake:[],gear:[],time:[],delta:[]} } } }.
- Round: x,y,distance to 0.1; speed to 1; throttle to 0; gear int; brake 0/1; time and delta to 0.001.
Print the output file path and its size in KB when done.
```

(The `--year` style options are called flags: settings you pass to a command-line tool. A "slug" is just the name converted to a safe lowercase filename, bahrain instead of Bahrain.)

- Verify: run `python pipeline\build_session.py --year 2024 --gp "Bahrain" --session Q` from the repo root (with venv active). Correct result: it prints a path, and the file `web/public/sessions/2024_bahrain_Q.json` exists at roughly 1 to 1.5 MB. Open it in VS Code and eyeball the structure against the shape in the prompt.
- If the file is over 3 MB: the rounding did not get applied. Tell Claude exactly that: "the JSON is too large, the rounding isn't applied, fix the rounding and re-run."

**1.5 Commit.** Paste:

```
Commit the working pipeline with message "Add MVP pipeline: load, resample, delta, JSON export".
```

### Phase 2: The ghost replay (MVP, the hardest frontend piece)

`/clear` first. For this phase keep the dev server running in the terminal (`cd web`, `npm run dev`) and keep the browser tab open; Vite reloads the page automatically every time Claude saves a file, so you watch progress live.

**2.1 Load the data into the app.** Paste:

```
In web/src, create lib/loadSession.js that fetches /sessions/2024_bahrain_Q.json and returns the parsed object. In App.jsx, load it on mount, show a loading state, and render a simple list of drivers with their lap times (pole first) to confirm the data loads. Keep styling minimal. Tell me how to verify in the browser.
```

- Verify: the browser tab now shows a plain list of drivers and lap times instead of the starter page. This proves the pipeline-to-browser handoff works before any graphics exist.

**2.2 Draw the track.** Paste:

```
Create web/src/components/TrackMap.jsx that draws the track centerline on an HTML canvas using the pole driver's x/y channel arrays. Auto-scale and center the path to fit the canvas with padding, preserving aspect ratio. Draw it as a thin gray line. Render TrackMap in App. This is the static base layer for the replay. Use canvas 2D, not SVG. Tell me what I should see.
```

- Verify: the browser shows the Bahrain track outline. Compare its shape against a real circuit map. If it is the right shape but rotated, that is cosmetic; either note it and move on, or ask Claude to add an optional rotation (the data includes the official map rotation angle).

**2.3 The animated 20-car replay.** This is the hardest single step in the project, so it gets the full treatment: Plan Mode on (Shift+Tab) and extended thinking on (Alt+T). Paste:

```
Plan, then implement, the full-field ghost replay on the canvas track map.
Requirements:
- Animate all drivers' cars simultaneously as dots on the track, positioned by interpolating their x/y by elapsed lap time t (each lap starts at t=0).
- Use requestAnimationFrame, target 60fps, single canvas, redraw each frame. Position each car by finding its x/y at the current playback time via interpolation of the time/x/y arrays.
- Controls: play/pause, scrub slider (0 to max lap time), and speed control (0.25x, 0.5x, 1x, 2x).
- A "gap tower" panel listing drivers ordered by current cumulative delta to pole at the current playback distance, updating live.
- Click a car (or its tower row) to highlight it (larger dot, others dimmed).
Keep state in React but do per-frame drawing imperatively on the canvas. Use the simplest approach that hits 60fps. After the plan, wait for approval.
```

(requestAnimationFrame is the browser's built-in "call my drawing code before every screen repaint" hook, the standard way to animate at 60 frames per second.)

- Mode: Plan Mode plus extended thinking. Read the plan carefully before approving; this is where reviewing pays off most.
- Expected: dots appear on the track, a controls bar, and a gap tower panel.
- Verify in the browser: press play. All 20 dots lap the circuit smoothly, the tower reorders itself live as gaps grow, the scrubber drags playback around, speeds work, clicking highlights one car. Watch for stutter or cars teleporting between points.
- If it misbehaves, use these pre-written fix prompts. For jumping cars: "cars jump between points, interpolate x/y linearly between grid samples instead of snapping". For stutter: "it re-renders React every frame, move the draw loop into a single useEffect with requestAnimationFrame and refs" (that sentence tells Claude to keep the animation outside React's update cycle, a standard fix it will understand).

**2.4 Let Claude see the app (recommended).** Install the Playwright MCP plug-in so Claude can open a browser itself and inspect its own work. In the VS Code terminal run:

```
claude mcp add playwright npx "@playwright/mcp@latest"
```

On Windows, if that errors, the known fix is wrapping the command: `claude mcp add playwright cmd /c npx "@playwright/mcp@latest"`. Then paste this prompt:

```
Use the playwright MCP to open http://localhost:5173, take a screenshot, and tell me whether the track map renders and whether the cars are visible. Report any console errors.
```

- Verify: Claude reports what it saw and any errors from the browser's console (the browser's hidden error log). From now on it can self-check visual work.

**2.5 Commit.** Paste:

```
Commit with message "Add ghost replay: canvas track map, animation, controls, gap tower".
```

### Phase 3: The pairwise deep-dive (completes the MVP)

`/clear` first.

**3.1 The module.** Plan Mode, paste:

```
Add a Pairwise module as a new view/tab. Let the user pick any two drivers from dropdowns. Then render, all aligned by distance:
- A time-delta vs distance curve (driver B minus driver A), zero line marked.
- Speed, throttle, brake, and gear traces overlaid for both drivers (use Recharts, one chart per channel, shared x-axis = distance).
- A track map (canvas) colored by segment: green where A is gaining on B, red where losing, based on the local slope of the delta curve.
- A corner-by-corner table: for each corner (use the corner distances if available, else evenly spaced segments), show min speed and time gained/lost for each driver.
Use the already-loaded session JSON; do not refetch. Keep charts simple and labeled with units. Plan first.
```

- Verify: pick two drivers from the dropdowns; the delta curve, four trace charts, the colored track map, and the corner table all render, and everything updates when you change the selection.
- If the corner table complains about missing corner data: the pipeline JSON does not yet include official corner positions. Tell Claude: "add corner distances to the pipeline JSON using session.get_circuit_info().corners and re-run build_session", then re-run the build command from step 1.4 yourself.

**3.2 Commit.** Paste:

```
Commit with message "Add pairwise deep-dive module".
```

**The MVP is now done.** Strongly recommended: jump ahead to step 8.1 right now and deploy it. Having a live URL after week two or three is a huge motivator, and every later push updates it automatically. Then come back here for V1.

### Phase 4: Vehicle dynamics layer (V1)

`/clear` first. This phase adds the physics: g-forces and the friction circle.

**4.1 Pipeline dynamics.** Plan Mode, paste:

```
Add pipeline/ghostline/dynamics.py and integrate it into build_session.py so each driver's channels gain: curvature, lat_g, long_g.
Method (follow FastF1 accuracy rules in CLAUDE.md):
- Work on the raw single-lap car+pos data BEFORE resampling.
- Convert X,Y to meters (divide by 10). Smooth X and Y with scipy.signal.savgol_filter (window 21, polyorder 3, expose as params).
- Curvature kappa = (x'*y'' - y'*x'') / (x'^2 + y'^2)^1.5 using np.gradient against distance.
- lat_g = (speed_ms^2 * kappa) / 9.81.
- long_g = gradient(speed_ms, time_s) / 9.81, smoothed afterward.
- Then resample curvature, lat_g, long_g onto the common 5m grid and add to the JSON (rounded to 0.01).
Add a meta.caveats field describing that long_g is approximate and position data is ~4-5Hz interpolated. Tell me how to sanity-check that peak lat_g is in the 4-6g range.
```

- Verify: re-run the build command from step 1.4. The JSON now contains curvature, lat_g, and long_g arrays per driver. The sanity check: peak lateral g in fast corners should land around 4 to 6, which matches real F1 figures. This is exactly why you learned what lateral g means: you can now tell physically plausible output from broken output at a glance.
- If peak lateral g is absurd (say 50): the units are wrong somewhere. Tell Claude: "peak lat_g is 50+, which is impossible; check the X/Y meter conversion and the smoothing window in dynamics.py against the FastF1 accuracy rules in CLAUDE.md."

**4.2 The g-g diagram view.** Paste:

```
Add a Vehicle Dynamics view. For a selected driver render:
- A g-g diagram (friction circle): scatter of long_g (y) vs lat_g (x) across the lap, using Recharts scatter, with reference circle gridlines at 1/2/3/4/5 g.
- A grip-utilization track map (canvas) colored by total combined g (sqrt(lat_g^2+long_g^2)).
- A braking-signature note: list the heaviest braking points (most negative long_g) with their distance and corner.
Add a visible disclaimer: "Longitudinal g is approximate; position data is ~4-5Hz interpolated." Plan first.
```

(A g-g diagram plots cornering force against braking/acceleration force for every moment of the lap. A driver using all the available grip traces out the edge of a circle, which is why it is also called the friction circle. It is a standard vehicle dynamics tool, and having it in a portfolio project is exactly the mechanical engineering signature this project is built around.)

- Verify: the scatter forms a rough circular cloud, the track map glows hottest in the fast corners, and the disclaimer is visible on screen.

**4.3 Commit.** Paste:

```
Commit with message "Add vehicle dynamics layer: g-g diagram, grip map"
```

### Phase 5: Mini-sector dominance map (V1)

`/clear` first.

**5.1 The module.** Plan Mode, paste:

```
Add a Mini-Sector Dominance view.
Pipeline: in dynamics or a new features.py, auto-detect corners from curvature peaks, then slice the lap into 25-40 micro-segments along distance. For each segment, compute each driver's time spent in it.
Frontend: color the track map (canvas) by which driver of the full field is fastest in each micro-segment (use team colors from the JSON if present, else a palette). Add a "composite ideal lap" summary: sum of the fastest segment times across the field, vs the actual pole time.
Add corner detection params to build_session. Plan first, then implement pipeline changes, re-run build, then frontend.
```

- Verify: re-run the build, then check the browser. The track map becomes a patchwork of driver colors, one per micro-segment. The composite ideal lap time shown should be slightly faster than the actual pole time (it is a stitched-together theoretical best, so it must be faster, and if it is slower something is wrong). Confirm the segment count lands between 25 and 40.

**5.2 Commit.** Paste:

```
Commit with message "Add mini-sector dominance map and composite ideal lap"
```

### Phase 6: Driving style fingerprints (V2)

`/clear` first. This is the light machine learning module.

**6.1 The module.** Plan Mode, paste:

```
Add a Driving Style view using scikit-learn in the pipeline.
Pipeline: in features.py, extract per-corner features for each driver (min speed, braking point distance, throttle-application point, exit speed, trail-braking measure). Aggregate into a per-driver feature vector. Run StandardScaler + PCA to 2D, and KMeans clustering. Add to the JSON a "style" block: per-driver 2D coordinates, cluster label, and the raw radar features.
Frontend: render a 2D scatter placing each driver in style space (colored by cluster) and a radar chart (Recharts) for a selected driver's normalized corner features.
Classify each corner as V-style vs U-style from the speed profile shape and include that in the corner table. Plan first.
```

(Translation of the machine learning words: StandardScaler puts all features on the same scale so no single one dominates; PCA squashes the many per-driver numbers down to 2 so drivers can be plotted on a flat map; KMeans groups nearby drivers into clusters automatically. A radar chart is the spider-web chart showing one driver's profile across several traits.)

- Verify: re-run the build; the JSON gains a style block. In the browser, the 2D scatter should be sensible: teammates driving the same car usually land near each other, which is your built-in sanity check. The radar chart renders for any selected driver.

**6.2 Commit.** Paste:

```
Commit with message "Add driving style fingerprints: PCA, clustering, radar"
```

### Phase 7: The AI race engineer debrief (V2)

`/clear` first. Two parts: first a non-AI rules engine that computes specific findings, then a tiny backend function that has Claude narrate those findings (and only those findings).

**7.1 Rule-based findings first.** Paste:

```
In the pipeline, add features.py logic to generate a list of plain-English rule-based findings per session, e.g. "NOR gains 0.14s into Turn 8 by braking 12m later than pole." Derive these ONLY from computed quantities (delta slope at corners, braking-point distance differences, min-speed differences). Write them into the JSON as meta.findings (array of strings with the numbers already filled in). Tell me how to verify the findings match the data.
```

- Verify: open the rebuilt JSON, read the findings array, and cross-check two or three of them against the pairwise charts. The numbers must match. This matters because these strings are the only raw material the AI is ever given.

**7.2 The serverless function.** First, get an API key: go to console.anthropic.com (this is Anthropic's developer site, a separate account from your Claude Pro subscription), add a few dollars of credit, and create an API key (a long string starting with sk-). Treat it like a password. Then, in VS Code, create a new file named exactly `.env` in the repo root containing one line:

```
ANTHROPIC_API_KEY=sk-paste-your-actual-key-here
```

Your .gitignore from Phase 0 already prevents this file from ever being committed. Now switch to Plan Mode and paste:

```
Create api/debrief.js as a Vercel Node serverless function and wire vercel.json to serve it at /api/debrief.
- It accepts POST with a JSON body containing the precomputed findings array and session meta for a chosen driver/comparison.
- It calls the Anthropic API (model claude-haiku-4-5-20251001) using process.env.ANTHROPIC_API_KEY, with a strict system prompt: "You are an F1 race engineer. Narrate ONLY the numbers and findings provided. Never invent or estimate any number not present in the input. Be concise."
- It returns the narrated text.
- Add a "Generate debrief" button in the AI Debrief view that POSTs the current findings and shows the response.
- Never expose the API key to the client. Add ANTHROPIC_API_KEY to a .gitignore'd .env for local and document that it must be set in Vercel project settings.
Plan first.
```

- Verify locally: serverless functions do not run under `npm run dev`, so test with Vercel's local simulator instead: install the Vercel CLI if you have not yet (`npm i -g vercel`, the -g means install globally so the command works anywhere), run `vercel dev` from the repo root, open the local address it prints, click Generate debrief, and read the output. Confirm every number in the narration appears in the findings array. If the AI ever states a number that is not in the findings, that is a failure of the core integrity rule; tell Claude to tighten the system prompt inside debrief.js.
- Security check: the key must exist only in `.env` and inside `api/debrief.js` via process.env. If you ever see it referenced anywhere under `web/src`, stop and tell Claude: "the key must only be read server-side in api/debrief.js, never imported into web/src." (Technical background: Vite only exposes variables prefixed VITE_ to the browser, so the key must never get that prefix.)

**7.3 Commit.** Paste:

```
Commit with message "Add rule-based findings and AI debrief serverless function"
```

### Phase 8: Deployment, session library, README

**8.1 Deploy to Vercel.** Paste:

```
Prepare this repo for Vercel deployment.
- Confirm vercel.json builds web/ as a static Vite site (output web/dist) and serves api/*.js as Node serverless functions.
- Ensure web/public/sessions/*.json are included in the build.
- Add a .gitignore entry for .vercel.
Then give me the exact step-by-step commands to deploy with the Vercel CLI, including how to set ANTHROPIC_API_KEY as a production environment variable, and how to connect the GitHub repo for auto-deploys on push.
```

Then follow the steps Claude gives you. They will amount to this, explained:

1. `npm i -g vercel` installs the Vercel command-line tool (skip if done in 7.2).
2. `vercel login` opens your browser to log in.
3. `vercel` (just the word, from the repo root) uploads and deploys a preview: a private test copy at a temporary URL. Accept the defaults it asks about. Open the URL it prints and click through the whole app.
4. `vercel --prod` promotes it to the real production URL (something like ghostline.vercel.app). This is your live, shareable link.
5. Only needed once you have the V2 debrief: `vercel env add ANTHROPIC_API_KEY production`, paste your key when asked (this stores it on Vercel's servers, where the serverless function reads it), then `vercel --prod` again so the deployment picks it up.
6. In the Vercel website dashboard, open the project, go to Settings, then Git, and connect your GitHub repository. From then on every `git push` automatically rebuilds and updates the live site in about 60 to 90 seconds, and you never run deploy commands manually again.

- Verify: the live URL loads on your phone (good test that it is genuinely public), the replay plays, the charts render, and once V2 exists, the debrief button works in production.

**8.2 Multi-session library.** Paste:

```
Add a session picker to the frontend: scan web/public/sessions for available JSON files (generate a sessions/index.json in the pipeline listing them with metadata) and let the user choose which session to load. Update build_session.py to regenerate sessions/index.json each run. Keep it simple.
```

- Verify: build two or three more sessions yourself by re-running the build command with different `--gp` values ("Miami", "Monaco", whatever you want), confirm the picker lists them all, and switching sessions reloads everything correctly.

**8.3 README and final commit.** The README is your project's front page on GitHub, the first thing any professor, recruiter, or YC reviewer sees. Paste:

```
Write a README.md covering: what Ghostline is, the architecture, how to set up the pipeline (venv, requirements, build_session command), how to run the frontend, how to deploy to Vercel, the FastF1 accuracy caveats, and a credit to FastF1 (note it is unofficial and not associated with Formula 1). Then commit everything with message "Add multi-session library, README, deploy config".
```

- Verify: read the README and confirm every command in it actually works, then `git push` and watch Vercel auto-deploy the final version.

---

## Part 4: Debugging prompts (keep these handy)

The universal rule when anything breaks: give Claude the exact error, never a paraphrase. Copy the entire output from the terminal or browser console, including the parts that look like gibberish; the gibberish is usually the diagnosis.

```
The command `python pipeline/build_session.py --year 2024 --gp "Bahrain" --session Q` failed with this exact error:
[paste full traceback]
Diagnose the root cause and fix it. Do not change unrelated code. After fixing, tell me the command to re-run.
```

```
The replay animation stutters and drops below 30fps with all 20 cars. Profile the render loop, identify the bottleneck, and fix it using the simplest change. Explain what was slow.
```

```
The g-g diagram shows lateral g values above 40, which is physically impossible. Check the curvature units and the X/Y meter conversion in dynamics.py against the FastF1 accuracy rules in CLAUDE.md, find the bug, and fix it.
```

Notice the pattern all three share, worth copying for any future bug: state the exact symptom with numbers, point at the likely area, constrain the fix ("do not change unrelated code", "simplest change"), and ask for the verification step back.

---

## Part 5: Vibe coding best practices for a beginner

- **One feature per session.** Finish a phase, then type `/clear` before starting the next. A fresh conversation re-reads CLAUDE.md automatically, so nothing important is lost; only the clutter goes. If you made a decision worth remembering during the session (changed a library, picked a convention), ask Claude to add one line about it to CLAUDE.md before clearing.
- **Always read the plan before approving.** In Plan Mode, the plan is your contract. Press Ctrl+G to edit it directly; fixing the plan is faster and more precise than arguing with the result afterward.
- **Run every verification yourself.** Claude saying "done, it works" is not evidence. The command output on your screen is evidence.
- **Commit every green state.** A commit costs ten seconds and buys you a guaranteed way back. If an experiment goes sideways, you can always return to the last commit (ask Claude: "discard all uncommitted changes and restore the last commit").
- **Read the diffs.** Red lines are being removed, green lines added. You do not need to understand every line; you are checking scope. If you asked for a change to one file and see six files in the diff, stop and ask why. One current limitation: you cannot accept just part of a file's changes, it is all or nothing per checkpoint, which is one more reason to keep each request small.
- **Do not let it run unattended early on.** Watch what it edits for the first few phases. Trust is earned per project.
- **Checkpoints for small undo, Git for real undo.** Escape twice (or `/rewind`) reverses Claude's recent file edits in one click. But if a command had side effects, only a Git commit gets you back. Use both, in that order of preference.
- **Watch the memory gauge.** `/context` shows how full the conversation memory is. Past roughly 70 to 80 percent, type `/compact` (summarizes and frees space) or finish up and `/clear`. Check your plan usage anytime with `/status`.
- **When stuck, hand over the evidence, not a diagnosis.** Paste the full error and let Claude find the cause. Beginners who guess the cause in their prompt often send Claude down the wrong path.

---

## Part 6: Timeline and cost

### Timeline (a capable beginner working evenings and weekends)

| Phase | What you get | Estimated hours |
|---|---|---|
| 0 | Environment, repo, CLAUDE.md | 2-4 |
| 1 | Working data pipeline | 6-10 |
| 2 | Ghost replay (the hardest part) | 10-16 |
| 3 | Pairwise module | 6-10 |
| **MVP total** | **A deployed, demoable app** | **~25-40** |
| 4 | Vehicle dynamics | 8-12 |
| 5 | Mini-sectors | 6-10 |
| **V1 total** | | **~40-60** |
| 6 | Style fingerprints | 6-10 |
| 7 | AI debrief | 6-10 |
| 8 | Deploy polish, library, README | 4-8 |
| **V2 total** | **The full vision, live** | **~55-90** |

At roughly 10 hours per week: about 3 to 5 weeks to a live MVP, 6 to 10 weeks to the complete V2. The estimates assume things go wrong sometimes, because they will; debugging time is included.

### Cost

| Item | Cost | Notes |
|---|---|---|
| Claude Pro | $20/month ($17/month billed annually) | The only real cost. One or two months covers the build at this pace. Upgrade to Max ($100/month) only if you genuinely keep hitting the 5-hour-window limits |
| Vercel | $0 | Hobby tier covers hosting, the CDN, HTTPS, previews, and the one low-traffic serverless function. It has execution-time and build limits, but a static app with one tiny endpoint comes nowhere near them |
| Anthropic API (debrief only) | ~$1-5 total | Haiku 4.5 costs $1 per million input tokens and $5 per million output tokens; each debrief uses a few thousand, so hundreds of test runs cost under a dollar |
| Everything else | $0 | FastF1, Python, Node, VS Code, Git, GitHub are all free |
| **Total to ship V2** | **About $20-40 plus pocket change** | |

---

## Part 7: Caveats (read before trusting the outputs)

- **The data's accuracy is the project's main technical risk.** Per FastF1's accuracy documentation: position updates arrive only about 4 to 5 times per second and are jittery, results computed by integration are inherently error-prone at this sample rate, and overlapping two different laps carries around plus or minus 10 meters of position uncertainty. Lateral g comes out realistic; longitudinal g is, per the maintainer himself, generally unreliable to compute from this data. The plan handles all of this (smoothing, raw-data-first ordering, anchoring timing math to the trustworthy channels, on-screen disclaimers), but you should understand it so you present the project honestly. Honest limitations stated clearly read as engineering maturity; hidden ones read as sloppiness.
- **2026 data gaps.** The new active aerodynamics and energy deployment data are not in the public feed, and DRS no longer exists under 2026 rules. Build and test against completed 2024-2025 sessions, and have the pipeline skip missing channels gracefully.
- **Anthropic pricing and limits move frequently.** Anthropic no longer publishes fixed prompts-per-window numbers and ships changes often. The figures here reflect mid-2026 reporting; reconfirm on the official pages before purchase: https://support.claude.com for plans and https://docs.claude.com/en/docs/claude-code/overview for Claude Code itself.
- **The API key billing trap.** If an ANTHROPIC_API_KEY ends up set in your Windows environment variables (not just the project .env), Claude Code may bill your coding sessions per-token via the API instead of using your flat-rate subscription. Keep the key in the project .env and Vercel settings only, and sign in to Claude Code with your Pro account.
- **Canvas and accessibility.** Canvas graphics are invisible to screen readers. If accessibility ever matters for a submission, add a data-table fallback for the key views; it is a one-prompt addition.
- **The AI debrief must stay on a leash.** The serverless function's entire integrity rests on the rule that it narrates only precomputed findings. During development, actually read its outputs and confirm it never states a number that is not in the input. That discipline is the difference between "AI feature" and "AI gimmick" when you explain this project to a technical audience.
