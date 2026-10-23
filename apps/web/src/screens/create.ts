/**
 * "Create your own adventure": the bring-your-own-LLM flow.
 * 1) copy the prompt, 2) paste it with an idea into any AI chat, 3) import the
 * resulting YAML/JSON here. Imports are compiled (lazy chunk), checked, their
 * walkthrough replayed, and stored on the device.
 */
import { type Diagnostic, type Pack, runWalkthrough, type SourceFile, type WalkthroughReport } from "@lexvm/engine";
import promptText from "../../../../prompts/oneshot.md?raw";
import { navigate, type Screen } from "../app.ts";
import { confirmDialog } from "../components/confirm.ts";
import { pageHeader } from "../components/header.ts";
import { toast } from "../components/toast.ts";
import { h, prefersReducedMotion, replaceChildren, uid } from "../dom.ts";
import { type StringKey, t } from "../i18n.ts";
import { icon } from "../icons.ts";
import { formatBytes } from "../logic/text.ts";
import { loadCompiler } from "../services/engine.ts";
import { copyText, downloadText } from "../services/files.ts";
import { importedPackExists, libraryKey, storeImportedPack } from "../services/packs.ts";

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const PROMPT_FILE = "lexvm-prompt.md";

/** Source name for pasted text: JSON if it looks like JSON, else YAML. */
export function pastedSourceName(text: string): string {
  return /^\s*[{[]/.test(text) ? "pack.json" : "pack.yaml";
}

function diagnosticsText(diagnostics: Diagnostic[], walkthrough: WalkthroughReport | null): string {
  const lines = diagnostics.map((d) => {
    const where = d.file ? `${d.file}${d.line ? `:${d.line}` : ""} ` : "";
    return `${d.severity.toUpperCase()} ${where}${d.path} [${d.code}]: ${d.message}`;
  });
  if (walkthrough && !walkthrough.ok) {
    const failed = walkthrough.steps.find((s) => s.status !== "ok");
    lines.push(`WALKTHROUGH failed${failed ? ` at "${failed.command}": ${failed.output}` : ""}`);
    for (const d of walkthrough.diagnostics)
      lines.push(`${d.severity.toUpperCase()} ${d.path} [${d.code}]: ${d.message}`);
  }
  return lines.join("\n");
}

function renderDiagnostic(d: Diagnostic): HTMLElement {
  const where = d.file ? `${d.file}${d.line ? `:${d.line}` : ""}` : null;
  return h(
    "li",
    { class: `diag diag--${d.severity}` },
    h(
      "p",
      { class: "diag__head" },
      h("span", { class: "diag__severity", text: t(`create.severity.${d.severity}` as StringKey) }),
      where ? h("span", { class: "diag__where", text: where }) : null,
      d.path ? h("code", { class: "diag__path", text: d.path }) : null,
    ),
    h("p", { class: "diag__message", text: d.message }),
  );
}

export function createCreateScreen(): Screen {
  const header = pageHeader(t("create.heading"));
  const fileId = uid("file");
  const pasteId = uid("paste");
  let files: File[] = [];
  /** The most recently used input wins: chosen files or pasted text. */
  let source: "files" | "paste" = "paste";

  const fileNames = h("p", { class: "field__note", attrs: { "aria-live": "polite" } });
  const fileInput = h("input", {
    id: fileId,
    class: "visually-hidden",
    attrs: { type: "file", multiple: true, accept: ".yaml,.yml,.json,application/json,text/yaml" },
    on: {
      change: () => {
        files = [...(fileInput.files ?? [])];
        if (files.length > 0) source = "files";
        fileNames.textContent =
          files.length > 0 ? t("create.files", { names: files.map((f) => f.name).join(", ") }) : "";
      },
    },
  });
  const paste = h("textarea", {
    id: pasteId,
    class: "paste",
    attrs: { rows: 8, spellcheck: "false", autocapitalize: "off", autocomplete: "off" },
    on: {
      input: () => {
        source = "paste";
      },
    },
  });
  const results = h("div", { class: "results", attrs: { "aria-live": "polite" } });
  const checkButton = h(
    "button",
    { class: "button button--primary", type: "button", on: { click: () => void check() } },
    icon("check"),
    h("span", { text: t("create.check") }),
  );

  const showError = (message: string) =>
    replaceChildren(results, h("p", { class: "notice notice--error", text: message }));

  async function collectSources(): Promise<SourceFile[] | null> {
    if (source === "files" && files.length > 0) {
      const total = files.reduce((sum, f) => sum + f.size, 0);
      if (total > MAX_SOURCE_BYTES) {
        showError(t("create.tooLarge", { max: formatBytes(MAX_SOURCE_BYTES) }));
        return null;
      }
      return Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
    }
    const text = paste.value;
    if (text.trim().length === 0) {
      showError(t("create.empty"));
      return null;
    }
    if (new Blob([text]).size > MAX_SOURCE_BYTES) {
      showError(t("create.tooLarge", { max: formatBytes(MAX_SOURCE_BYTES) }));
      return null;
    }
    return [{ name: pastedSourceName(text), text }];
  }

  async function store(pack: Pack): Promise<HTMLElement> {
    if (await importedPackExists(pack.id)) {
      const replace = await confirmDialog({
        title: t("create.replaceTitle"),
        message: t("create.replaceText", { id: pack.id }),
        confirm: t("create.replace"),
      });
      if (!replace) return h("p", { class: "muted", text: t("common.cancel") });
    }
    if (!(await storeImportedPack(pack, new Date()))) {
      return h("p", { class: "notice notice--error", text: t("create.notSaved") });
    }
    return h(
      "div",
      { class: "notice notice--ok" },
      h("p", { lang: pack.language, text: t("create.saved", { title: pack.title }) }),
      h(
        "div",
        { class: "notice__actions" },
        h(
          "button",
          {
            class: "button button--primary",
            type: "button",
            on: { click: () => navigate({ name: "play", key: libraryKey("imported", pack.id), fresh: true }) },
          },
          icon("play"),
          h("span", { text: t("create.play") }),
        ),
        h("button", {
          class: "button",
          type: "button",
          text: t("game.toLibrary"),
          on: { click: () => navigate({ name: "library" }) },
        }),
      ),
    );
  }

  async function check(): Promise<void> {
    const sources = await collectSources();
    if (!sources) return;
    checkButton.disabled = true;
    replaceChildren(results, h("p", { class: "muted", text: t("create.checking") }));
    try {
      let compile: Awaited<ReturnType<typeof loadCompiler>>;
      try {
        compile = await loadCompiler();
      } catch (error) {
        console.error(error);
        showError(t("create.compilerError"));
        return;
      }
      const result = compile(sources);
      const counts = { error: 0, warning: 0, info: 0 };
      for (const d of result.diagnostics) counts[d.severity] += 1;
      let walkthrough: WalkthroughReport | null = null;
      let walkthroughNode: HTMLElement | null = null;
      if (result.pack) {
        try {
          walkthrough = runWalkthrough(result.pack);
          const failed = walkthrough.steps.findIndex((s) => s.status !== "ok");
          walkthroughNode = walkthrough.ok
            ? h("p", {
                class: "notice notice--ok",
                text: t("create.walkthroughOk", {
                  steps: walkthrough.steps.length,
                  ending:
                    (walkthrough.ending && result.pack.endings[walkthrough.ending]?.title) ?? walkthrough.ending ?? "?",
                }),
              })
            : h(
                "div",
                { class: "notice notice--warning" },
                h("p", { text: t("create.walkthroughFailed") }),
                failed >= 0
                  ? h("p", {
                      text: t("create.walkthroughStep", {
                        n: failed + 1,
                        command: walkthrough.steps[failed]?.command ?? "",
                      }),
                    })
                  : null,
              );
        } catch (error) {
          console.error(error);
          walkthroughNode = h("p", { class: "notice notice--warning", text: t("create.walkthroughError") });
        }
      }
      const report = diagnosticsText(result.diagnostics, walkthrough);
      const copyButton =
        report.length > 0
          ? h(
              "button",
              {
                class: "button",
                type: "button",
                on: {
                  click: async () => {
                    if (await copyText(report)) toast(t("create.diagnosticsCopied"));
                  },
                },
              },
              icon("copy"),
              h("span", { text: t("create.copyDiagnostics") }),
            )
          : null;
      replaceChildren(
        results,
        h(
          "p",
          { class: "results__summary" },
          t("create.summary", { errors: counts.error, warnings: counts.warning, infos: counts.info }),
        ),
        result.diagnostics.length > 0 ? h("ul", { class: "diags" }, ...result.diagnostics.map(renderDiagnostic)) : null,
        result.pack ? null : h("p", { class: "notice notice--error", text: t("create.failed") }),
        walkthroughNode,
        result.pack && walkthrough?.ok
          ? null
          : report.length > 0
            ? h("p", { class: "muted", text: t("create.repairTip") })
            : null,
        copyButton,
      );
      results.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      if (result.pack) results.appendChild(await store(result.pack));
    } catch (error) {
      console.error(error);
      showError(t("create.unexpected", { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      checkButton.disabled = false;
    }
  }

  const step = (n: number, title: string, ...content: Array<HTMLElement | null>) =>
    h(
      "li",
      { class: "step" },
      h("span", { class: "step__num", attrs: { "aria-hidden": "true" }, text: String(n) }),
      h("div", { class: "step__body" }, h("h2", { class: "step__title", text: title }), ...content),
    );

  const el = h(
    "div",
    { class: "screen screen--page" },
    h(
      "main",
      { class: "page" },
      header.el,
      h("p", { class: "lead", text: t("create.intro") }),
      h(
        "ol",
        { class: "steps" },
        step(
          1,
          t("create.step1Title"),
          h("p", { text: t("create.step1Text") }),
          h(
            "div",
            { class: "button-row" },
            h(
              "button",
              {
                class: "button button--primary",
                type: "button",
                on: {
                  click: async () => {
                    toast((await copyText(promptText)) ? t("create.copied") : t("create.copyFailed"));
                  },
                },
              },
              icon("copy"),
              h("span", { text: t("create.copy") }),
            ),
            h(
              "button",
              {
                class: "button",
                type: "button",
                on: { click: () => downloadText(PROMPT_FILE, promptText, "text/markdown") },
              },
              icon("download"),
              h("span", { text: t("create.download") }),
            ),
          ),
          h(
            "details",
            { class: "prompt-preview" },
            h("summary", { text: `${t("create.preview")} (${formatBytes(new Blob([promptText]).size)})` }),
            h("pre", { class: "prompt-preview__text", lang: "en", text: promptText }),
          ),
        ),
        step(2, t("create.step2Title"), h("p", { text: t("create.step2Text") })),
        step(
          3,
          t("create.step3Title"),
          h("p", { text: t("create.step3Text") }),
          h(
            "div",
            { class: "button-row" },
            fileInput,
            h(
              "label",
              { class: "button", attrs: { for: fileId } },
              icon("upload"),
              h("span", { text: t("create.pickFile") }),
            ),
          ),
          fileNames,
          h("label", { class: "field__legend", attrs: { for: pasteId }, text: t("create.pasteLabel") }),
          paste,
          h("div", { class: "button-row" }, checkButton),
          results,
        ),
      ),
    ),
  );
  return { el, title: t("create.heading"), focus: header.heading };
}
