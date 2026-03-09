import { Language, Level } from "@prisma/client";

export const textData = {
  title: "ПхоьалгIа йоза",
  language: Language.CHE,
  level: Level.A1,
  author: "Bashtarov Sayd-Magomed",
  source: "https://www.shuverida.vu",
  pages: [
    {
      pageNumber: 1,
      contentRich: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: {
              level: 1,
            },
            content: [
              {
                type: "text",
                text: "Getting started",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Welcome to the ",
              },
              {
                type: "text",
                marks: [
                  {
                    type: "em",
                  },
                ],
                text: "Simple Editor",
              },
              {
                type: "text",
                text: " template! This template integrates ",
              },
              {
                type: "text",
                marks: [
                  {
                    type: "strong",
                  },
                ],
                text: "open source",
              },
              {
                type: "text",
                text: " UI components and Tiptap extensions licensed under ",
              },
              {
                type: "text",
                marks: [
                  {
                    type: "strong",
                  },
                ],
                text: "MIT",
              },
              {
                type: "text",
                text: ".",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Integrate it by following the ",
              },
              {
                type: "text",
                marks: [
                  {
                    type: "link",
                    attrs: {
                      href: "https://tiptap.dev/docs/ui-components/templates/simple-editor",
                      title: null,
                    },
                  },
                ],
                text: "Tiptap UI Components docs",
              },
              {
                type: "text",
                text: " or using our CLI tool.",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Add images, customize alignment, and apply advanced formatting to make your writing more engaging and professional.",
              },
            ],
          },
          {
            type: "heading",
            attrs: {
              level: 2,
            },
            content: [
              {
                type: "text",
                text: "Make it your own",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Switch between light and dark modes, and tailor the editor's appearance with customizable CSS to match your style.",
              },
            ],
          },
        ],
      },
    },
  ],
};
