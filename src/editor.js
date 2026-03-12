// src/editor.js - TipTap entry point for bundling
// Exposes TipTap Editor and extensions as global variables

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import DOMPurify from 'dompurify';

// Expose DOMPurify to global scope for XSS protection
window.DOMPurify = DOMPurify;

// Configure DOMPurify with safe defaults
DOMPurify.setConfig({
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'strike',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'hr',
    'span', 'div'
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'link', 'base'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit']
});

// Expose to global scope
window.TipTapEditor = Editor;
window.TipTapStarterKit = StarterKit;
window.TipTapPlaceholder = Placeholder;
window.TipTapLink = Link;
window.TipTapUnderline = Underline;
window.TipTapTextStyle = TextStyle;
window.TipTapColor = Color;
window.TipTapHighlight = Highlight;
window.TipTapTaskList = TaskList;
window.TipTapTaskItem = TaskItem;

// Convenience: createEditor helper
window.createTipTapEditor = function(options) {
  const {
    element,
    placeholder = '写下此刻想法...',
    content = ''
  } = options;

  return new Editor({
    element: element,
    content: content,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      Placeholder.configure({
        placeholder: placeholder
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'tiptap-link'
        }
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true
      }),
      TaskList,
      TaskItem.configure({
        nested: true
      })
    ],
    editorProps: {
      attributes: {
        class: 'tiptap-content'
      }
    }
  });
};

console.log('TipTap editor bundle loaded');
