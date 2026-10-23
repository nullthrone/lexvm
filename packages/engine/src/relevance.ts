/**
 * Which parts of the game state can change the course of the game.
 *
 * The explorer deduplicates states by a key. Two states that differ only in
 * variables that cannot influence which commands are accepted, which state
 * changes happen or how the game ends have the same future, so the key may
 * leave those variables out. Typical cases are "flavour" state in packs:
 * a flag that only selects a text variant, a "first time you examine the
 * painting" flag that guards a rule which only prints text, an interrogation
 * topic that can be asked once and only prints an answer.
 *
 * Variables are flags (`f:`), counters (`c:`), visited rooms (`v:`), fired
 * `once` rules (`r:`) and chosen `once` dialogue options (`o:`). The analysis
 * is a least fixpoint of relevance: a variable becomes relevant when a guard
 * that reads it decides between alternatives that are not equivalent, i.e.
 * one of them does something other than print text, change the score or
 * write irrelevant variables ("inert" effects). Guards:
 * - exit `when` / `visibleWhen`: always decisive (movement);
 * - `if` effects: decisive unless both branches are inert;
 * - event rules: decisive unless the rule is inert (firing it changes nothing);
 * - command rules: decisive unless the rule is inert and so is everything that
 *   would run instead (later rules that may match the same command, and the
 *   default behaviour);
 * - dialogue options: decisive unless choosing the option comes back to the
 *   same node with only inert changes (directly, or through an answer node
 *   whose options all lead back), and the node always keeps another option
 *   (so that it never runs empty and ends the dialogue).
 * Text variants and hints never matter: they only change what is printed.
 *
 * The analysis is conservative: when in doubt a variable is relevant, which
 * only costs exploration time.
 */
import type { PackIndex, RuleRef } from "./pack-index.ts";
import type { CommandTrigger, Condition, DialogueNode, DialogueOption, Effect, Pack } from "./schema.ts";

export interface Relevance {
  flags: Set<string>;
  counters: Set<string>;
  visited: Set<string>;
  /** Once-rule keys (`state.fired`). */
  fired: Set<string>;
  /** "dialogue.option" keys (`state.chosen`). */
  chosen: Set<string>;
}

type Guard = {
  /** Variables the guard reads. */
  reads: string[];
  /** True when the alternatives the guard decides between are equivalent under `relevant`. */
  equivalent: (relevant: ReadonlySet<string>) => boolean;
};

export function relevantState(pack: Pack, ix: PackIndex): Relevance {
  const guards = collectGuards(pack, ix);
  const relevant = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of guards) {
      if (g.reads.every((v) => relevant.has(v))) continue;
      if (g.equivalent(relevant)) continue;
      for (const v of g.reads) {
        if (!relevant.has(v)) {
          relevant.add(v);
          changed = true;
        }
      }
    }
  }
  const out: Relevance = {
    flags: new Set(),
    counters: new Set(),
    visited: new Set(),
    fired: new Set(),
    chosen: new Set(),
  };
  const byPrefix: Record<string, Set<string>> = {
    f: out.flags,
    c: out.counters,
    v: out.visited,
    r: out.fired,
    o: out.chosen,
  };
  for (const v of relevant) byPrefix[v.slice(0, 1)]?.add(v.slice(2));
  return out;
}

/**
 * Coverage check for the explorer: a rule or option that never fired in the
 * explored (merged) states may still fire in play when its firing depends on
 * state the key leaves out and that something changes. Returns a predicate
 * telling whether "never fired" is conclusive.
 */
export function coverageCheck(
  pack: Pack,
  ix: PackIndex,
  rel: Relevance,
): { rule: (ref: RuleRef) => boolean; option: (option: DialogueOption) => boolean } {
  const written = writtenVariables(pack);
  // A variable nothing writes keeps its initial value in every state: reading it is exact.
  const lost = (v: string) =>
    !isRelevant(rel, v) && (v.startsWith("v:") || v.startsWith("r:") || v.startsWith("o:") || written.has(v));
  return {
    rule: (ref) => {
      // Its own conditions, and those of earlier rules that may take the same command first.
      const reads = conditionReads(ref.rule.when);
      if ("verb" in ref.rule.on) {
        const trigger = ref.rule.on;
        for (const other of ix.commandRules.get(trigger.verb) ?? []) {
          if (other.index === ref.index || (other.index > ref.index && trigger.verb !== "use")) continue;
          if (overlap(trigger, other.trigger)) reads.push(...ruleReads(other));
        }
      }
      return !reads.some(lost);
    },
    option: (option) => !conditionReads(option.when).some(lost),
  };
}

