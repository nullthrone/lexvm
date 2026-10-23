/**
 * Checks on game logic: rules, flags, counters, endings, score, hints,
 * room reachability and dialogue structure.
 */
import { type PackIndex, walkPack } from "./analyze-walk.ts";
import type { DiagnosticList } from "./diagnostics.ts";
import type { CommandTrigger, Condition, Conditions, Effects, Id, Rule } from "./schema.ts";

function ruleName(rule: Rule, index: number): string {
  return rule.id === undefined ? `rules[${index}]` : `rule "${rule.id}" (rules[${index}])`;
}

function isCommandTrigger(on: Rule["on"]): on is CommandTrigger {
  return "verb" in on;
}

/** True when every command matching `b` also matches `a`. */
function triggerCovers(a: CommandTrigger, b: CommandTrigger): boolean {
  return (
    a.verb === b.verb &&
    (a.object === undefined || a.object === b.object) &&
    (a.with === undefined || a.with === b.with)
  );
}

export function checkRules(ix: PackIndex, out: DiagnosticList): void {
  const { rules } = ix.pack;
  const ids = new Map<Id, number>();
  rules.forEach((rule, i) => {
    if (rule.once && rule.id === undefined) {
      out.error(
        "rule.once-without-id",
        `rules[${i}].once`,
        `${ruleName(rule, i)} has once: true but no id. Add a unique id; the engine records fired once-rules by id.`,
      );
    }
    if (rule.id !== undefined) {
      const first = ids.get(rule.id);
      if (first !== undefined) {
        out.error(
          "rule.duplicate-id",
          `rules[${i}].id`,
          `Rule id "${rule.id}" is already used by rules[${first}]. Rule ids must be unique.`,
        );
      } else ids.set(rule.id, i);
    }
  });

  // Only command rules shadow each other: of all event rules that match, every one fires.
  rules.forEach((rule, j) => {
    if (!isCommandTrigger(rule.on)) return;
    for (let i = 0; i < j; i++) {
      const earlier = rules[i]!;
      if (!isCommandTrigger(earlier.on) || earlier.once || (earlier.when?.length ?? 0) > 0) continue;
      if (!triggerCovers(earlier.on, rule.on)) continue;
      out.warning(
        "rule.shadowed",
        `rules[${j}].on`,
        `${ruleName(rule, j)} can never fire: the earlier ${ruleName(earlier, i)} has the same or a more general trigger, no 'when' and is not 'once', so it always fires first. Move the specific rule before the general one, or give the general one a 'when'.`,
      );
      break;
    }
  });
}

export function checkFlagsAndCounters(ix: PackIndex, out: DiagnosticList): void {
  const { pack } = ix;
  const flagRead = new Set<Id>();
  const flagSet = new Set<Id>();
  const counterRead = new Set<Id>();
  const counterChanged = new Set<Id>();
  walkPack(pack, {
    condition(c) {
      if ("flag" in c) flagRead.add(c.flag);
      else if ("counter" in c) counterRead.add(c.counter.name);
    },
    effect(e) {
      if ("set" in e) flagSet.add(e.set);
      else if ("counter" in e) counterChanged.add(e.counter.name);
    },
  });
  for (const [flag, initial] of Object.entries(pack.flags)) {
    if (!flagRead.has(flag)) {
      out.warning(
        "flag.never-read",
        `flags.${flag}`,
        `Flag "${flag}" is never read by any condition, so it has no effect (and enlarges the state space). Use it in a when/until/visibleWhen, or remove it and its set/clear effects.`,
      );
    } else if (!initial && !flagSet.has(flag)) {
      out.warning(
        "flag.never-set",
        `flags.${flag}`,
        `Flag "${flag}" starts false and no effect sets it, so every condition on it is constant. Add { set: ${flag} } where it should become true, or remove the flag.`,
      );
    }
  }
  for (const counter of Object.keys(pack.counters)) {
    if (!counterRead.has(counter)) {
      out.warning(
        "counter.never-read",
        `counters.${counter}`,
        `Counter "${counter}" is never tested by any condition. Use it in a counter condition, or remove it and its effects.`,
      );
    } else if (!counterChanged.has(counter)) {
      out.warning(
        "counter.never-changed",
        `counters.${counter}`,
        `Counter "${counter}" is never changed by any effect, so every condition on it is constant. Add a counter effect or remove it.`,
      );
    }
  }
  checkCounterBounds(ix, out);
}

