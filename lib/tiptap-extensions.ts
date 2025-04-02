import { Mark, Node } from "@tiptap/core";
import { Editor } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    customStyle: {
      toggleCustomStyle: (className: string) => ReturnType;
    };
    keyTakeaways: {
      insertKeyTakeaways: () => ReturnType;
    };
  }
}

// CustomStyle Mark (unchanged)
export const CustomStyle = Mark.create({
  name: "customStyle",
  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("class"),
        renderHTML: (attributes: { class?: string }) => {
          if (!attributes.class) return {};
          return { class: attributes.class };
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span",
        getAttrs: (element: HTMLElement) => {
          const className = element.getAttribute("class");
          if (className) return { class: className };
          return false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, string> }) {
    return ["span", HTMLAttributes, 0];
  },
  addCommands() {
    return {
      toggleCustomStyle:
        (className: string) =>
        ({ commands, editor }: { commands: any; editor: Editor }) => {
          const { from, to } = editor.state.selection;
          if (from === to) {
            console.log("No text selected for", className);
            return false;
          }
          const currentMarks = editor.getAttributes("customStyle");
          console.log("Current marks:", currentMarks, "Applying:", className);
          if (currentMarks.class === className) {
            console.log("Removing", className);
            return commands.unsetMark("customStyle");
          }
          console.log("Setting", className);
          return commands.setMark("customStyle", { class: className });
        },
    };
  },
});

// KeyTakeaways Node (updated to use prose styles)
export const KeyTakeaways = Node.create({
  name: "keyTakeaways",
  group: "block",
  content: "block+",
  parseHTML() {
    return [
      {
        tag: "div",
        getAttrs: (element: HTMLElement) => {
          if (element.classList.contains("key-takeaways")) return {};
          return false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, string> }) {
    return ["div", { class: "key-takeaways", ...HTMLAttributes }, 0];
  },
  addCommands() {
    return {
      insertKeyTakeaways:
        () =>
        ({ commands }: { commands: any }) => {
          return commands.insertContent([
            {
              type: "heading",
              attrs: { level: 3 }, // Uses .prose h3 from globals.css
              content: [{ type: "text", text: "Key Takeaways" }],
            },
            {
              type: "bulletList", // Uses .prose ul from globals.css
              content: [
                {
                  type: "listItem",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "First takeaway" }] },
                  ],
                },
                {
                  type: "listItem",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "Second takeaway" }] },
                  ],
                },
              ],
            },
          ]);
        },
    };
  },
});