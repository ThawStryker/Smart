import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  PDF_COLORS,
  PDF_LAYOUT,
  columnWidths,
  lookLinePx,
  rowFloorPx,
  textLook,
  insertPdfTableColumn,
  insertPdfTableRow,
  patchPdfCell,
  removePdfTableColumn,
  removePdfTableRow,
  resetPdfColumnWidths,
  resizePdfColumns,
  setPdfColumnWidths,
  setPdfRowMinHeight,
  updatePdfCell,
  type PdfAlign,
  type PdfCell,
  type PdfColor,
  type PdfVAlign,
  type PdfDocument,
  type PdfFontSize,
  type PdfTableBlock,
} from "@/lib/pdf/document";

interface PdfTableProps {
  doc: PdfDocument;
  block: PdfTableBlock;
  onCommit: (next: PdfDocument) => void;
  onPreview: (next: PdfDocument) => void;
}

/** 纸张会被缩小以适应窗口。拖动手柄要按排版像素算，不能用屏幕上的缩放尺寸。 */
function layoutScale(el: HTMLElement): number {
  const layout = el.offsetWidth;
  if (!layout) return 1;
  return el.getBoundingClientRect().width / layout || 1;
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

function CellText({ cell, floor, onChange, onFocus }: { cell: PdfCell; floor: number; onChange: (text: string) => void; onFocus: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const look = textLook(cell);
  const fillRow = !cell.vAlign || cell.vAlign === "top";
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.minHeight = "0px";
    el.style.height = "0px";
    const next = fillRow ? Math.max(el.scrollHeight, floor) : el.scrollHeight;
    el.style.minHeight = `${next}px`;
    el.style.height = `${next}px`;
  }, [cell.text, cell.size, cell.fontPt, cell.linePx, cell.fontFamily, cell.vAlign, fillRow, floor]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={cell.text}
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
      style={{
        ...look,
        backgroundColor: "transparent",
        padding: `${PDF_LAYOUT.cellPadY}px ${PDF_LAYOUT.cellPadX}px`,
        paddingLeft: `${PDF_LAYOUT.cellPadX + (cell.indent || 0)}px`,
        lineHeight: `${lookLinePx(cell)}px`,
      }}
    />
  );
}