// ---------------------------------------------------------------------------
// Counter bounds: a counter that can grow forever makes the state space infinite.
// ---------------------------------------------------------------------------

type Bounds = Map<Id, { upper: boolean; lower: boolean }>;

function union(a: Bounds, b: Bounds): Bounds {
  const out: Bounds = new Map(a);
  for (const [k, v] of b) {
    const prev = out.get(k);
    out.set(k, { upper: v.upper || (prev?.upper ?? false), lower: v.lower || (prev?.lower ?? false) });
  }
  return out;
}

function intersection(a: Bounds, b: Bounds): Bounds {
  const out: Bounds = new Map();
  for (const [k, v] of a) {
    const w = b.get(k);
    if (w !== undefined) out.set(k, { upper: v.upper && w.upper, lower: v.lower && w.lower });
  }
  return out;
}

/** Which counters a condition bounds from above/below, when it holds (or, if negated, when it fails). */
function boundsOf(c: Condition, negated: boolean): Bounds {
  if ("not" in c) return boundsOf(c.not, !negated);
  if ("all" in c || "any" in c) {
    const children = ("all" in c ? c.all : c.any).map((x) => boundsOf(x, negated));
    // all = conjunction; any = disjunction; negation swaps them (De Morgan).
    const conjunction = "all" in c ? !negated : negated;
    if (children.length === 0) return new Map();
    return children.reduce((acc, b) => (conjunction ? union(acc, b) : intersection(acc, b)));
  }
  if (!("counter" in c)) return new Map();
  const t = c.counter;
  const parts: Array<{ upper: boolean; lower: boolean }> = [];
  const add = (present: boolean, upper: boolean, lower: boolean) => {
    if (present) parts.push({ upper, lower });
  };
  if (!negated) {
    add(t.lt !== undefined || t.lte !== undefined, true, false);
    add(t.gt !== undefined || t.gte !== undefined, false, true);
    add(t.eq !== undefined, true, true);
    add(t.ne !== undefined, false, false);
    const upper = parts.some((p) => p.upper);
    const lower = parts.some((p) => p.lower);
    return upper || lower ? new Map([[t.name, { upper, lower }]]) : new Map();
  }
  // not(c1 and c2 …) = not c1 or not c2: only bounds shared by every negated comparison count.
  add(t.lt !== undefined, false, true);
  add(t.lte !== undefined, false, true);
  add(t.gt !== undefined, true, false);
  add(t.gte !== undefined, true, false);
  add(t.eq !== undefined, false, false);
  add(t.ne !== undefined, true, true);
  if (parts.length === 0) return new Map();
  const upper = parts.every((p) => p.upper);
  const lower = parts.every((p) => p.lower);
  return upper || lower ? new Map([[t.name, { upper, lower }]]) : new Map();
}

function boundsOfAll(conditions: Conditions | undefined, negated = false): Bounds {
  if (conditions === undefined || conditions.length === 0) return new Map();
  return boundsOf({ all: conditions }, negated);
}

function findUnbounded(
  effects: Effects | undefined,
  path: string,
  guard: Bounds,
  report: (counter: Id, path: string, needs: string) => void,
): void {
  (effects ?? []).forEach((e, i) => {
    const p = `${path}[${i}]`;
    if ("counter" in e && e.counter.add !== undefined && e.counter.add !== 0) {
      const b = guard.get(e.counter.name);
      if (e.counter.add > 0 && !b?.upper) report(e.counter.name, `${p}.counter`, "an upper bound (lt, lte or eq)");
      if (e.counter.add < 0 && !b?.lower) report(e.counter.name, `${p}.counter`, "a lower bound (gt, gte or eq)");
    } else if ("if" in e) {
      findUnbounded(e.if.then, `${p}.if.then`, union(guard, boundsOfAll(e.if.when)), report);
      findUnbounded(e.if.else, `${p}.if.else`, union(guard, boundsOfAll(e.if.when, true)), report);
    }
  });
}

