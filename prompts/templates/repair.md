<!-- template: repair round. Output: only the changed files, each complete. Placeholders: CONCEPT STORY PUZZLES FILES DIAGNOSTICS. -->
# Repair

`lexvm check` reported problems with the pack below. Fix them.

- Fix **every error**. Fix warnings too where that is easy and does not risk new errors.
- Read each message carefully: it says where the problem is (`path`, file and line when known) and usually how to fix it. Find the root cause — a rejected walkthrough step often means an earlier step is missing, a door is still closed, or a dialogue is still open.
- If a diagnostic reveals a design problem (a dead end, an unwinnable state, an unreachable room), change the design, keeping the puzzle dependency chart branching and the game fair.
- `playtime.too-short` / `playtime.too-long` mean the estimated play time misses the target length. Add or trim content as the message suggests (puzzles, walkthrough steps, optional descriptions and dialogue), keep `playtime` as it is, and keep the walkthrough, hints and `maxScore` consistent with the change.
- `playtime.pacing` means the reading share misses the pacing: write out thin scenes (arrivals, turning points, what a clue means, transitions) or cut commands that tell nothing, as the message says. Never pad with adjectives.
- When you shorten text, cut repetition and padding, not the story: keep motives, transitions and the reactions at turning points.
- Keep everything that works. Do not rename ids unless a diagnostic requires it; if you do, update every reference, including the walkthrough and the hints.
- Return **only the files you changed**, each one **complete**, in fenced blocks named with `file=` as usual. Then add at most one line per fix.

# Diagnostics

{{DIAGNOSTICS}}

# Current files

{{FILES}}

# Design notes (for reference)

{{CONCEPT}}

{{STORY}}

{{PUZZLES}}
