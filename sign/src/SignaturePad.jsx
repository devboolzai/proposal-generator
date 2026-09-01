import { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { BRAND, styles } from "./brand";

// ============================================================
// SIGNATURE PAD
//
// Pointer Events rather than mouse+touch pairs: one code path
// covers a finger, a stylus and a mouse, and setPointerCapture
// keeps the stroke alive when the finger slides off the canvas.
//
// Strokes are kept as points rather than as pixels so the pad
// can be redrawn losslessly when the phone rotates or the
// on-screen keyboard resizes the viewport.
// ============================================================

const LINE_WIDTH = 2.4;
const HEIGHT = 190;

export default function SignaturePad({ ref, onChange, disabled }) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const current = useRef(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Backing store in device pixels, drawing commands in CSS pixels.
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = BRAND.ink;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of strokes.current) {
      if (stroke.length === 1) {
        // A tap still leaves a mark — a dot on an "i" is a legitimate stroke.
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, LINE_WIDTH / 2, 0, Math.PI * 2);
        ctx.fillStyle = BRAND.ink;
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length - 1; i++) {
        // Smooth through the midpoints so a fast finger doesn't look faceted.
        const mid = {
          x: (stroke[i].x + stroke[i + 1].x) / 2,
          y: (stroke[i].y + stroke[i + 1].y) / 2,
        };
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, mid.x, mid.y);
      }
      ctx.lineTo(stroke.at(-1).x, stroke.at(-1).y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    redraw();
    const observer = new ResizeObserver(redraw);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [redraw]);

  const clear = useCallback(() => {
    strokes.current = [];
    redraw();
    onChange?.(false);
  }, [redraw, onChange]);

  useImperativeHandle(
    ref,
    () => ({
      isEmpty: () => strokes.current.length === 0,
      clear,
      toDataURL: () =>
        strokes.current.length ? canvasRef.current.toDataURL("image/png") : null,
    }),
    [clear],
  );

  const pointAt = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handleDown = (event) => {
    if (disabled) return;
    event.preventDefault();
    canvasRef.current.setPointerCapture(event.pointerId);
    current.current = [pointAt(event)];
    strokes.current.push(current.current);
    redraw();
    onChange?.(true);
  };

  const handleMove = (event) => {
    if (!current.current) return;
    event.preventDefault();
    current.current.push(pointAt(event));
    redraw();
  };

  const handleUp = (event) => {
    if (!current.current) return;
    current.current = null;
    canvasRef.current.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: `${HEIGHT}px`,
          background: "#fff",
          border: `2px dashed ${disabled ? "#ccc" : BRAND.purpleSoft}`,
          borderRadius: "10px",
          // Without this the browser claims the gesture for scrolling and the
          // pad never sees a pointermove on a phone.
          touchAction: "none",
          cursor: disabled ? "not-allowed" : "crosshair",
          display: "block",
        }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        aria-label="אזור חתימה"
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
        <span style={{ ...styles.note, fontSize: "12px" }}>
          ניתן לחתום באצבע, בעט או בעכבר
        </span>
        <button
          type="button"
          style={{ ...styles.btn("ghost"), padding: "7px 16px", fontSize: "13px", minHeight: "auto" }}
          onClick={clear}
          disabled={disabled}
        >
          ניקוי
        </button>
      </div>
    </div>
  );
}