function checkCounterBounds(ix: PackIndex, out: DiagnosticList): void {
  const { pack } = ix;
  pack.rules.forEach((rule, i) => {
    if (rule.once) return; // fires at most once: bounded
    const turn = "event" in rule.on && rule.on.event === "turn";
    findUnbounded(rule.do, `rules[${i}].do`, boundsOfAll(rule.when), (counter, path, needs) => {
      if (turn) {
        out.warning(
          "counter.unbounded-turn-rule",
          path,
          `This turn rule changes counter "${counter}" every turn without ${needs} on it in its 'when', so the counter grows forever and the game cannot be verified. Add e.g. when: { counter: { name: ${counter}, lt: 5 } }.`,
        );
      } else {
        out.info(
          "counter.unbounded",
          path,
          `Counter "${counter}" can change without ${needs} each time this rule fires, which makes the state space infinite. Consider bounding it in 'when' or making the rule once.`,
        );
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Endings, score, hints
// ---------------------------------------------------------------------------

export function checkEndingsScoreHints(ix: PackIndex, out: DiagnosticList): void {
  const { pack } = ix;
  const endings = Object.entries(pack.endings);
  if (!endings.some(([, e]) => e.win)) {
    out.error("ending.none-winning", "endings", "No ending has win: true. A pack needs at least one winning ending.");
  }
  if (pack.policy === "forgiving") {
    for (const [id, ending] of endings) {
      if (!ending.win) {
        out.error(
          "policy.losing-ending",
          `endings.${id}.win`,
          `Ending "${id}" is a losing ending, which the forgiving policy forbids. Set win: true and rewrite it as a (possibly bittersweet) success, or remove it.`,
        );
      }
    }
  }

  const usedEndings = new Set<Id>();
  let scoreTotal = 0;
  let hasScore = false;
  walkPack(pack, {
    effect(e) {
      if ("end" in e) usedEndings.add(e.end);
      else if ("score" in e) {
        hasScore = true;
        if (e.score > 0) scoreTotal += e.score;
      }
    },
  });
  for (const [id] of endings) {
    if (!usedEndings.has(id)) {
      out.warning(
        "ending.unused",
        `endings.${id}`,
        `Ending "${id}" is never reached: no { end: ${id} } effect exists. Add one or remove the ending.`,
      );
    }
  }
  if (hasScore && pack.maxScore === undefined) {
    out.info(
      "score.maxScore-missing",
      "maxScore",
      "The pack has score effects but no maxScore, so the score display is off. Set maxScore to the walkthrough's final score.",
    );
  }
  if (pack.maxScore !== undefined && scoreTotal < pack.maxScore) {
    out.warning(
      "score.maxScore-unreachable",
      "maxScore",
      `maxScore is ${pack.maxScore}, but all score effects together give only ${scoreTotal}. Set maxScore to the walkthrough's final score.`,
    );
  }

  if (pack.hints.length === 0) {
    out.warning(
      "hint.none",
      "hints",
      "The pack has no hints. Add progressive hints (when/until/steps) for every puzzle so players never get stuck.",
    );
  }
  const hintIds = new Map<Id, number>();
  pack.hints.forEach((hint, i) => {
    const first = hintIds.get(hint.id);
    if (first !== undefined) {
      out.error(
        "hint.duplicate-id",
        `hints[${i}].id`,
        `Hint id "${hint.id}" is already used by hints[${first}]. Hint ids must be unique.`,
      );
    } else hintIds.set(hint.id, i);
  });
}

// ---------------------------------------------------------------------------
// Reachability of rooms and dialogue structure
// ---------------------------------------------------------------------------

export function checkRoomReachability(ix: PackIndex, out: DiagnosticList): void {
  const { pack } = ix;
  // Conditions are ignored: a goto anywhere counts as a way into its room.
  const reached = new Set<Id>();
  const queue: Id[] = [];
  const visit = (room: Id) => {
    if (!reached.has(room) && pack.rooms[room] !== undefined) {
      reached.add(room);
      queue.push(room);
    }
  };
  visit(pack.start.room);
  walkPack(pack, {
    effect(e) {
      if ("goto" in e) visit(e.goto);
    },
  });
  while (queue.length > 0) {
    const room = queue.shift()!;
    for (const exit of Object.values(pack.rooms[room]!.exits ?? {})) visit(exit.to);
  }
  for (const room of Object.keys(pack.rooms)) {
    if (!reached.has(room)) {
      out.warning(
        "room.unreachable",
        `rooms.${room}`,
        `Room "${room}" cannot be reached from the start room "${pack.start.room}" through exits or goto effects. Exits are one-way: add an exit leading to it, or remove the room.`,
      );
    }
  }
}

function leavesDialogue(effects: Effects | undefined): boolean {
  return (effects ?? []).some(
    (e) =>
      "endDialogue" in e ||
      "end" in e ||
      "dialogue" in e ||
      ("if" in e && (leavesDialogue(e.if.then) || leavesDialogue(e.if.else))),
  );
}

export function checkDialogues(ix: PackIndex, out: DiagnosticList): void {
  const { pack } = ix;
  const used = new Set<Id>();
  for (const object of Object.values(pack.objects)) if (object.dialogue !== undefined) used.add(object.dialogue);
  walkPack(pack, {
    effect(e) {
      if ("dialogue" in e) used.add(e.dialogue);
    },
  });

  for (const [id, dialogue] of Object.entries(pack.dialogues)) {
    const p = `dialogues.${id}`;
    const nodeIds = Object.keys(dialogue.nodes);
    const optionIds = new Map<Id, string>();
    for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
      (node.options ?? []).forEach((option, i) => {
        const op = `${p}.nodes.${nodeId}.options[${i}]`;
        const first = optionIds.get(option.id);
        if (first !== undefined) {
          out.error(
            "dialogue.duplicate-option",
            `${op}.id`,
            `Option id "${option.id}" is already used at ${first}. Option ids must be unique within a dialogue ('choose ${option.id}' must be unambiguous).`,
          );
        } else optionIds.set(option.id, op);
        if (option.goto !== undefined && dialogue.nodes[option.goto] === undefined) {
          out.error(
            "dialogue.unknown-goto",
            `${op}.goto`,
            `Option "${option.id}" goes to node "${option.goto}", which does not exist in dialogue "${id}". Nodes: ${nodeIds.join(", ")}. Omit goto to end the dialogue after this option.`,
          );
        }
      });
    }

    // Reachable nodes from start via option gotos.
    const reached = new Set<Id>();
    const queue: Id[] = [];
    if (dialogue.nodes[dialogue.start] !== undefined) {
      reached.add(dialogue.start);
      queue.push(dialogue.start);
    }
    while (queue.length > 0) {
      const node = dialogue.nodes[queue.shift()!]!;
      for (const option of node.options ?? []) {
        if (option.goto !== undefined && dialogue.nodes[option.goto] !== undefined && !reached.has(option.goto)) {
          reached.add(option.goto);
          queue.push(option.goto);
        }
      }
    }
    for (const nodeId of nodeIds) {
      if (!reached.has(nodeId)) {
        out.warning(
          "dialogue.unreachable-node",
          `${p}.nodes.${nodeId}`,
          `Node "${nodeId}" is not reachable from the start node "${dialogue.start}" through option gotos. Add an option with goto: ${nodeId}, or remove the node.`,
        );
      }
    }

    // The player must be able to leave: a node without options, an option without goto, or an explicit exit effect.
    const leavable = [...reached].some((nodeId) => {
      const node = dialogue.nodes[nodeId]!;
      const options = node.options ?? [];
      return (
        options.length === 0 ||
        leavesDialogue(node.do) ||
        options.some((o) => o.goto === undefined || leavesDialogue(o.do))
      );
    });
    if (!leavable && reached.size > 0) {
      out.warning(
        "dialogue.no-exit",
        p,
        `Dialogue "${id}" can never be left: every reachable option has a goto and no effect ends it. Add a goodbye option without goto (e.g. { id: bye, text: "…" }).`,
      );
    }

    if (!used.has(id)) {
      out.warning(
        "dialogue.unused",
        p,
        `Dialogue "${id}" is never started: no object has dialogue: ${id} and no { dialogue: ${id} } effect exists.`,
      );
    }
  }
}
