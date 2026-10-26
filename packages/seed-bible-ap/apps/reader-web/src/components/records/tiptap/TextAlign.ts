// Ported verbatim from packages/seed-bible components/TipTapEditor/TextAlign.tsx: alignment as a class, not a style.
import { Extension } from "@tiptap/core";

export interface TextAlignOptions {
  types: string[];
  alignments: Record<string, string>;
  defaultAlignment: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textAlign: {
      setTextAlign: (alignment: string) => ReturnType;
      unsetTextAlign: () => ReturnType;
      toggleTextAlign: (alignment: string) => ReturnType;
    };
  }
}

export const TextAlign = Extension.create<TextAlignOptions>({
  name: "textAlign",
  addOptions() {
    return {
      types: [],
      alignments: {
        left: "text-left",
        center: "text-center",
        right: "text-right",
        justify: "text-justify",
      },
      defaultAlignment: null,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: this.options.defaultAlignment,
            parseHTML: (element) => {
              const fromClass = Object.entries(this.options.alignments).find(
                ([, cls]) => element.classList.contains(cls)
              )?.[0];
              const alignment = fromClass ?? element.style.textAlign;
              return Object.keys(this.options.alignments).includes(alignment)
                ? alignment
                : this.options.defaultAlignment;
            },
            renderHTML: (attributes) => {
              if (!attributes.textAlign) return {};
              return { class: this.options.alignments[attributes.textAlign] };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextAlign:
        (alignment: string) =>
        ({ commands }) => {
          if (!Object.keys(this.options.alignments).includes(alignment))
            return false;
          return this.options.types
            .map((type) =>
              commands.updateAttributes(type, { textAlign: alignment })
            )
            .some((response) => response);
        },
      unsetTextAlign:
        () =>
        ({ commands }) =>
          this.options.types
            .map((type) => commands.resetAttributes(type, "textAlign"))
            .some((response) => response),
      toggleTextAlign:
        (alignment) =>
        ({ editor, commands }) => {
          if (!Object.keys(this.options.alignments).includes(alignment))
            return false;
          if (editor.isActive({ textAlign: alignment }))
            return commands.unsetTextAlign();
          return commands.setTextAlign(alignment);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-l": () => this.editor.commands.setTextAlign("left"),
      "Mod-Shift-e": () => this.editor.commands.setTextAlign("center"),
      "Mod-Shift-r": () => this.editor.commands.setTextAlign("right"),
      "Mod-Shift-j": () => this.editor.commands.setTextAlign("justify"),
    };
  },
});

export default TextAlign;
