import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  addPdfTableBlockAfter,
  addPdfTextBlockAfter,
  isDocxBinary,
  layoutPages,
  loadPdfContent,
  paperBox,
  patchPdfText,
  PDF_PAGE_MARK,
  PDF_PAGES_MARK,
  removePdfBlock,
  serializePdfDocument,
  textLook,
  updatePdfText,
  type PdfBlock,
  type PdfCell,
  type PdfDocument,
  type PdfTextBlock,
} from "@/lib/pdf/document";
import { exportDocxDocument } from "@/lib/pdf/export-docx";
import { importDocx } from "@/lib/pdf/import-docx";
import { applyPdfTemplate, PDF_TEMPLATES, type PdfTemplateId } from "@/lib/pdf/templates";
import { FormatBar, PdfTable } from "./PdfTable";
import "./pdf-editor.css";

interface PdfEditorProps {
  content: string;
  filePath: string;
  onSave: (path: string, content: string) => void;
  onContentChange: (content: string, path?: string) => void;
  onClose?: () => void;
}

function downloadName(path: string): string {
  const base = path.split("/").pop() || "文档";
  return base.replace(/\.(docx|pdf)$/i, "") + ".docx";
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 4.5h10M6.5 4.5V3.2h3V4.5M4.2 4.5l.6 8.2h6.4l.6-8.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function useDismiss(open: boolean, ref: { current: HTMLElement | null }, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}

function fitTextHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function TextBlock({ block, onChange, onPatch }: {
  block: PdfTextBlock;
  onChange: (text: string) => void;
  onPatch: (patch: Partial<PdfCell>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const look = textLook(block);
  useLayoutEffect(() => {
    if (ref.current) fitTextHeight(ref.current);
  }, [block.text, block.size, block.bold, block.fontPt, block.linePx, block.fontFamily]);
  return (
    <div className="work-pdf-text-wrap">
      <FormatBar cell={block} onPatch={onPatch} />
      <textarea
        ref={ref}
        rows={1}
        className="work-pdf-text"
        value={block.text}
        onChange={(event) => {
          fitTextHeight(event.target);
          onChange(event.target.value);
        }}
        style={look}
      />
    </div>
  );
}

function blockFrameStyle(block: PdfBlock): CSSProperties | undefined {
  if (block.type === "image") return { padding: 0 };
  if (block.type !== "text") return undefined;
  if (block.spaceBefore == null && block.spaceAfter == null) return undefined;
  return {
    marginTop: block.spaceBefore ?? 0,
    marginBottom: block.spaceAfter ?? 0,
    padding: 0,
  };
}

function showText(text: string, page: number, pages: number): string {
  return text.split(PDF_PAGE_MARK).join(String(page)).split(PDF_PAGES_MARK).join(String(pages));
}

function BlockView({
  doc, block, commit, preview,
}: {
  doc: PdfDocument;
  block: PdfDocument["blocks"][number];
  commit: (next: PdfDocument) => void;
  preview: (next: PdfDocument) => void;
}) {
  const plusRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  useDismiss(open, plusRef, close);
  return (
    <section className={`work-pdf-block${open ? " is-open" : ""}`} style={blockFrameStyle(block)}>
      <button
        type="button"
        className="work-pdf-remove"
        aria-label="删除此块"
        title="删除此块"
        onClick={() => commit(removePdfBlock(doc, block.id))}
      >
        <TrashIcon />
      </button>
      {block.type === "text" ? (
        <TextBlock
          block={block}
          onChange={(text) => commit(updatePdfText(doc, block.id, text))}
          onPatch={(patch) => commit(patchPdfText(doc, block.id, patch))}
        />
      ) : block.type === "image" ? (
        <img className="work-pdf-image" src={block.src} alt="" style={{ width: block.width, aspectRatio: `${block.width} / ${block.height}` }} />
      ) : block.type === "table" ? (
        <PdfTable doc={doc} block={block} onCommit={commit} onPreview={preview} />
      ) : null}
      <div className="work-pdf-plus-wrap" ref={plusRef}>
        <button type="button" className="work-pdf-plus" aria-label="插入内容" onClick={() => setOpen((value) => !value)}>
          <PlusIcon />
        </button>
        {open && (
          <div className="work-pdf-menu">
            <button type="button" onClick={() => { setOpen(false); commit(addPdfTextBlockAfter(doc, block.id)); }}>文字</button>
            <button type="button" onClick={() => { setOpen(false); commit(addPdfTableBlockAfter(doc, block.id)); }}>表格</button>
          </div>
        )}
      </div>
    </section>
  );
}

function StoryView({ blocks, page, pages }: { blocks: PdfBlock[]; page: number; pages: number }) {
  return (
    <>
      {blocks.map((block) => {
        if (block.type === "image") {
          return <img key={block.id} className="work-pdf-image" src={block.src} alt="" style={{ width: block.width, aspectRatio: `${block.width} / ${block.height}` }} />;
        }
        if (block.type === "text") {
          return <p key={block.id} className="work-pdf-chrome-text" style={textLook(block)}>{showText(block.text, page, pages)}</p>;
        }
        if (block.type !== "table") return null;
        return (
          <table key={block.id} className="work-pdf-chrome-table">
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, colIndex) => (
                    <td key={colIndex} style={{ ...textLook(cell), background: cell.fill }}>{showText(cell.text, page, pages)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </>
  );
}

function DocumentPages({
  doc, paperRef, commit, preview,
}: {
  doc: PdfDocument;
  paperRef: { current: HTMLDivElement | null };
  commit: (next: PdfDocument) => void;
  preview: (next: PdfDocument) => void;
}) {
  const pages = useMemo(() => layoutPages(doc), [doc]);
  const box = paperBox(doc);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const scroll = frameRef.current?.parentElement;
    if (!scroll) return;
    const fit = () => {
      const available = scroll.clientWidth - 56;
      setScale(Math.min(1, available / box.width));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [box.width]);
  return (
    <div className="work-pdf-pages" ref={frameRef}>
      {pages.map((blocks, index) => {
        const header = index === 0 && doc.firstHeader?.length ? doc.firstHeader : doc.header;
        const footer = index === 0 && doc.firstFooter?.length ? doc.firstFooter : doc.footer;
        const backdrop = index === 0 && doc.firstBackdrop?.length ? doc.firstBackdrop : doc.backdrop;
        const sheet = { width: Math.round(box.width * scale), height: Math.round(box.height * scale) };
        return (
          <div key={blocks[0]?.id ?? `page-${index}`} className="work-pdf-sheet" style={sheet}>
          <div
            className="work-pdf-paper"
            ref={index === 0 ? paperRef : undefined}
            style={{ width: box.width, height: box.height, minHeight: box.height, display: "flex", flexDirection: "column", overflow: "hidden", transform: `scale(${scale})`, transformOrigin: "top left" }}
          >
            {backdrop?.map((picture, pictureIndex) => (
              <img
                key={pictureIndex}
                className="work-pdf-backdrop"
                src={picture.src}
                alt=""
                style={{ left: picture.x, top: picture.y, width: picture.width, height: picture.height }}
              />
            ))}
            {header && header.length > 0 && (
              <div className="work-pdf-header" style={doc.page ? { paddingLeft: doc.page.marginLeft, paddingRight: doc.page.marginRight } : undefined}>
                <StoryView blocks={header} page={index + 1} pages={pages.length} />
              </div>
            )}
            <div
              className="work-pdf-body"
              style={doc.page ? {
                paddingTop: header?.length ? 8 : doc.page.marginTop,
                paddingRight: doc.page.marginRight,
                paddingBottom: doc.page.marginBottom,
                paddingLeft: doc.page.marginLeft,
              } : undefined}
            >
              {blocks.map((block) => (
                <BlockView key={block.type === "table" ? `${block.id}:${block.rowOffset ?? 0}` : block.id} doc={doc} block={block} commit={commit} preview={preview} />
              ))}
            </div>
            {footer && footer.length > 0 && (
              <div className="work-pdf-footer" style={doc.page ? { paddingLeft: doc.page.marginLeft, paddingRight: doc.page.marginRight } : undefined}>
                <StoryView blocks={footer} page={index + 1} pages={pages.length} />
              </div>
            )}
          </div>
          </div>
        );
      })}
    </div>
  );
}

export function PdfEditor({ content, filePath, onSave, onContentChange, onClose }: PdfEditorProps) {
  const incoming = loadPdfContent(content);
  const openingDocx = isDocxBinary(content);
  const contentRef = useRef(content);
  contentRef.current = content;
  const [remote, setRemote] = useState(incoming.kind === "remote" || openingDocx);
  const [binary, setBinary] = useState(incoming.kind === "binary" && !openingDocx);
  const [doc, setDoc] = useState<PdfDocument | null>(incoming.kind === "document" ? incoming.doc : null);
  const [downloading, setDownloading] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templatesRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const closeTemplates = () => setTemplatesOpen(false);
  useDismiss(templatesOpen, templatesRef, closeTemplates);
  const docRef = useRef(doc);
  const paperRef = useRef<HTMLDivElement>(null);
  docRef.current = doc;
  const pathRef = useRef(filePath);
  pathRef.current = filePath;

  useEffect(() => {
    const raw = contentRef.current;
    const next = loadPdfContent(raw);
    if (isDocxBinary(raw)) {
      let cancelled = false;
      setRemote(true);
      setBinary(false);
      setDoc(null);
      setError("");
      void importDocx(raw).then((imported) => {
        if (cancelled || contentRef.current !== raw) return;
        setRemote(false);
        setDoc(imported);
      }).catch((err: unknown) => {
        if (cancelled || contentRef.current !== raw) return;
        setRemote(false);
        setBinary(true);
        setError(err instanceof Error ? err.message : "这份 Word 没能打开");
      });
      return () => { cancelled = true; };
    }
    setError("");
    setRemote(next.kind === "remote");
    setBinary(next.kind === "binary");
    setDoc(next.kind === "document" ? next.doc : null);
    // 正在编辑时 content 每次按键都会变，不能放进依赖，否则光标会被重置。
    // 换文件，或指针换成真正的 Word 文件时，kind 会变，这里才重新装载。
  }, [filePath, incoming.kind]);

  const commit = (next: PdfDocument) => {
    setDoc(next);
    setBinary(false);
    const raw = serializePdfDocument(next);
    onContentChange(raw, pathRef.current);
    onSave(pathRef.current, raw);
  };
  const preview = (next: PdfDocument) => setDoc(next);
  const pickTemplate = (id: PdfTemplateId) => {
    const current = docRef.current;
    if (!current) return;
    setTemplatesOpen(false);
    commit(applyPdfTemplate(current, id));
  };

  const download = async () => {
    const current = docRef.current;
    if (!current) return;
    setDownloading(true);
    setError("");
    try {
      const blob = await exportDocxDocument(current);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadName(pathRef.current);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "下载失败");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="work-pdf-editor flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-2 border-b border-[var(--app-border)] min-w-0">
        <span className="text-xs font-medium truncate text-[var(--app-text-secondary)] min-w-0">{filePath}</span>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {error && <span className="text-[10px] text-[var(--app-red)]">{error}</span>}
          <div className="relative" ref={templatesRef}>
            <button
              type="button"
              title="模板"
              aria-label="模板"
              aria-expanded={templatesOpen}
              disabled={!doc}
              onClick={() => setTemplatesOpen((value) => !value)}
              className="h-6 px-2 rounded flex items-center gap-1 text-[11px] hover:bg-[var(--app-accent-bg)] transition-colors disabled:opacity-40"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1" />
                <rect x="14" y="3" width="7" height="5" rx="1" />
                <rect x="14" y="12" width="7" height="9" rx="1" />
                <rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
              模板
            </button>
            {templatesOpen && (
              <div className="work-pdf-templates" role="menu" aria-label="页面模板">
                <p className="work-pdf-templates-title">页面模板</p>
                <div className="work-pdf-templates-grid">
                  {PDF_TEMPLATES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className="work-pdf-template"
                      onClick={() => pickTemplate(item.id)}
                    >
                      <img className="work-pdf-template-thumb" src={item.thumb} alt="" />
                      <span className="work-pdf-template-name">{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            title="下载"
            aria-label="下载"
            disabled={!doc || downloading}
            onClick={() => { void download(); }}
            className="h-6 px-2 rounded flex items-center gap-1 text-[11px] hover:bg-[var(--app-accent-bg)] transition-colors disabled:opacity-40"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" />
            </svg>
            下载
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--app-red-bg)] transition-colors" title="关闭">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--app-red)" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>
      </div>

      <div className="work-pdf-scroll flex-1 overflow-auto">
        {remote ? (
          <div className="h-full flex items-center justify-center text-sm text-[var(--app-text-tertiary)]">正在打开文件…</div>
        ) : binary || !doc ? (
          <div className="h-full flex items-center justify-center px-8 text-center">
            <div className="max-w-sm space-y-3">
              <p className="text-sm text-[var(--app-text-secondary)]">{error || "这是外部 PDF，这一页打不开里面的版式。"}</p>
            </div>
          </div>
        ) : (
          <DocumentPages doc={doc} paperRef={paperRef} commit={commit} preview={preview} />
        )}
      </div>
    </div>
  );
}
