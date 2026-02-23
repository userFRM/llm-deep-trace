"use client";

import React, { useState, useEffect } from "react";
import { NormalizedMessage, BlockColors } from "@/lib/types";
import type { BlockExpansion, BlockCategory } from "@/lib/store";
import {
  fmtTime,
  extractText,
  extractResultText,
  stripConversationMeta,
  renderMarkdown,
  highlightCode,
  truncStr,
  looksLikeMarkdown,
  fileExt,
  extToLang,
  toolColorKey,
} from "@/lib/client-utils";
import CopyButton from "./CopyButton";

const ChevronSvg = ({ size = 8 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Image helpers ──
const DATA_URI_RE = /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g;
const FILE_PATH_RE = /(?:^|\s)(\/[^\s]+\.(?:png|jpg|jpeg|gif|webp))/gi;

function imagePathToSrc(filePath: string): string {
  return `/api/image?path=${btoa(filePath)}`;
}

function extractImagesFromText(text: string): string[] {
  const images: string[] = [];
  const dataMatches = text.match(DATA_URI_RE);
  if (dataMatches) images.push(...dataMatches);
  FILE_PATH_RE.lastIndex = 0;
  let m;
  while ((m = FILE_PATH_RE.exec(text)) !== null) {
    images.push(imagePathToSrc(m[1].trim()));
  }
  return images;
}

function ImageThumbnail({ src, alt }: { src: string; alt?: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [lightboxOpen]);

  return (
    <>
      <img
        src={src}
        alt={alt || "image"}
        className="msg-image-thumb"
        onClick={() => setLightboxOpen(true)}
        loading="lazy"
      />
      {lightboxOpen && (
        <div className="msg-lightbox" onClick={() => setLightboxOpen(false)}>
          <img
            src={src}
            alt={alt || "image"}
            className="msg-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <button className="msg-lightbox-close" onClick={() => setLightboxOpen(false)} title="Close (Esc)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

function ImageBlock({ block }: { block: Record<string, unknown> }) {
  if (block.type !== "image") return null;
  const source = block.source as Record<string, unknown> | undefined;
  if (!source || source.type !== "base64") return null;
  const mediaType = (source.media_type as string) || "image/png";
  const data = source.data as string;
  if (!data) return null;
  const src = `data:${mediaType};base64,${data}`;
  return <ImageThumbnail src={src} alt="embedded image" />;
}

// ── Arg Value with show more toggle ──
function ArgValue({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  if (value.length <= 100) return <span className="tc-arg-val">{value}</span>;
  return (
    <span className="tc-arg-val">
      {expanded ? value : value.slice(0, 100) + "\u2026"}
      <button
        className="tc-arg-toggle"
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
      >
        {expanded ? "less" : "more"}
      </button>
    </span>
  );
}

// ── Args List ──
function ArgsList({ input }: { input: Record<string, unknown> }) {
  const entries = Object.entries(input);
  if (entries.length === 0) return <div className="tc-args-empty">no arguments</div>;
  return (
    <div className="tc-args-list">
      {entries.map(([key, value]) => {
        let strVal: string;
        if (typeof value === "string") strVal = value;
        else if (typeof value === "number" || typeof value === "boolean") strVal = String(value);
        else if (value === null || value === undefined) strVal = String(value);
        else strVal = JSON.stringify(value, null, 2);
        return (
          <div key={key} className="tc-arg-row">
            <span className="tc-arg-key">{key}</span>
            <span className="tc-arg-sep">&rarr;</span>
            <ArgValue value={strVal} />
          </div>
        );
      })}
    </div>
  );
}

// ── Thinking Block ── (fixed: forceOpen only sets initial state)
function ThinkingBlock({
  text,
  forceOpen,
  accentColor,
}: {
  text: string;
  forceOpen: boolean;
  accentColor: string;
}) {
  const [open, setOpen] = useState(forceOpen);

  useEffect(() => {
    setOpen(forceOpen);
  }, [forceOpen]);

  return (
    <div
      className={`thinking-block ${open ? "expanded" : ""}`}
      style={{ "--block-accent": accentColor } as React.CSSProperties}
    >
      <div className="thinking-header" onClick={() => setOpen(!open)}>
        <span className={`thinking-chevron ${open ? "open" : ""}`}>
          <ChevronSvg />
        </span>
        <span className="thinking-label">thinking</span>
        <span className="thinking-sep">&middot;</span>
        <span className="thinking-hint">
          {open ? "collapse" : "expand"}
        </span>
      </div>
      <div className={`thinking-body ${open ? "open" : ""}`}>
        <div className="thinking-body-inner">{text}</div>
      </div>
    </div>
  );
}

// ── Tool Call (collapsible with accent color) ──
function ToolCallBlock({
  block,
  blockColors,
  autoExpand,
  globalExpand,
}: {
  block: Record<string, unknown>;
  blockColors: BlockColors;
  autoExpand: boolean;
  globalExpand?: boolean;
}) {
  const name = (block.name as string) || "?";
  const input = (block.input || {}) as Record<string, unknown>;
  const [expanded, setExpanded] = useState(autoExpand || !!globalExpand);
  const [localOverride, setLocalOverride] = useState(false);

  useEffect(() => {
    if (!localOverride) setExpanded(!!globalExpand || autoExpand);
  }, [globalExpand, autoExpand, localOverride]);

  const colorKey = toolColorKey(name);
  const accent = colorKey ? blockColors[colorKey as keyof BlockColors] : "#888899";

  const getDesc = (): string => {
    switch (name) {
      case "exec":
      case "Bash": {
        const cmd = (input.command as string) || (input.cmd as string) || "";
        return cmd.length > 80 ? cmd.slice(0, 80) + "\u2026" : cmd;
      }
      case "read":
      case "Read":
      case "write":
      case "Write":
      case "edit":
      case "Edit":
        return (input.file_path as string) || (input.path as string) || (input.filePath as string) || "";
      case "web_search":
      case "WebSearch":
        return (input.query as string) || (input.q as string) || "";
      case "web_fetch":
      case "WebFetch":
        return (input.url as string) || "";
      case "browser":
      case "Browser": {
        const action = (input.action as string) || "";
        const url = (input.url as string) || "";
        const selector = (input.selector as string) || "";
        return `${action} ${url || selector}`.trim();
      }
      case "message":
      case "Message":
      case "SendMessage": {
        const target = (input.recipient as string) || (input.target as string) || "";
        const content = (input.content as string) || (input.message as string) || "";
        const preview = content.slice(0, 50);
        return target ? `${target}: ${preview}` : preview;
      }
      case "sessions_spawn":
        return (input.label as string) || ((input.task as string) || "").slice(0, 60) || "subagent";
      case "Task":
        return (input.description as string) || "";
      case "Glob":
        return (input.pattern as string) || "";
      case "Grep":
        return (input.pattern as string) || "";
      case "TodoWrite":
        return "updating task list";
      default: {
        const keys = Object.keys(input);
        if (keys.length === 0) return "";
        const firstKey = keys[0];
        const firstVal = String(input[firstKey] || "");
        return `${firstKey}: ${firstVal.length > 60 ? firstVal.slice(0, 60) + "\u2026" : firstVal}`;
      }
    }
  };

  const desc = getDesc();

  return (
    <div
      className={`tool-call ${expanded ? "expanded" : ""}`}
      style={{ "--block-accent": accent } as React.CSSProperties}
    >
      <div className="tool-call-header" onClick={() => { setLocalOverride(true); setExpanded(!expanded); }}>
        <span className={`tc-chevron ${expanded ? "open" : ""}`}>
          <ChevronSvg />
        </span>
        <span className="tc-dot" style={{ background: accent }} />
        <span className="tc-name-label">{name}</span>
        {!expanded && desc && <span className="tc-desc">{desc}</span>}
      </div>
      {expanded && (
        <div className="tool-call-body open">
          <ArgsList input={input} />
        </div>
      )}
    </div>
  );
}

// ── Tool Result (collapsible with accent color) ──
function ToolResultBlock({
  msg,
  time,
  showTime,
  blockColors,
  autoExpand,
  globalExpand,
  toolInputsMap,
  onNavigateSession,
}: {
  msg: NonNullable<NormalizedMessage["message"]>;
  time: string;
  showTime: boolean;
  blockColors: BlockColors;
  autoExpand: boolean;
  globalExpand?: boolean;
  toolInputsMap?: Map<string, Record<string, unknown>>;
  onNavigateSession?: (key: string) => void;
}) {
  const toolName = msg.toolName || "";
  const isError = msg.isError || false;
  const text = extractResultText(msg.content);
  const [showFull, setShowFull] = useState(false);
  const [mdrOpen, setMdrOpen] = useState(false);
  const [expanded, setExpanded] = useState(autoExpand || !!globalExpand);
  const [localOverride, setLocalOverride] = useState(false);
  const toolInput = toolInputsMap?.get(msg.toolCallId || "") || {};

  useEffect(() => {
    if (!localOverride) setExpanded(!!globalExpand || autoExpand);
  }, [globalExpand, autoExpand, localOverride]);

  const colorKey = toolColorKey(toolName);
  const accent = colorKey ? blockColors[colorKey as keyof BlockColors] : "#888899";

  // Build a 1-line summary for collapsed view
  const getSummary = (): string => {
    switch (toolName) {
      case "exec":
      case "Bash": {
        const lines = text.split("\n").filter(Boolean);
        if (lines.length === 0) return "(empty output)";
        return lines[0].slice(0, 100);
      }
      case "write":
      case "Write":
      case "edit":
      case "Edit": {
        const fp = (toolInput.file_path as string) || (toolInput.path as string) || "";
        return fp ? `${fp.split("/").pop()} ${isError ? "failed" : "ok"}` : (isError ? "failed" : "ok");
      }
      case "Read": {
        const fp = (toolInput.file_path as string) || (toolInput.path as string) || "";
        return fp ? fp.split("/").pop() || "file" : "file read";
      }
      case "web_search":
      case "WebSearch":
        return (toolInput.query as string)?.slice(0, 60) || "search results";
      case "web_fetch":
      case "WebFetch":
        return (toolInput.url as string)?.slice(0, 60) || "fetched content";
      case "message":
      case "Message":
      case "SendMessage":
        return "sent";
      case "sessions_spawn":
        return "subagent dispatched";
      case "Task":
      case "task":
        return text.slice(0, 80).replace(/\n/g, " ") || "task result";
      default:
        return text.slice(0, 80).replace(/\n/g, " ") || (isError ? "error" : "ok");
    }
  };

  let bodyHtml = null;

  // Only compute body content when expanded — skip all markdown/highlight work when collapsed
  const renderTerminal = (t: string, maxH?: number) => (
    <div className="tr-terminal copyable" style={maxH ? { maxHeight: maxH } : {}}>
      {t}
      <CopyButton text={text} label="Copy" />
    </div>
  );

  const renderCodeBlock = (t: string, lang: string, maxH?: number) => {
    const highlighted = lang ? highlightCode(t, lang) : t;
    return (
      <div className="pre-wrap">
        {lang && <span className="lang-tag">{lang}</span>}
        <pre
          className={lang ? "has-lang-tag hljs" : "hljs"}
          style={maxH ? { maxHeight: maxH, overflowY: "auto" } : {}}
        >
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
        <CopyButton text={text} label="Copy" />
      </div>
    );
  };

  const renderMdResult = (t: string) => {
    const preview = t.slice(0, 120).replace(/\n/g, " ").replace(/^[#-]+ /, "");
    return (
      <div className="tr-md-report">
        <div className="tr-md-header" onClick={() => setMdrOpen(!mdrOpen)}>
          <span className={`thinking-chevron ${mdrOpen ? "open" : ""}`}>
            <ChevronSvg />
          </span>
          <span className="tr-md-preview">{preview}&hellip;</span>
        </div>
        <div className={`tr-md-body ${mdrOpen ? "open" : ""}`}>
          <div className="md-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(t) }} />
          <CopyButton text={t} label="Copy markdown" />
        </div>
      </div>
    );
  };

  // Only build body when expanded — skip all expensive markdown/highlight work when collapsed
  if (expanded) {
  // Build special body for "message" tool — speech bubble style
  const isMessageTool = toolName === "message" || toolName === "Message" || toolName === "SendMessage";

  if (isMessageTool) {
    const target = (toolInput.recipient as string) || (toolInput.target as string) || "";
    const content = text || "Sent";
    bodyHtml = (
      <div className="tr-message-bubble">
        {target && <div className="tr-message-target">{target}</div>}
        <div className="tr-message-content">{content === "Sent" ? "Sent" : content.slice(0, 300)}</div>
      </div>
    );
  } else {
    switch (toolName) {
      case "exec":
      case "Bash": {
        const { t, trunc } = truncStr(text, 4000);
        const displayText = showFull ? text : t;
        const lineCount = displayText.split("\n").length;
        const maxH = lineCount > 20 ? 360 : undefined;
        bodyHtml = (
          <>
            {renderTerminal(displayText, maxH)}
            {trunc && !showFull && (
              <button className="show-more" onClick={() => setShowFull(true)}>
                show more ({text.length.toLocaleString()} chars)
              </button>
            )}
          </>
        );
        break;
      }
      case "write":
      case "Write":
      case "edit":
      case "Edit": {
        const fp = (toolInput.file_path as string) || (toolInput.path as string) || "";
        const displayMsg = text.slice(0, 200) || (toolName.toLowerCase() === "write" ? "Written" : "Edited");
        bodyHtml = (
          <div className="tr-success">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {fp ? `${displayMsg}` : displayMsg}
          </div>
        );
        break;
      }
      case "Read": {
        const fp = (toolInput.file_path as string) || (toolInput.path as string) || "";
        const ext = fp ? fileExt(fp) : "";
        const lang = ext ? extToLang(ext) : "";
        const { t, trunc } = truncStr(text, 4000);
        if (lang) {
          bodyHtml = (
            <>
              {renderCodeBlock(showFull ? text : t, lang, 380)}
              {trunc && !showFull && (
                <button className="show-more" onClick={() => setShowFull(true)}>
                  show more ({text.length.toLocaleString()} chars)
                </button>
              )}
            </>
          );
        } else {
          bodyHtml = (
            <>
              {renderTerminal(showFull ? text : t, 380)}
              {trunc && !showFull && (
                <button className="show-more" onClick={() => setShowFull(true)}>
                  show more ({text.length.toLocaleString()} chars)
                </button>
              )}
            </>
          );
        }
        break;
      }
      case "web_search":
      case "WebSearch": {
        try {
          const results = JSON.parse(text);
          if (Array.isArray(results)) {
            bodyHtml = (
              <div className="tr-search-results">
                {results.slice(0, 8).map((r, i) => (
                  <div key={i} className="tr-search-card">
                    <div className="sr-title">
                      <span className="sr-number">{i + 1}.</span> {r.title || ""}
                    </div>
                    <div className="sr-url">{r.url || r.link || ""}</div>
                    <div className="sr-snip">{r.snippet || r.description || ""}</div>
                  </div>
                ))}
              </div>
            );
            break;
          }
        } catch { /* fallthrough */ }
        const { t, trunc } = truncStr(text, 800);
        bodyHtml = (
          <>
            {renderTerminal(showFull ? text : t)}
            {trunc && !showFull && (
              <button className="show-more" onClick={() => setShowFull(true)}>show more</button>
            )}
          </>
        );
        break;
      }
      case "web_fetch":
      case "WebFetch": {
        if (looksLikeMarkdown(text)) {
          bodyHtml = renderMdResult(text);
        } else {
          const { t, trunc } = truncStr(text, 800);
          bodyHtml = (
            <>
              {renderTerminal(showFull ? text : t)}
              {trunc && !showFull && (
                <button className="show-more" onClick={() => setShowFull(true)}>show more</button>
              )}
            </>
          );
        }
        break;
      }
      case "tts": {
        bodyHtml = (
          <div className="tr-success">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            audio delivered
          </div>
        );
        break;
      }
      case "sessions_spawn": {
        try {
          const r = JSON.parse(text);
          const key = r.childSessionKey || "";
          const childId = r.childSessionId || "";
          const status = r.status || "unknown";
          const label = r.label || (key ? key.split(":subagent:")[1] || key.split(":").pop() : "");
          const ok = status === "accepted" || status === "ok";
          bodyHtml = (
            <div className="spawn-nav-card">
              <div className={`spawn-nav-status ${ok ? "" : "err"}`}>
                <span className="dot" />
                {ok ? "subagent dispatched" : "dispatch: " + status}
              </div>
              {key && (
                <div
                  className="spawn-session-btn"
                  onClick={() => onNavigateSession?.(childId || key)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="ssb-body">
                    <div className="ssb-title">{label}</div>
                    <div className="ssb-key">{key.includes(":subagent:") ? key.split(":subagent:")[1] : key.slice(0, 24)}</div>
                  </div>
                  <div className="ssb-arrow-col">
                    <ChevronSvg size={14} />
                  </div>
                </div>
              )}
            </div>
          );
        } catch {
          const { t } = truncStr(text, 300);
          bodyHtml = renderTerminal(t);
        }
        break;
      }
      case "Task":
      case "task": {
        if (looksLikeMarkdown(text)) {
          bodyHtml = renderMdResult(text);
        } else {
          const { t, trunc } = truncStr(text, 600);
          bodyHtml = (
            <>
              {renderTerminal(showFull ? text : t)}
              {trunc && !showFull && (
                <button className="show-more" onClick={() => setShowFull(true)}>show more</button>
              )}
            </>
          );
        }
        break;
      }
      default: {
        if (looksLikeMarkdown(text)) {
          bodyHtml = renderMdResult(text);
        } else {
          const { t, trunc } = truncStr(text, 500);
          bodyHtml = (
            <>
              {renderTerminal(showFull ? text : t)}
              {trunc && !showFull && (
                <button className="show-more" onClick={() => setShowFull(true)}>
                  show more ({text.length.toLocaleString()} chars)
                </button>
              )}
            </>
          );
        }
      }
    }
  }
  } // end if (expanded)

  const summary = getSummary();

  return (
    <div
      className={`tool-result-wrap ${expanded ? "expanded" : ""}`}
      style={{ "--block-accent": accent } as React.CSSProperties}
    >
      <div className="tool-result-header" onClick={() => { setLocalOverride(true); setExpanded(!expanded); }}>
        <span className={`tc-chevron ${expanded ? "open" : ""}`}>
          <ChevronSvg />
        </span>
        <span className="tc-dot" style={{ background: accent }} />
        <span className={`tr-status-inline ${isError ? "err" : ""}`}>
          {toolName || "tool"} {isError ? "error" : "result"}
        </span>
        {!expanded && <span className="tr-summary">{summary}</span>}
      </div>
      {expanded && (
        <div className="tool-result-body">
          {bodyHtml}
          {showTime && <div className="msg-time">{time}</div>}
        </div>
      )}
    </div>
  );
}

// ── User Message ──
function UserMessage({ content, time, showTime }: { content: unknown; time: string; showTime: boolean }) {
  let text = extractText(content);
  text = stripConversationMeta(text);

  // Detect image blocks in user content
  const imageBlocks: React.ReactElement[] = [];
  if (Array.isArray(content)) {
    (content as Record<string, unknown>[]).forEach((block, i) => {
      if (block && block.type === "image") {
        imageBlocks.push(<ImageBlock key={`uimg${i}`} block={block} />);
      }
    });
  }

  if (!text && imageBlocks.length === 0) return null;

  return (
    <div className="msg">
      <div className="msg-user copyable">
        {text && <div className="msg-user-text">{text}</div>}
        {imageBlocks.length > 0 && <div className="msg-image-row">{imageBlocks}</div>}
        {text && <CopyButton text={text} label="Copy text" />}
      </div>
      {showTime && <div className="msg-time">{time}</div>}
    </div>
  );
}

// ── Assistant Message ──
function AssistantMessage({
  content,
  time,
  showTime,
  allThinkingExpanded,
  blockExpansion,
  blockColors,
  autoExpand,
}: {
  content: unknown;
  time: string;
  showTime: boolean;
  allThinkingExpanded: boolean;
  blockExpansion?: BlockExpansion;
  blockColors: BlockColors;
  autoExpand: boolean;
}) {
  if (!content) return null;

  const textParts: React.ReactElement[] = [];
  const toolCallParts: React.ReactElement[] = [];
  const rawMdParts: string[] = [];

  if (typeof content === "string") {
    textParts.push(
      <div key="t0" className="md-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
    );
    rawMdParts.push(content);
    // Detect embedded images in text
    const imgs = extractImagesFromText(content);
    for (let idx = 0; idx < imgs.length; idx++) {
      textParts.push(<ImageThumbnail key={`img-s-${idx}`} src={imgs[idx]} />);
    }
  } else if (Array.isArray(content)) {
    (content as Record<string, unknown>[]).forEach((block, i) => {
      if (!block) return;
      if (block.type === "image") {
        textParts.push(<ImageBlock key={`img${i}`} block={block} />);
      } else if (block.type === "text" && block.text) {
        textParts.push(
          <div key={`t${i}`} className="md-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(block.text as string) }} />
        );
        rawMdParts.push(block.text as string);
        // Detect embedded images in text blocks
        const imgs = extractImagesFromText(block.text as string);
        for (let idx = 0; idx < imgs.length; idx++) {
          textParts.push(<ImageThumbnail key={`img-t${i}-${idx}`} src={imgs[idx]} />);
        }
      } else if (block.type === "thinking" && block.thinking) {
        textParts.push(
          <ThinkingBlock
            key={`th${i}`}
            text={block.thinking as string}
            forceOpen={allThinkingExpanded}
            accentColor={blockColors.thinking}
          />
        );
      } else if (block.type === "tool_use") {
        const catKey = toolColorKey((block.name as string) || "") as BlockCategory;
        toolCallParts.push(
          <ToolCallBlock key={`tc${i}`} block={block} blockColors={blockColors} autoExpand={autoExpand} globalExpand={catKey && blockExpansion ? blockExpansion[catKey] : undefined} />
        );
      } else if (block.type === "toolCall") {
        const catKey = toolColorKey((block.name as string) || "") as BlockCategory;
        toolCallParts.push(
          <ToolCallBlock
            key={`tc${i}`}
            block={{ id: block.id, name: block.name, input: block.arguments || block.input || {} }}
            blockColors={blockColors}
            autoExpand={autoExpand}
            globalExpand={catKey && blockExpansion ? blockExpansion[catKey] : undefined}
          />
        );
      } else {
        const fallbackText = (block.text as string) || (block.content as string) || "";
        if (fallbackText) {
          textParts.push(
            <div key={`t${i}`} className="md-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(fallbackText) }} />
          );
          rawMdParts.push(fallbackText);
        }
      }
    });
  } else if (typeof content === "object" && content !== null) {
    const obj = content as Record<string, unknown>;
    const fallbackText = (obj.text as string) || (obj.content as string) || "";
    if (fallbackText) {
      textParts.push(
        <div key="t0" className="md-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(fallbackText) }} />
      );
      rawMdParts.push(fallbackText);
    }
  }

  if (!textParts.length && !toolCallParts.length) return null;

  const combinedMd = rawMdParts.join("\n\n");

  return (
    <>
      {textParts.length > 0 && (
        <div className="msg">
          <div className="msg-assistant copyable">
            <div className="msg-text">{textParts}</div>
            <CopyButton text={combinedMd} label="Copy as markdown" />
          </div>
          {showTime && <div className="msg-time">{time}</div>}
        </div>
      )}
      {toolCallParts}
    </>
  );
}

// ── Event renderers ──
function CompactionEvent({ entry }: { entry: NormalizedMessage }) {
  const [open, setOpen] = useState(false);
  const summary = entry.summary || "";

  return (
    <div className="event-divider">
      <div className="event-inner" onClick={() => setOpen(!open)}>
        context compacted
        {summary && <div className={`event-summary ${open ? "open" : ""}`}>{summary}</div>}
      </div>
    </div>
  );
}

function ModelChangeEvent({ entry }: { entry: NormalizedMessage }) {
  const model = entry.modelId || "?";
  const provider = entry.provider || "";
  const label = model.replace(/^(global\.|anthropic\.)/, "").replace(/-v\d+$/, "");

  return (
    <div className="event-divider">
      <div className="model-inner">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className="model-name">{label}</span>
        {provider && (
          <>
            <span className="model-sep">&middot;</span>
            <span className="model-extra">{provider}</span>
          </>
        )}
      </div>
    </div>
  );
}

function CustomEvent({ entry }: { entry: NormalizedMessage }) {
  const customType = entry.customType || "";
  const data = entry.data || {};

  const skip = new Set(["openclaw.cache-ttl"]);
  if (skip.has(customType)) return null;

  if (customType === "model-snapshot") {
    const model = (data.modelId as string) || "?";
    const provider = (data.provider as string) || "";
    const label = model.replace(/^(global\.|anthropic\.)/, "").replace(/-v\d+$/, "");
    return (
      <div className="event-divider">
        <div className="model-inner">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span className="model-name">{label}</span>
          {provider && (
            <>
              <span className="model-sep">&middot;</span>
              <span className="model-extra">{provider}</span>
            </>
          )}
        </div>
      </div>
    );
  }

  if (customType === "openclaw:prompt-error") {
    const msg = String((data.message as string) || (data.error as string) || customType).slice(0, 120);
    return (
      <div className="event-divider">
        <div className="model-inner">
          <span className="model-error">{msg}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="event-pill">{customType || "custom"}</div>
  );
}

function ThinkingLevelChange({ entry }: { entry: NormalizedMessage }) {
  const level = entry.thinkingLevel || "?";
  return (
    <div className="event-divider">
      <div className="model-inner">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          <path d="M8 2C5.2 2 3 4.2 3 7c0 1.8 1 3.4 2.5 4.3V13h5v-1.7C12 10.4 13 8.8 13 7c0-2.8-2.2-5-5-5z" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        <span className="model-extra">thinking:</span>
        <span className="model-name">{level}</span>
      </div>
    </div>
  );
}

// ── Main renderer ──
function MessageRenderer({
  entry,
  allThinkingExpanded,
  blockExpansion,
  blockColors,
  settings,
  toolInputsMap,
  onNavigateSession,
}: {
  entry: NormalizedMessage;
  allThinkingExpanded: boolean;
  blockExpansion?: BlockExpansion;
  blockColors: BlockColors;
  settings: { showTimestamps: boolean; autoExpandToolCalls: boolean };
  toolInputsMap?: Map<string, Record<string, unknown>>;
  onNavigateSession?: (key: string) => void;
}) {
  const t = entry.type;

  if (t === "compaction") return <CompactionEvent entry={entry} />;
  if (t === "model_change") return <ModelChangeEvent entry={entry} />;
  if (t === "thinking_level_change") return <ThinkingLevelChange entry={entry} />;
  if (t === "custom") return <CustomEvent entry={entry} />;

  if (t !== "message") {
    if (t && !["session", "summary"].includes(t)) {
      return <div className="event-pill">{t}</div>;
    }
    return null;
  }

  const msg = entry.message;
  if (!msg) return null;

  const role = msg.role;
  const time = fmtTime(entry.timestamp);
  const showTime = settings.showTimestamps;

  if (role === "user") return <UserMessage content={msg.content} time={time} showTime={showTime} />;
  if (role === "assistant")
    return (
      <AssistantMessage
        content={msg.content}
        time={time}
        showTime={showTime}
        allThinkingExpanded={allThinkingExpanded}
        blockExpansion={blockExpansion}
        blockColors={blockColors}
        autoExpand={settings.autoExpandToolCalls}
      />
    );
  if (role === "toolResult") {
    const catKey = toolColorKey(msg.toolName || "") as BlockCategory;
    return (
      <ToolResultBlock
        msg={msg}
        time={time}
        showTime={showTime}
        blockColors={blockColors}
        autoExpand={settings.autoExpandToolCalls}
        globalExpand={catKey && blockExpansion ? blockExpansion[catKey] : undefined}
        toolInputsMap={toolInputsMap}
        onNavigateSession={onNavigateSession}
      />
    );
  }

  return null;
}

export default React.memo(MessageRenderer);