function writtenVariables(pack: Pack): Set<string> {
  const out = new Set<string>();
  const visit = (effects: readonly Effect[] | undefined): void => {
    for (const e of effects ?? []) {
      if ("set" in e) out.add(`f:${e.set}`);
      else if ("clear" in e) out.add(`f:${e.clear}`);
      else if ("counter" in e) out.add(`c:${e.counter.name}`);
      else if ("if" in e) {
        visit(e.if.then);
        visit(e.if.else);
      }
    }
  };
  for (const r of pack.rules) visit(r.do);
  for (const d of Object.values(pack.dialogues)) {
    for (const node of Object.values(d.nodes)) {
      visit(node.do);
      for (const o of node.options ?? []) visit(o.do);
    }
  }
  return out;
}

/** Whether a variable (prefixed id, e.g. "f:studied") is part of the relevant state. */
function isRelevant(rel: Relevance, v: string): boolean {
  const id = v.slice(2);
  switch (v.slice(0, 1)) {
    case "f":
      return rel.flags.has(id);
    case "c":
      return rel.counters.has(id);
    case "v":
      return rel.visited.has(id);
    case "r":
      return rel.fired.has(id);
    case "o":
      return rel.chosen.has(id);
    default:
      return true;
  }
}

/** Variables a rule's firing depends on: its conditions and its own once mark. */
function ruleReads(ref: RuleRef): string[] {
  const reads = conditionReads(ref.rule.when);
  if (ref.onceKey !== null) reads.push(`r:${ref.onceKey}`);
  return reads;
}

/** Variables an option's availability depends on: its conditions and its own once mark. */
function optionReads(dialogueId: string, option: DialogueOption): string[] {
  const reads = conditionReads(option.when);
  if (option.once) reads.push(`o:${dialogueId}.${option.id}`);
  return reads;
}

function conditionReads(conds: readonly Condition[] | undefined, out: string[] = []): string[] {
  const visit = (c: Condition): void => {
    if ("flag" in c) out.push(`f:${c.flag}`);
    else if ("counter" in c) out.push(`c:${c.counter.name}`);
    else if ("visited" in c) out.push(`v:${c.visited}`);
    else if ("not" in c) visit(c.not);
    else if ("all" in c) c.all.forEach(visit);
    else if ("any" in c) c.any.forEach(visit);
  };
  conds?.forEach(visit);
  return out;
}

/** Effects that only print, change the score or write irrelevant flags/counters. */
function inert(effects: readonly Effect[] | undefined, relevant: ReadonlySet<string>): boolean {
  for (const e of effects ?? []) {
    if ("say" in e || "look" in e || "score" in e) continue;
    if ("set" in e && !relevant.has(`f:${e.set}`)) continue;
    if ("clear" in e && !relevant.has(`f:${e.clear}`)) continue;
    if ("counter" in e && !relevant.has(`c:${e.counter.name}`)) continue;
    if ("if" in e && inert(e.if.then, relevant) && inert(e.if.else, relevant)) continue;
    return false;
  }
  return true;
}

/** Whether the default behaviour of every command a trigger matches leaves the state unchanged. */
function defaultInert(pack: Pack, t: CommandTrigger): boolean {
  const obj = t.object !== undefined ? pack.objects[t.object] : undefined;
  switch (t.verb) {
    case "look":
    case "push":
    case "pull":
    case "wait":
    case "inventory":
    case "give":
    case "show":
      return true;
    case "talk":
      return obj !== undefined ? obj.dialogue === undefined : Object.values(pack.objects).every((o) => !o.dialogue);
    case "take":
      return obj !== undefined && !obj.portable && !obj.clue;
    case "drop":
      return obj !== undefined && !obj.portable;
    case "open":
    case "close":
      return obj !== undefined && !obj.openable;
    case "use":
      return Object.values(pack.objects).every((o) => o.unlockedBy === undefined);
    case "go":
    case "choose":
      return false;
    default:
      // Pack verbs print their default text.
      return true;
  }
}

