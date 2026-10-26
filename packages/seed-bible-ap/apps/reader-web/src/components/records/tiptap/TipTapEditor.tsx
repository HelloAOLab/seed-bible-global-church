// Ported from packages/seed-bible components/TipTapEditor/TipTapEditor.tsx: the note editor on `@tiptap/core`
// with the same toolbar. Loaded lazily by the notes pane so the TipTap bundle arrives only when a note is edited.
import { Editor, Extension, type FocusPosition } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useEffect, useRef, useState } from "preact/hooks";
import TextAlign from "./TextAlign";
import VerseReferenceMark from "./VerseReferenceMark";
import { useI18n } from "../../../i18n";

export interface TipTapEditorProps {
  className?: string;
  /** HTML the editor starts with, e.g. when editing an existing note. */
  initialContent?: string;
  /** Receives the editor instance once it's ready, and null when torn down. */
  onEditor: (editor: Editor | null) => void;
  /** Called whenever the editor transitions between empty and non-empty. */
  onEmptyChange: (isEmpty: boolean) => void;
  /** Cmd+Enter on Mac / Ctrl+Enter elsewhere. */
  onModEnter?: () => void;
  autofocus?: FocusPosition;
}

export default function TipTapEditor(props: TipTapEditorProps) {
  const {
    className,
    initialContent,
    onEditor,
    onEmptyChange,
    onModEnter,
    autofocus = false,
  } = props;
  const elementRef = useRef<HTMLDivElement>(null);
  const initialContentRef = useRef(initialContent);
  const autofocusRef = useRef(autofocus);
  const [editor, setEditor] = useState<Editor | null>(null);
  const onEditorRef = useRef(onEditor);
  onEditorRef.current = onEditor;
  const onEmptyChangeRef = useRef(onEmptyChange);
  onEmptyChangeRef.current = onEmptyChange;
  const onModEnterRef = useRef(onModEnter);
  onModEnterRef.current = onModEnter;

  useEffect(() => {
    if (!elementRef.current) return;
    const editor = new Editor({
      element: elementRef.current,
      content: initialContentRef.current,
      extensions: [
        StarterKit,
        Underline,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        VerseReferenceMark,
        Extension.create({
          name: "modEnter",
          addKeyboardShortcuts() {
            return {
              "Mod-Enter": () => {
                const handler = onModEnterRef.current;
                if (!handler) return false;
                handler();
                return true;
              },
            };
          },
        }),
      ],
      onUpdate: ({ editor }) => onEmptyChangeRef.current(editor.isEmpty),
    });
    const autofocusPosition = autofocusRef.current;
    if (autofocusPosition !== false && autofocusPosition != null) {
      editor.commands.focus(autofocusPosition, { scrollIntoView: false });
    }
    onEditorRef.current(editor);
    setEditor(editor);
    return () => {
      onEditorRef.current(null);
      setEditor(null);
      editor.destroy();
    };
  }, []);

  return (
    <div className={className}>
      <EditorMenuBar editor={editor} />
      <div ref={elementRef} className="sb-editor-content" />
    </div>
  );
}

function EditorMenuBar({ editor }: { editor: Editor | null }) {
  const { t } = useI18n();
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const update = () => setVersion((version) => version + 1);
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);
  if (!editor) return null;
  const btn = (
    icon: string,
    label: string,
    active: boolean,
    onClick: () => void
  ) => (
    <button
      type="button"
      className={
        "sb-editor-toolbar-button" +
        (active ? " sb-editor-toolbar-button--active" : "")
      }
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      <span className="material-symbols-outlined">{icon}</span>
    </button>
  );
  return (
    <div className="sb-editor-toolbar" role="toolbar">
      <div className="sb-editor-toolbar-group">
        {btn(
          "format_bold",
          t("editor-format-bold", { defaultValue: "Bold" }),
          editor.isActive("bold"),
          () => editor.chain().focus().toggleBold().run()
        )}
        {btn(
          "format_italic",
          t("editor-format-italic", { defaultValue: "Italic" }),
          editor.isActive("italic"),
          () => editor.chain().focus().toggleItalic().run()
        )}
        {btn(
          "format_underlined",
          t("editor-format-underline", { defaultValue: "Underline" }),
          editor.isActive("underline"),
          () => editor.chain().focus().toggleUnderline().run()
        )}
      </div>
      <div className="sb-editor-toolbar-group">
        {btn(
          "format_align_left",
          t("editor-align-left", { defaultValue: "Align left" }),
          editor.isActive({ textAlign: "left" }),
          () => editor.chain().focus().setTextAlign("left").run()
        )}
        {btn(
          "format_align_center",
          t("editor-align-center", { defaultValue: "Align center" }),
          editor.isActive({ textAlign: "center" }),
          () => editor.chain().focus().setTextAlign("center").run()
        )}
        {btn(
          "format_align_right",
          t("editor-align-right", { defaultValue: "Align right" }),
          editor.isActive({ textAlign: "right" }),
          () => editor.chain().focus().setTextAlign("right").run()
        )}
        {btn(
          "format_align_justify",
          t("editor-align-justify", { defaultValue: "Justify" }),
          editor.isActive({ textAlign: "justify" }),
          () => editor.chain().focus().setTextAlign("justify").run()
        )}
      </div>
    </div>
  );
}
