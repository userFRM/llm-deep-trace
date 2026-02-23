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

// Simple Icons brand SVGs (CC0) — all 24×24 viewBox, rendered at 12×12
const CHANNEL_SVGS: Record<string, { path: string; color: string }> = {
  telegram: {
    color: "#26A5E4",
    path: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  },
  whatsapp: {
    color: "#25D366",
    path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
  },
  discord: {
    color: "#5865F2",
    path: "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z",
  },
  signal: {
    color: "#3A76F0",
    path: "M12 0q-.934 0-1.83.139l.17 1.111a11 11 0 0 1 3.32 0l.172-1.111A12 12 0 0 0 12 0M9.152.34A12 12 0 0 0 5.77 1.742l.584.961a10.8 10.8 0 0 1 3.066-1.27zm5.696 0-.268 1.094a10.8 10.8 0 0 1 3.066 1.27l.584-.962A12 12 0 0 0 14.848.34M12 2.25a9.75 9.75 0 0 0-8.539 14.459c.074.134.1.292.064.441l-1.013 4.338 4.338-1.013a.62.62 0 0 1 .441.064A9.7 9.7 0 0 0 12 21.75c5.385 0 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25m-7.092.068a12 12 0 0 0-2.59 2.59l.909.664a11 11 0 0 1 2.345-2.345zm14.184 0-.664.909a11 11 0 0 1 2.345 2.345l.909-.664a12 12 0 0 0-2.59-2.59M1.742 5.77A12 12 0 0 0 .34 9.152l1.094.268a10.8 10.8 0 0 1 1.269-3.066zm20.516 0-.961.584a10.8 10.8 0 0 1 1.27 3.066l1.093-.268a12 12 0 0 0-1.402-3.383M.138 10.168A12 12 0 0 0 0 12q0 .934.139 1.83l1.111-.17A11 11 0 0 1 1.125 12q0-.848.125-1.66zm23.723.002-1.111.17q.125.812.125 1.66c0 .848-.042 1.12-.125 1.66l1.111.172a12.1 12.1 0 0 0 0-3.662M1.434 14.58l-1.094.268a12 12 0 0 0 .96 2.591l-.265 1.14 1.096.255.36-1.539-.188-.365a10.8 10.8 0 0 1-.87-2.35m21.133 0a10.8 10.8 0 0 1-1.27 3.067l.962.584a12 12 0 0 0 1.402-3.383zm-1.793 3.848a11 11 0 0 1-2.345 2.345l.664.909a12 12 0 0 0 2.59-2.59zm-19.959 1.1L.357 21.48a1.8 1.8 0 0 0 2.162 2.161l1.954-.455-.256-1.095-1.953.455a.675.675 0 0 1-.81-.81l.454-1.954zm16.832 1.769a10.8 10.8 0 0 1-3.066 1.27l.268 1.093a12 12 0 0 0 3.382-1.402zm-10.94.213-1.54.36.256 1.095 1.139-.266c.814.415 1.683.74 2.591.961l.268-1.094a10.8 10.8 0 0 1-2.35-.869zm3.634 1.24-.172 1.111a12.1 12.1 0 0 0 3.662 0l-.17-1.111q-.812.125-1.66.125a11 11 0 0 1-1.66-.125",
  },
  slack: {
    color: "#4A154B",
    path: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
  },
  imessage: {
    color: "#1FCA41",
    path: "M5.285 0A5.273 5.273 0 0 0 0 5.285v13.43A5.273 5.273 0 0 0 5.285 24h13.43A5.273 5.273 0 0 0 24 18.715V5.285A5.273 5.273 0 0 0 18.715 0ZM12 4.154a8.809 7.337 0 0 1 8.809 7.338A8.809 7.337 0 0 1 12 18.828a8.809 7.337 0 0 1-2.492-.303A8.656 7.337 0 0 1 5.93 19.93a9.929 7.337 0 0 0 1.54-2.155 8.809 7.337 0 0 1-4.279-6.283A8.809 7.337 0 0 1 12 4.154",
  },
  googlechat: {
    color: "#00AC47",
    path: "M1.637 0C.733 0 0 .733 0 1.637v16.5c0 .904.733 1.636 1.637 1.636h3.955v3.323c0 .804.97 1.207 1.539.638l3.963-3.96h11.27c.903 0 1.636-.733 1.636-1.637V5.592L18.408 0Zm3.955 5.592h12.816v8.59H8.455l-2.863 2.863Z",
  },
};

function brandSvg(ch: string): string {
  const icon = CHANNEL_SVGS[ch];
  if (!icon) return "";
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="${icon.color}" style="vertical-align:-2px;flex-shrink:0"><path d="${icon.path}"/></svg>`;
}

export function channelIcon(ch: string): string {
  if (!ch) return "";
  if (CHANNEL_SVGS[ch]) return brandSvg(ch);
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
