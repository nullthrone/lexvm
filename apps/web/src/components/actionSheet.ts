/**
 * Object-first action sheet: tap an object, pick a verb. Two-object verbs
 * switch the same sheet to target selection ("Use brass key with …").
 */
import type { Command, ObjectKind, View } from "@lexvm/engine";
import { h } from "../dom.ts";
import { type StringKey, t } from "../i18n.ts";
import { type IconName, icon } from "../icons.ts";
import {
  type SheetVerb,
  sheetFor,
  soloCommand,
  type TargetGroupId,
  type TargetModel,
  targetCommand,
  targetModel,
} from "../logic/actions.ts";
import { openSheet, type SheetHandle } from "./sheet.ts";

export function kindLabel(kind: ObjectKind): string {
  return t(`game.kind.${kind}` as StringKey);
}

const KIND_ICON: Record<ObjectKind, IconName> = {
  npc: "npc",
  container: "container",
  item: "item",
  clue: "clue",
  scenery: "scenery",
};

const GROUP_LABEL: Record<TargetGroupId, StringKey> = {
  here: "game.groupHere",
  inventory: "game.groupInventory",
  notebook: "game.groupNotebook",
};

export interface ActionSheetOptions {
  view: View;
  /** Pack language. */
  lang: string;
  objectId: string;
  run(command: Command): void;
  /** Extra content under the verbs (e.g. a clue's notebook text). */
  extra?: HTMLElement | null;
}

/** Open the action sheet for a present object. Returns null if the object is not present. */
export function openActionSheet(options: ActionSheetOptions): SheetHandle | null {
  const model = sheetFor(options.view, options.objectId);
  if (!model) return null;
  const { lang } = options;
  const sheet = openSheet({
    title: model.object.name,
    titleLang: lang,
    eyebrow: kindLabel(model.object.kind),
    className: "action-sheet",
  });

  const finish = (command: Command) => {
    sheet.close();
    options.run(command);
  };

  const showVerbs = () => {
    sheet.setTitle(model.object.name, lang);
    sheet.setEyebrow(kindLabel(model.object.kind));
    sheet.setBody(
      h(
        "div",
        { class: "verbs" },
        ...model.verbs.map((v: SheetVerb) =>
          h("button", {
            class: "verb",
            type: "button",
            lang,
            text: v.needsTarget ? `${v.label} …` : v.label,
            dataset: { verb: v.verb },
            on: {
              click: () => {
                if (!v.needsTarget) {
                  finish({ verb: v.verb, object: model.object.id });
                  return;
                }
                const target = targetModel(options.view, model.object.id, v.verb);
                if (target) showTargets(target);
              },
            },
          }),
        ),
      ),
      options.extra ?? null,
    );
    sheet.focusFirst();
  };

  const showTargets = (target: TargetModel) => {
    const prompt = `${target.prompt.before} …${target.prompt.after ? ` ${target.prompt.after}` : ""}`;
    sheet.setEyebrow(undefined);
    sheet.setTitle(prompt, lang);
    const groups = target.groups.map((group) =>
      h(
        "section",
        { class: "targets__group", attrs: { "aria-label": t(GROUP_LABEL[group.group]) } },
        h("h3", { class: "targets__label", text: t(GROUP_LABEL[group.group]) }),
        h(
          "div",
          { class: "chips chips--wrap" },
          ...group.items.map((item) =>
            h(
              "button",
              {
                class: `chip chip--${item.kind}`,
                type: "button",
                dataset: { object: item.id },
                on: { click: () => finish(targetCommand(target, item.id)) },
              },
              icon(KIND_ICON[item.kind]),
              h("span", { class: "chip__label", lang, text: item.name }),
            ),
          ),
        ),
      ),
    );
    const empty =
      target.empty === "nobody"
        ? t("game.nobodyHere")
        : target.empty === "nothing" && !target.allowSolo
          ? t("game.nothingToPick")
          : null;
    sheet.setBody(
      h(
        "div",
        { class: "targets" },
        ...groups,
        empty ? h("p", { class: "targets__empty", text: empty }) : null,
        h(
          "div",
          { class: "targets__actions" },
          target.allowSolo
            ? h("button", {
                class: "button",
                type: "button",
                text: t("game.justUse"),
                on: { click: () => finish(soloCommand(target)) },
              })
            : null,
          h("button", {
            class: "button button--quiet",
            type: "button",
            text: t("common.cancel"),
            on: { click: showVerbs },
          }),
        ),
      ),
    );
    sheet.focusFirst();
  };

  showVerbs();
  return sheet;
}
