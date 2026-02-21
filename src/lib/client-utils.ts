import { marked } from "marked";
import hljs from "highlight.js";

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Custom renderer for code highlighting
const renderer = new marked.Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  let highlighted = text;
  if (lang && hljs.getLanguage(lang)) {
    try {
      highlighted = hljs.highlight(text, { language: lang }).value;
    } catch {
      // fallback
    }
  } else {
    try {
      highlighted = hljs.highlightAuto(text).value;
    } catch {
      // fallback
    }
  }
  return `<pre><code class="hljs${lang ? " language-" + lang : ""}">${highlighted}</code></pre>`;
};
marked.use({ renderer });

export function esc(text: string): string {
  if (!text) return "";
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

export function relativeTime(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return d + "d";
  return new Date(ts).toLocaleDateString();
}

export function fmtTime(ts: string | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function fileExt(filepath: string): string {
  if (!filepath) return "";
  const m = filepath.match(/\.(\w+)$/);
  return m ? m[1] : "";
}

export function extToLang(ext: string): string {
  const map: Record<string, string> = {
    js: "javascript", ts: "typescript", tsx: "typescript", jsx: "javascript",
    py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
    sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    xml: "xml", html: "html", css: "css", scss: "scss",
    md: "markdown", sql: "sql",
    tf: "hcl", hcl: "hcl", lua: "lua",
    swift: "swift", kt: "kotlin", scala: "scala",
    r: "r", php: "php", pl: "perl", ex: "elixir", exs: "elixir",
  };
  return map[(ext || "").toLowerCase()] || ext;
}

export function truncStr(text: string, max: number): { t: string; trunc: boolean } {
  if (!text) return { t: "", trunc: false };
  if (text.length <= max) return { t: text, trunc: false };
  return { t: text.slice(0, max), trunc: true };
}

export function stripConversationMeta(text: string): string {
  if (!text) return text;
  if (!text.startsWith("Conversation info")) return text;
  const idx = text.indexOf("```\n\n");
  if (idx !== -1) return text.slice(idx + 5).trim();
  const idx2 = text.indexOf("```\n");
  if (idx2 !== -1) return text.slice(idx2 + 4).trim();
  return text;
}

export function renderMarkdown(rawText: string): string {
  if (!rawText) return "";
  try {
    return marked.parse(rawText) as string;
  } catch {
    return esc(rawText).replace(/\n/g, "<br>");
  }
}

export function highlightCode(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch {
      // fallback
    }
  }
  return esc(code);
}

export function syntaxHighlightJson(json: string): string {
  const escaped = esc(json);
  return escaped.replace(
    /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)/g,
    (match, key, colon, str, num, bool, nil) => {
      if (key && colon) return `<span class="jk">${key}</span>${colon}`;
      if (str) return `<span class="js">${str}</span>`;
      if (num !== undefined && num !== "") return `<span class="jn">${num}</span>`;
      if (bool) return `<span class="jb">${bool}</span>`;
      if (nil) return `<span class="jnl">${nil}</span>`;
      return match;
    }
  );
}

export function extractText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && b.type === "text")
      .map((b) => b.text || "")
      .join("\n");
  }
  return "";
}

export function extractResultText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (!b) return "";
        if (typeof b === "string") return b;
        if (b.type === "text") return b.text || "";
        if (b.content)
          return typeof b.content === "string"
            ? b.content
            : JSON.stringify(b.content);
        return JSON.stringify(b);
      })
      .join("\n");
  }
  if (typeof content === "object" && content !== null) {
    const obj = content as Record<string, unknown>;
    return (obj.text as string) || (obj.content as string) || JSON.stringify(content);
  }
  return String(content);
}

export function looksLikeMarkdown(text: string): boolean {
  if (text.length < 200) return false;
  return (
    /^#{1,6} /m.test(text) ||
    /^\|.+\|/m.test(text) ||
    /\*\*.+?\*\*/m.test(text) ||
    /^---/m.test(text)
  );
}

export function cleanPreview(text: string): string {
  if (!text) return "";
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[(.+?)\]\(.*?\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u2600-\u27BF\uFE00-\uFE0F]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

export function channelIcon(ch: string): string {
  if (!ch) return "";
  if (ch === "telegram")
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px"><path d="M22 2L2 9.3l7.3 1.9L22 2zm0 0l-9.4 8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.3 11.2v6.5l3.1-3.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (ch.startsWith("codex"))
    return `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" style="vertical-align:-1px"><path d="M5 3l6 5-6 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (ch === "claude-code")
    return `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" style="vertical-align:-1px"><circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>`;
  return "";
}

export function sessionLabel(s: {
  key: string;
  label?: string;
  title?: string;
  sessionId: string;
  source?: string;
  preview?: string;
  cwd?: string;
  isSubagent?: boolean;
}): string {
  const src = s.source || "kova";

  // Kova/OpenClaw sessions
  if (src === "kova") {
    if (s.key === "agent:main:main") return "main session";
    if (s.title) return s.title;
    if (s.label) return s.label;
    if (s.preview) return s.preview.slice(0, 60);
    if (s.key) {
      const parts = s.key.split(":");
      if (parts.length > 2) return parts.slice(1).join(":");
      return s.key;
    }
    return s.sessionId.slice(0, 14) + "\u2026";
  }

  // Claude Code sessions
  if (src === "claude") {
    if (s.isSubagent) {
      return "subagent " + s.sessionId.slice(0, 8);
    }
    const slug = s.label || s.key || "";
    let project = slug;
    if (slug.startsWith("~/")) {
      const parts = slug.split("/");
      project = parts[parts.length - 1] || parts[parts.length - 2] || slug;
    } else if (slug.startsWith("-") || slug.includes("-")) {
      const parts = slug.replace(/^-/, "").split(/[-/]/);
      project = parts[parts.length - 1] || slug;
    }
    if (s.preview && project) {
      const snippet = s.preview.slice(0, 40).replace(/\n/g, " ");
      return `${project}: ${snippet}`;
    }
    return project || s.sessionId.slice(0, 14) + "\u2026";
  }

  // Codex sessions
  if (src === "codex") {
    if (s.cwd) {
      const base = s.cwd.split("/").pop() || s.cwd;
      if (s.preview) {
        return `${base}: ${s.preview.slice(0, 40).replace(/\n/g, " ")}`;
      }
      return base;
    }
    if (s.label) return s.label;
    return s.sessionId.slice(0, 14) + "\u2026";
  }

  // Fallback
  if (s.label) return s.label;
  if (s.key) {
    const parts = s.key.split(":");
    if (parts.length > 2) return parts.slice(1).join(":");
    return s.key;
  }
  return s.sessionId.slice(0, 14) + "\u2026";
}

/** Map tool name to its block color category key */
export function toolColorKey(name: string): string {
  switch (name) {
    case "exec": case "Bash": return "exec";
    case "read": case "Read": case "write": case "Write": case "edit": case "Edit": case "Glob": case "Grep": return "file";
    case "web_search": case "WebSearch": case "web_fetch": case "WebFetch": return "web";
    case "browser": case "Browser": return "browser";
    case "message": case "Message": case "SendMessage": return "msg";
    case "sessions_spawn": case "Task": case "task": return "agent";
    default: return "";
  }
}

export function copyToClipboard(text: string, label?: string): Promise<void> {
  return navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      // ignore
    }
    document.body.removeChild(ta);
  });
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