function AlignIcon({ align }: { align: PdfAlign }) {
  const d = align === "center"
    ? "M1 2.5h12M3 5.5h8M1 8.5h12M4 11.5h6"
    : align === "right"
      ? "M1 2.5h12M5 5.5h8M1 8.5h12M7 11.5h6"
      : "M1 2.5h12M1 5.5h8M1 8.5h12M1 11.5h6";
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function VAlignIcon({ align }: { align: PdfVAlign }) {
  const d = align === "middle"
    ? "M2 1.5v11M12 1.5v11M4 6.5h6M4 4.2h6M4 8.8h6"
    : align === "bottom"
      ? "M2 1.5v11M12 1.5v11M4 10.2h6M4 8h6M4 5.8h6"
      : "M2 1.5v11M12 1.5v11M4 3.8h6M4 6h6M4 8.2h6";
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function DotsIcon({ axis }: { axis: "row" | "col" }) {
  const points = axis === "row" ? [[6, 2.2], [6, 6], [6, 9.8]] : [[2.2, 6], [6, 6], [9.8, 6]];
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      {points.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.15" fill="currentColor" />)}
    </svg>
  );
}

export function FormatBar({ cell, onPatch, vertical }: { cell: Pick<PdfCell, "bold" | "size" | "align" | "vAlign" | "color">; onPatch: (patch: Partial<PdfCell>) => void; vertical?: boolean }) {
  const size = cell.size || "md";
  const align = cell.align || "left";
  const vAlign = cell.vAlign || "top";
  const color = cell.color || "ink";
  return (
    <div className="work-pdf-format" onMouseDown={(event) => {
      event.preventDefault();
      event.currentTarget.parentElement?.querySelector("textarea")?.focus();
    }}>
      <button type="button" tabIndex={-1} aria-label="加粗" className={`work-pdf-bold${cell.bold ? " is-on" : ""}`} onClick={() => onPatch({ bold: !cell.bold })}>B</button>
      <span className="work-pdf-format-sep" />
      {(["sm", "md", "lg"] as PdfFontSize[]).map((item) => (
        <button key={item} type="button" tabIndex={-1} aria-label={item === "sm" ? "小号" : item === "lg" ? "大号" : "正文"} className={size === item ? "is-on" : ""} onClick={() => onPatch({ size: item })}>
          {item === "sm" ? "小" : item === "lg" ? "大" : "中"}
        </button>
      ))}
      <span className="work-pdf-format-sep" />
      {(["left", "center", "right"] as PdfAlign[]).map((item) => (
        <button key={item} type="button" tabIndex={-1} aria-label={item === "left" ? "左对齐" : item === "center" ? "居中" : "右对齐"} className={align === item ? "is-on" : ""} onClick={() => onPatch({ align: item })}>
          <AlignIcon align={item} />
        </button>
      ))}
      {vertical && (
        <>
          <span className="work-pdf-format-sep" />
          {(["top", "middle", "bottom"] as PdfVAlign[]).map((item) => (
            <button
              key={item}
              type="button"
              tabIndex={-1}
              aria-label={item === "top" ? "顶端对齐" : item === "middle" ? "上下居中" : "底端对齐"}
              className={vAlign === item ? "is-on" : ""}
              onClick={() => onPatch({ vAlign: item })}
            >
              <VAlignIcon align={item} />
            </button>
          ))}
        </>
      )}
      <span className="work-pdf-format-sep" />
      {(Object.keys(PDF_COLORS) as PdfColor[]).map((item) => (
        <button
          key={item}
          type="button"
          tabIndex={-1}
          aria-label={item === "ink" ? "墨色" : item === "accent" ? "强调色" : item === "muted" ? "灰色" : "红色"}
          className={`work-pdf-swatch${color === item ? " is-on" : ""}`}
          onClick={() => onPatch({ color: item })}
        >
          <i style={{ background: PDF_COLORS[item] }} />
        </button>
      ))}
    </div>
  );
}

export function PdfTable({ doc, block, onCommit, onPreview }: PdfTableProps) {
  const rowOffset = block.rowOffset ?? 0;
  const source = doc.blocks.find((item) => item.type === "table" && item.id === block.id);
  const rowCount = source && source.type === "table" ? source.rows.length : block.rows.length;
  const frameRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [cuts, setCuts] = useState<number[]>([]);
  const [drag, setDrag] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  useDismiss(menu !== null, frameRef, closeMenu);
  const toggleMenu = (id: string) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setMenu((current) => (current === id ? null : id));
  };

  const widths = columnWidths(block);
  const measure = () => {
    const frame = frameRef.current;
    if (!frame) return;
    const scale = layoutScale(frame);
    const top = frame.getBoundingClientRect().top;
    setCuts(block.rows.map((_, index) => {
      const row = rowRefs.current[index];
      return row ? (row.getBoundingClientRect().bottom - top) / scale : 0;
    }));
  };

  useLayoutEffect(() => {
    measure();
  }, [block]);

  const draggedRef = useRef(false);

  const startColResize = (event: ReactPointerEvent, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const frame = frameRef.current;
    if (!frame) return;
    const span = frame.getBoundingClientRect().width || 1;
    const startX = event.clientX;
    const start = columnWidths(block);
    const base = doc;
    let moved = false;
    let latest = base;
    setDrag(`col-${index}`);
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) > 2) {
        moved = true;
        draggedRef.current = true;
      }
      latest = setPdfColumnWidths(base, block.id, resizePdfColumns(start, index, (ev.clientX - startX) / span));
      onPreview(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (moved) onCommit(latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startRowResize = (event: ReactPointerEvent, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const row = rowRefs.current[index];
    const frame = frameRef.current;
    const scale = frame ? layoutScale(frame) : 1;
    const floor = rowFloorPx(block.rows[index] || []);
    const startH = row ? row.getBoundingClientRect().height / scale : floor;
    const startY = event.clientY;
    const base = doc;
    let moved = false;
    let latest = base;
    setDrag(`row-${index}`);
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > 2) {
        moved = true;
        draggedRef.current = true;
      }
      const height = Math.max(floor, Math.round(startH + (ev.clientY - startY) / scale));
      latest = setPdfRowMinHeight(base, block.id, rowOffset + index, height);
      onPreview(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (moved) onCommit(latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  let colCursor = 0;
  const colCuts = widths.slice(0, -1).map((width, index) => {
    colCursor += width;
    return { index, left: colCursor };
  });

  return (
    <div
      className={`work-pdf-table-frame${drag ? " is-dragging" : ""}${menu ? " is-menu" : ""}`}
      ref={frameRef}
    >
      <table className="work-pdf-table">
        <colgroup>
          {widths.map((width, index) => <col key={index} style={{ width: `${width * 100}%` }} />)}
        </colgroup>
        <tbody>
          {block.rows.map((row, rowIndex) => {
            const absoluteRow = rowOffset + rowIndex;
            const rowMin = block.rowMinHeights?.[rowIndex] ?? 0;
            const floor = Math.max(rowFloorPx(row), rowMin);
            return (
              <tr
                key={absoluteRow}
                ref={(el) => { rowRefs.current[rowIndex] = el; }}
                style={{ height: floor }}
              >
                {row.map((cell, colIndex) => {
                  const Tag = absoluteRow === 0 ? "th" : "td";
                  const rowMenu = menu === `row-${rowIndex}`;
                  const colMenu = menu === `col-${colIndex}`;
                  return (
                    <Tag
                      key={colIndex}
                      className={`work-pdf-cell${cell.vAlign === "middle" ? " is-middle" : cell.vAlign === "bottom" ? " is-bottom" : ""}`}
                      style={{
                        ...(cell.fill ? { background: cell.fill } : {}),
                        verticalAlign: cell.vAlign === "middle" ? "middle" : cell.vAlign === "bottom" ? "bottom" : "top",
                      }}
                      onClick={(event) => {
                        if (event.target instanceof HTMLElement && event.target.closest("textarea, button, .work-pdf-menu")) return;
                        event.currentTarget.querySelector("textarea")?.focus();
                      }}
                    >
                      {colIndex === 0 && (
                        <div className={`work-pdf-row-ops${rowMenu ? " is-open" : ""}`}>
                          <button type="button" className="work-pdf-icon-btn" aria-label="行操作" onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMenu(`row-${rowIndex}`)}>
                            <DotsIcon axis="row" />
                          </button>
                          {rowMenu && (
                            <div className="work-pdf-menu">
                              <button type="button" onClick={() => { setMenu(null); onCommit(insertPdfTableRow(doc, block.id, absoluteRow + 1)); }}>下方插入一行</button>
                              <button type="button" className="is-danger" disabled={rowCount <= 1} onClick={() => { setMenu(null); onCommit(removePdfTableRow(doc, block.id, absoluteRow)); }}>删除此行</button>
                            </div>
                          )}
                        </div>
                      )}
                      {absoluteRow === 0 && (
                        <div className={`work-pdf-col-ops${colMenu ? " is-open" : ""}`}>
                          <button type="button" className="work-pdf-icon-btn" aria-label="列操作" onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMenu(`col-${colIndex}`)}>
                            <DotsIcon axis="col" />
                          </button>
                          {colMenu && (
                            <div className="work-pdf-menu">
                              <button type="button" onClick={() => { setMenu(null); onCommit(insertPdfTableColumn(doc, block.id, colIndex + 1)); }}>右侧插入一列</button>
                              <button type="button" className="is-danger" disabled={(block.rows[0]?.length || 0) <= 1} onClick={() => { setMenu(null); onCommit(removePdfTableColumn(doc, block.id, colIndex)); }}>删除此列</button>
                            </div>
                          )}
                        </div>
                      )}
                      <FormatBar vertical cell={cell} onPatch={(patch) => onCommit(patchPdfCell(doc, block.id, absoluteRow, colIndex, patch))} />
                      <CellText cell={cell} floor={floor} onFocus={closeMenu} onChange={(text) => onCommit(updatePdfCell(doc, block.id, absoluteRow, colIndex, text))} />
                      {cell.pictures?.map((picture, pictureIndex) => (
                        <img key={pictureIndex} className="work-pdf-image" src={picture.src} alt="" style={{ width: picture.width, aspectRatio: `${picture.width} / ${picture.height}` }} />
                      ))}
                    </Tag>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {colCuts.map((cut) => (
        <div
          key={`col-${cut.index}`}
          className={`work-pdf-col-resize${drag === `col-${cut.index}` ? " is-active" : ""}`}
          style={{ left: `${cut.left * 100}%` }}
          title="拖动调整列宽，双击恢复等宽"
          onPointerDown={(event) => startColResize(event, cut.index)}
          onDoubleClick={() => { if (draggedRef.current) { draggedRef.current = false; return; } onCommit(resetPdfColumnWidths(doc, block.id)); }}
        />
      ))}
      {cuts.map((top, index) => (
        <div
          key={`row-${index}`}
          className={`work-pdf-row-resize${drag === `row-${index}` ? " is-active" : ""}`}
          style={{ top }}
          title="拖动调整行高，双击按内容撑开"
          onPointerDown={(event) => startRowResize(event, index)}
          onDoubleClick={() => { if (draggedRef.current) { draggedRef.current = false; return; } onCommit(setPdfRowMinHeight(doc, block.id, rowOffset + index, 0)); }}
        />
      ))}
    </div>
  );
}