/** Two triggers can match the same command. */
function overlap(a: CommandTrigger, b: CommandTrigger): boolean {
  if (a.verb !== b.verb) return false;
  // `use a b` is retried as `use b a`: any two use rules may compete.
  if (a.verb === "use") return true;
  const same = (x: string | undefined, y: string | undefined) => x === undefined || y === undefined || x === y;
  return same(a.object, b.object) && same(a.with, b.with);
}

function collectGuards(pack: Pack, ix: PackIndex): Guard[] {
  const guards: Guard[] = [];
  const ifGuards = (effects: readonly Effect[] | undefined): void => {
    for (const e of effects ?? []) {
      if (!("if" in e)) continue;
      const { then, else: otherwise } = e.if;
      guards.push({
        reads: conditionReads(e.if.when),
        equivalent: (rel) => inert(then, rel) && inert(otherwise, rel),
      });
      ifGuards(then);
      ifGuards(otherwise);
    }
  };

  // Exits decide about movement: always relevant.
  for (const room of Object.values(pack.rooms)) {
    for (const exit of Object.values(room.exits ?? {})) {
      guards.push({
        reads: conditionReads([...(exit.when ?? []), ...(exit.visibleWhen ?? [])]),
        equivalent: () => false,
      });
    }
  }

  for (const ref of ix.allRules) {
    const rule = ref.rule;
    const reads = ruleReads(ref);
    ifGuards(rule.do);
    if ("event" in rule.on) {
      guards.push({ reads, equivalent: (rel) => inert(rule.do, rel) });
      continue;
    }
    const trigger = rule.on;
    // Everything that may run instead when this rule does not fire: later rules for the same
    // command (all use rules, because of the swapped retry) and the default behaviour.
    const competitors = (ix.commandRules.get(trigger.verb) ?? []).filter(
      (other) => other.index !== ref.index && (other.index > ref.index || trigger.verb === "use"),
    );
    guards.push({
      reads,
      equivalent: (rel) =>
        inert(rule.do, rel) &&
        defaultInert(pack, trigger) &&
        competitors.every((c) => !overlap(trigger, c.trigger) || inert(c.rule.do, rel)),
    });
  }

  for (const [dialogueId, dialogue] of Object.entries(pack.dialogues)) {
    for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
      ifGuards(node.do);
      const options = node.options ?? [];
      // Another option that is always offered keeps the node from running empty.
      const alwaysOther = (o: DialogueOption) => options.some((x) => x !== o && !x.once && x.when === undefined);
      for (const option of options) {
        ifGuards(option.do);
        const reads = optionReads(dialogueId, option);
        guards.push({
          reads,
          equivalent: (rel) =>
            alwaysOther(option) &&
            inert(option.do, rel) &&
            returnsInertly(dialogue.nodes, nodeId, node, option.goto, rel),
        });
      }
    }
  }
  return guards;
}

/**
 * Choosing an option that leads to `goto` comes back to `nodeId` with only
 * inert changes: either `goto` is the node itself, or an answer node whose
 * options are all unconditional, inert and lead back.
 */
function returnsInertly(
  nodes: Record<string, DialogueNode>,
  nodeId: string,
  node: DialogueNode,
  goto: string | undefined,
  rel: ReadonlySet<string>,
): boolean {
  if (goto === undefined || !inert(node.do, rel)) return false;
  if (goto === nodeId) return true;
  const answer = nodes[goto];
  if (!answer || !inert(answer.do, rel)) return false;
  const back = answer.options ?? [];
  return back.length > 0 && back.every((o) => o.when === undefined && !o.once && o.goto === nodeId && inert(o.do, rel));
}
