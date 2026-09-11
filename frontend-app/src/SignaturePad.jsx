import React, { useRef, useEffect, useState, useCallback } from "react";
import "./SignaturePad.css";

/**
 * SignaturePad
 * -------------------------------------------------------------------------
 * Lets the mother/guardian sign the ICF directly on a tablet using a
 * stylus/pen (or finger/mouse as a fallback) via the Pointer Events API,
 * which covers pen, touch and mouse input in one handler set.
 *
 * Props:
 *  - value:        existing signature as a base64 PNG data URL (or null)
 *  - onChange:     (dataUrl | null) => void   fired on Save / Clear
 *  - disabled:      when true, pad is read-only (just shows `value`)
 *  - label:         heading text
 */
export default function SignaturePad({ value, onChange, disabled, label }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const lastPoint = useRef(null);

  const [isEmpty, setIsEmpty] = useState(!value);
  const [savedPreview, setSavedPreview] = useState(value || null);

  // Set up canvas backing resolution to match its displayed CSS size,
  // scaled for device pixel ratio so pen strokes are crisp on high-DPI
  // tablets (iPad, Surface, etc).
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const width = rect.width;
    const height = 220;

    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  useEffect(() => {
    if (savedPreview) return; // showing a saved image, no live canvas needed
    setupCanvas();
    const handleResize = () => setupCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPreview, setupCanvas]);

  useEffect(() => {
    setSavedPreview(value || null);
    setIsEmpty(!value);
  }, [value]);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e) => {
    if (disabled) return;
    // Ignore accidental palm/touch contacts on tablets while allowing
    // pen + mouse + genuine single-finger touch.
    if (e.pointerType === "touch" && e.width > 40) return;
    const canvas = canvasRef.current;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    hasStroke.current = true;
    lastPoint.current = getPoint(e);
    e.preventDefault();
  };

  const handlePointerMove = (e) => {
    if (!drawing.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const point = getPoint(e);

    // Pressure-sensitive stroke width when the device reports it (real
    // stylus/pen), falling back to a fixed width for mouse/touch.
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    ctx.lineWidth = 1.4 + pressure * 2.4;

    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPoint.current = point;
    if (isEmpty) setIsEmpty(false);
    e.preventDefault();
  };

  const endStroke = (e) => {
    if (!drawing.current) return;
    drawing.current = false;
    try {
      canvasRef.current.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* no-op */
    }
  };

  const handleClear = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    hasStroke.current = false;
    setIsEmpty(true);
    setSavedPreview(null);
    onChange && onChange(null);
  };

  const handleSave = () => {
    if (disabled || !hasStroke.current) return;
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL("image/png");
    setSavedPreview(dataUrl);
    onChange && onChange(dataUrl);
  };

  const handleRedo = () => {
    // Let the signer re-sign: drop the saved image and show a blank pad.
    if (disabled) return;
    setSavedPreview(null);
    setIsEmpty(true);
    hasStroke.current = false;
    onChange && onChange(null);
  };

  return (
    <div className="signature-pad-container">
      {label && <label className="followup-label">{label}</label>}

      {savedPreview ? (
        <div className="signature-pad-saved">
          <img
            src={savedPreview}
            alt="Captured signature"
            className="signature-pad-saved-img"
          />
          {!disabled && (
            <button
              type="button"
              className="btn btn-secondary signature-pad-btn"
              onClick={handleRedo}
            >
              Re-sign
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="signature-pad-wrap" ref={wrapRef}>
            <canvas
              ref={canvasRef}
              className={`signature-pad-canvas${disabled ? " disabled" : ""}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endStroke}
              onPointerLeave={endStroke}
              onPointerCancel={endStroke}
            />
            {isEmpty && !disabled && (
              <div className="signature-pad-placeholder">
                Sign here with a stylus, finger, or mouse
              </div>
            )}
          </div>
          {!disabled && (
            <div className="signature-pad-buttons">
              <button
                type="button"
                className="btn btn-secondary signature-pad-btn"
                onClick={handleClear}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn btn-primary signature-pad-btn"
                onClick={handleSave}
                disabled={isEmpty}
              >
                Save Signature
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
