/**
 * Texts of `lexvm play`, in the pack's language (German or English; other
 * languages get English, like the engine's own messages).
 */

export interface PlayText {
  /** Placeholders: {title}, {result}, {score}. */
  ended: string;
  won: string;
  lost: string;
  /** ", score 3/5"; placeholders {value}, {max}. */
  endScore: string;
  /** Placeholder {npc}: " with Anni" or "". */
  talking: string;
  talkingWith: string;
  exits: string;
  here: string;
  inventory: string;
  clues: string;
  /** " | score 3/5". */
  score: string;
  nothing: string;
  empty: string;
  none: string;
  malformed: string;
  nothingToUndo: string;
  undone: string;
  restarting: string;
  noSaving: string;
  noHint: string;
  /** Placeholders: {i}, {n}, {text}. */
  hint: string;
  hintMore: string;
  help: {
    intro: string;
    verbs: string;
    object: string;
    /** Connects the two objects of a two-object verb without its own preposition. */
    with: string;
    canonical: string;
    dialogue: string;
    clues: string;
    meta: string;
  };
}

const en: PlayText = {
  ended: "-- THE END: {title} ({result}{score}). Type restart, undo or quit.",
  won: "won",
  lost: "lost",
  endScore: ", score {value}/{max}",
  talking: '-- talking{npc}; pick a number or "choose <id>":',
  talkingWith: " to {npc}",
  exits: "exits",
  here: "here",
  inventory: "inventory",
  clues: "clues",
  score: "score",
  nothing: "nothing",
  empty: "empty",
  none: "none",
  malformed: 'Malformed canonical command: "{text}" (expected "verb [object [with]]" with ids).',
  nothingToUndo: "Nothing to undo.",
  undone: "Undone.",
  restarting: "Restarting.",
  noSaving: "Saving and loading are not available in the terminal player; use undo and restart.",
  noHint: "No hint right now.",
  hint: "Hint {i}/{n}: {text}",
  hintMore: " (type hint again for more)",
  help: {
    intro: "Type a command in the pack's language, a canonical command with ids, or a meta command.",
    verbs: "Verbs",
    object: "<object>",
    with: "with",
    canonical: 'Canonical examples: "look", "look <id>", "take <id>", "use <id> <id>", "go <exit>".',
    dialogue: 'In a dialogue: type the option number or "choose <option_id>".',
    clues:
      'Clues in the notebook can be combined: "combine <clue> with <clue>" (canonical: "use <id> <id>"), or shown to a character.',
    meta: "Meta: undo, restart, hint (repeat for the next step), help, quit.",
  },
};

const de: PlayText = {
  ended: "-- ENDE: {title} ({result}{score}). Tippe »neustart«, »rückgängig« oder »beenden«.",
  won: "gewonnen",
  lost: "verloren",
  endScore: ", {value} von {max} Punkten",
  talking: "-- Gespräch{npc}; wähle eine Nummer oder »choose <id>«:",
  talkingWith: " mit {npc}",
  exits: "Ausgänge",
  here: "hier",
  inventory: "Inventar",
  clues: "Notizbuch",
  score: "Punkte",
  nothing: "nichts",
  empty: "leer",
  none: "keine",
  malformed: "Kein gültiger kanonischer Befehl: „{text}“ (erwartet: »verb [objekt [objekt2]]« mit IDs).",
  nothingToUndo: "Es gibt nichts rückgängig zu machen.",
  undone: "Rückgängig gemacht.",
  restarting: "Neustart.",
  noSaving: "Speichern und Laden gibt es im Terminal nicht; nutze »rückgängig« und »neustart«.",
  noHint: "Gerade gibt es keinen Hinweis.",
  hint: "Hinweis {i}/{n}: {text}",
  hintMore: " (»hinweis« für mehr)",
  help: {
    intro: "Gib einen Befehl auf Deutsch ein, einen kanonischen Befehl mit IDs oder einen Meta-Befehl.",
    verbs: "Verben",
    object: "<Objekt>",
    with: "mit",
    canonical: "Kanonische Beispiele: »look«, »look <id>«, »take <id>«, »use <id> <id>«, »go <ausgang>«.",
    dialogue: "Im Gespräch: tippe die Nummer der Antwort oder »choose <antwort_id>«.",
    clues:
      "Einträge im Notizbuch lassen sich kombinieren: »kombiniere <Eintrag> mit <Eintrag>« (kanonisch: »use <id> <id>«), oder einer Person zeigen.",
    meta: "Meta: rückgängig, neustart, hinweis (wiederholen für den nächsten Schritt), hilfe, beenden.",
  },
};

/** The texts for a BCP 47 language tag. */
export function playText(language: string): PlayText {
  return language.toLowerCase().split("-")[0] === "de" ? de : en;
}

/** Fill {placeholders}. */
export function fillText(template: string, args: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(args, name) ? String(args[name]) : whole,
  );
}
