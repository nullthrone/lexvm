/**
 * A synthetic pack of realistic size for performance tests: 12 rooms, 30
 * objects, 40 flags, a chain of locked doors and levers, an npc trade with
 * interrogation topics, clue combination, flavour flags and a bounded clock.
 */
const ROOMS = 12;
/** East exits that are closed by a locked door, and the room holding each door's key. */
const DOORS: Record<number, { keyRoom: number }> = { 2: { keyRoom: 1 }, 5: { keyRoom: 4 }, 8: { keyRoom: 7 } };
const LEVER_ROOMS = [0, 3, 4, 6, 9, 10];
const PAINTING_ROOMS = [0, 2, 5, 7, 9, 11];

/** The pack as authors write it, including a walkthrough. */
export function syntheticPack(): Record<string, unknown> {
  const rooms: Record<string, unknown> = {};
  const objects: Record<string, unknown> = {};
  const flags: Record<string, boolean> = {};
  const rules: unknown[] = [];
  const walkthrough: string[] = [];

  for (let i = 0; i < ROOMS; i++) {
    const exits: Record<string, unknown> = {};
    if (i < ROOMS - 1) {
      const door = DOORS[i] ? `door_${i}` : undefined;
      exits.east = door ? { to: `r${i + 1}`, door, blocked: "The door is shut." } : { to: `r${i + 1}` };
    }
    if (i > 0) {
      const door = DOORS[i - 1] ? `door_${i - 1}` : undefined;
      exits.west = door ? { to: `r${i - 1}`, door, blocked: "The door is shut." } : { to: `r${i - 1}` };
    }
    const mentions = [
      ...(DOORS[i] ? [`{door_${i}}`] : []),
      ...(DOORS[i - 1] ? [`{door_${i - 1}}`] : []),
      ...(LEVER_ROOMS.includes(i) ? [`{lever_${i}}`] : []),
      ...(PAINTING_ROOMS.includes(i) ? [`{painting_${i}}`] : []),
    ];
    rooms[`r${i}`] = {
      name: `Room ${i}`,
      description: `Room number ${i}.${mentions.length > 0 ? ` You notice ${mentions.join(", ")}.` : ""}`,
      exits,
    };
    // An entry flag per room, set once (correlated with progress, like real "first visit" flags).
    flags[`entered_${i}`] = false;
    rules.push({ id: `enter_${i}`, on: { event: "enter", room: `r${i}` }, once: true, do: { set: `entered_${i}` } });
  }

  // Locked doors and their keys: a chest, a lever that reveals a key, an npc trade.
  for (const [at, { keyRoom }] of Object.entries(DOORS)) {
    objects[`door_${at}`] = {
      name: `door ${at}`,
      location: `r${at}`,
      alsoIn: [`r${Number(at) + 1}`],
      openable: true,
      locked: true,
      unlockedBy: `key_${at}`,
    };
    objects[`key_${at}`] = { name: `key ${at}`, location: `r${keyRoom}`, portable: true };
  }
  objects.chest = { name: "chest", location: "r1", container: true, openable: true };
  (objects.key_2 as Record<string, unknown>).location = "chest";
  (objects.key_5 as Record<string, unknown>).hidden = true;
  (objects.key_8 as Record<string, unknown>).location = "nowhere";

  // Levers: a chain; each pulls only after the previous one.
  LEVER_ROOMS.forEach((room, n) => {
    objects[`lever_${room}`] = { name: `lever ${room}`, location: `r${room}`, verbs: ["pull", "push"] };
    flags[`pulled_${room}`] = false;
    const previous = n > 0 ? { flag: `pulled_${LEVER_ROOMS[n - 1]}` } : undefined;
    rules.push({
      id: `pull_${room}`,
      on: { verb: "pull", object: `lever_${room}` },
      when: [{ not: { flag: `pulled_${room}` } }, ...(previous ? [previous] : [])],
      do: [
        { say: "Clunk." },
        { set: `pulled_${room}` },
        ...(room === 4 ? [{ reveal: "key_5" }] : []),
        { counter: { name: "progress", add: 1 } },
      ],
    });
    // Pushing back resets the lever only while the next one is not pulled (reversible, no dead end).
    const next = LEVER_ROOMS[n + 1];
    rules.push({
      id: `push_${room}`,
      on: { verb: "push", object: `lever_${room}` },
      when: [{ flag: `pulled_${room}` }, ...(next !== undefined ? [{ not: { flag: `pulled_${next}` } }] : [])],
      do: [{ say: "The lever springs back." }, { clear: `pulled_${room}` }, { counter: { name: "progress", add: -1 } }],
    });
  });

  // Paintings: flavour flags read by a dialogue option (so they matter) and by text only (so they do not).
  PAINTING_ROOMS.forEach((room, n) => {
    objects[`painting_${room}`] = {
      name: `painting ${room}`,
      location: `r${room}`,
      description: [{ when: { flag: `studied_${room}` }, text: "You know this one." }, { text: "A dusty painting." }],
    };
    flags[`studied_${room}`] = false;
    rules.push({
      id: `study_${room}`,
      on: { verb: "look", object: `painting_${room}` },
      when: { not: { flag: `studied_${room}` } },
      do: [
        { say: n % 2 === 0 ? "You study the brushwork." : "A signature in the corner." },
        { set: `studied_${room}` },
      ],
    });
  });

  // The warden trades key 8 for the badge.
  objects.badge = { name: "badge", location: "r6", portable: true };
  objects.warden = { name: "warden", location: "r7", npc: true, dialogue: "warden_talk" };
  flags.asked_warden = false;
  flags.bribed = false;
  // Interrogation topics: each asked at most once, in any order (a realistic state multiplier).
  const topics = [1, 2, 3, 4];
  for (const t of topics) flags[`topic_${t}`] = false;

  // Notes, clues and their combination.
  objects.note = { name: "note", location: "r3", portable: true, verbs: ["read"] };
  objects.clue_a = { name: "first fact", location: "nowhere", clue: true, verbs: ["combine"] };
  objects.clue_b = { name: "second fact", location: "nowhere", clue: true, verbs: ["combine"] };
  objects.clue_c = { name: "conclusion", location: "nowhere", clue: true };
  flags.read_note = false;
  flags.combined = false;
  rules.push(
    { id: "read_note", on: { verb: "read", object: "note" }, do: [{ set: "read_note" }, { learn: "clue_a" }] },
    {
      id: "combine_facts",
      on: { verb: "combine", object: "clue_a", with: "clue_b" },
      when: { not: { flag: "combined" } },
      do: [{ set: "combined" }, { learn: "clue_c" }, { score: 1 }],
    },
  );

  // Fillers that make up 30 objects: a lamp, a box with a gem, a mirror, the goal statue.
  objects.lamp = { name: "lamp", location: "r2", portable: true };
  objects.box = { name: "box", location: "r9", container: true, roomText: "A {box} stands open." };
  objects.gem = { name: "gem", location: "box", portable: true };
  objects.mirror = { name: "mirror", location: "r10", verbs: ["push"], roomText: "A {mirror} hangs crooked." };
  // A reversible toggle that a condition reads.
  flags.mirror_turned = false;
  rules.push(
    {
      id: "turn_mirror",
      on: { verb: "push", object: "mirror" },
      when: { not: { flag: "mirror_turned" } },
      do: [{ say: "The mirror swings round." }, { set: "mirror_turned" }],
    },
    {
      id: "turn_mirror_back",
      on: { verb: "push", object: "mirror" },
      do: [{ say: "Back." }, { clear: "mirror_turned" }],
    },
  );
  objects.statue = { name: "statue", location: "r11", verbs: ["push"], roomText: "A {statue} blocks the way." };
  flags.gem_seen = false;
  rules.push(
    { id: "see_gem", on: { verb: "look", object: "gem" }, do: [{ say: "It sparkles." }, { set: "gem_seen" }] },
    {
      id: "push_statue",
      on: { verb: "push", object: "statue" },
      when: [{ has: "clue_c" }, { flag: `pulled_${LEVER_ROOMS[LEVER_ROOMS.length - 1]}` }],
      do: [{ say: "The statue slides aside." }, { score: 1 }, { end: "escaped" }],
    },
  );
  // Six more flavour flags, never read by conditions: they must not multiply the state space.
  for (const name of ["lamp", "mirror", "chest", "box", "note", "badge"]) {
    flags[`noticed_${name}`] = false;
    rules.push({
      id: `notice_${name}`,
      on: { verb: "look", object: name },
      do: [{ say: `Nothing odd about the ${name}.` }, { set: `noticed_${name}` }],
    });
  }

  // A bounded clock driven by turn rules.
  rules.push({
    id: "clock",
    on: { event: "turn" },
    when: { counter: { name: "clock", lt: 3 } },
    do: { counter: { name: "clock", add: 1 } },
  });

  // The solution.
  walkthrough.push("pull lever_0", "go east", "open chest", "take key_2", "go east", "use key_2 door_2");
  walkthrough.push("open door_2", "go east", "take note", "read note", "pull lever_3", "go east");
  walkthrough.push("pull lever_4", "take key_5", "go east", "use key_5 door_5", "open door_5", "go east");
  walkthrough.push("take badge", "pull lever_6", "go east", "talk warden", "choose ask_key", "choose give_badge");
  walkthrough.push("combine clue_a clue_b", "go east", "use key_8 door_8", "open door_8", "go east");
  walkthrough.push("pull lever_9", "go east", "pull lever_10", "go east", "push statue");

  return {
    format: "lexvm-pack/1",
    id: "synthetic",
    version: "1.0.0",
    title: "Synthetic",
    description: "A generated pack for the exploration performance test.",
    language: "en",
    author: "LexVM tests",
    license: "CC0-1.0",
    maxScore: 2,
    start: { room: "r0" },
    verbs: {
      read: { label: "Read", default: "Nothing to read." },
      combine: { label: "Combine", arity: 2, prep: "with", default: "That leads nowhere." },
    },
    rooms,
    objects,
    flags,
    counters: { progress: 0, clock: 0 },
    rules,
    dialogues: {
      warden_talk: {
        with: "warden",
        start: "hello",
        nodes: {
          hello: {
            say: "What do you want?",
            options: [
              { id: "ask_key", text: "The key, please.", goto: "key" },
              ...topics.map((t) => ({
                id: `topic_${t}`,
                text: `About rumour ${t}…`,
                when: { not: { flag: `topic_${t}` } },
                do: { set: `topic_${t}` },
                goto: "hello",
              })),
              { id: "bye", text: "Nothing." },
            ],
          },
          key: {
            say: "What's in it for me?",
            do: { set: "asked_warden" },
            options: [
              {
                id: "give_badge",
                text: "This badge.",
                when: { has: "badge" },
                once: true,
                do: [
                  { move: { object: "badge", to: "nowhere" } },
                  { move: { object: "key_8", to: "inventory" } },
                  { set: "bribed" },
                  { learn: "clue_b" },
                ],
              },
              { id: "later", text: "Never mind.", goto: "hello" },
            ],
          },
        },
      },
    },
    endings: { escaped: { title: "Out", text: "You are out.", win: true } },
    hints: [{ id: "levers", until: { flag: "pulled_10" }, steps: ["Pull every lever, in order."] }],
    walkthrough,
  };
}
