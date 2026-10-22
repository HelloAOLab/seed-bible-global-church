// A PICTURE FIELD — the old PhotoChooser + crop dialogs: choose a new picture (then crop it to the field's shape:
// a round profile picture, a 4:3 cover, a square logo that may zoom out) or one uploaded before, from your gallery.
// The cropped picture is uploaded like any file (state/library/files.ts); an earlier one is reused as it is.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  MAX_ZOOM,
  clampPan,
  placement,
  type CropTarget,
} from "../../state/library/crop";

/** The pictures a field takes, by extension and type. */

export function CropDialog({
  file,
  target,
  title,
  confirmLabel,
  onCropped,
  onCancel,
}: {
  file: Blob;
  target: CropTarget;
  title: string;
  confirmLabel: string;
  onCropped: (f: File) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    pan: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () =>
      setError(
        t("crop-unreadable", {
          defaultValue: "That file is not a picture this browser can open.",
        })
      );
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const c = canvas.current?.getContext("2d");
    if (!c || !img) return;
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    const p = placement(size, target, zoom, pan);
    c.clearRect(0, 0, target.previewWidth, target.previewHeight);
    c.drawImage(img, p.dx, p.dy, p.dw, p.dh);
  }, [img, zoom, pan.x, pan.y]);

  const size = img
    ? { width: img.naturalWidth, height: img.naturalHeight }
    : null;
  const setZoomKept = (z: number) => {
    setZoom(z);
    if (size) setPan(clampPan(size, target, z, pan));
  };

  const confirm = async () => {
    if (!img || !size) return;
    setBusy(true);
    setError(null);
    try {
      const out = document.createElement("canvas");
      out.width = target.width;
      out.height = target.height;
      const p = placement(
        size,
        target,
        zoom,
        pan,
        target.width / target.previewWidth
      );
      out.getContext("2d")!.drawImage(img, p.dx, p.dy, p.dw, p.dh);
      const blob = await new Promise<Blob | null>((r) =>
        out.toBlob(r, target.mimeType, target.quality)
      );
      if (!blob) throw new Error("could not encode the picture");
      await onCropped(
        new File([blob], target.fileName, { type: target.mimeType })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sb-share-overlay sb-crop-overlay" onClick={onCancel}>
      <div
        className="sb-share-dialog sb-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        <div
          className={`sb-crop-window${target.round ? " sb-crop-window-round" : ""}`}
          style={{
            width: `${target.previewWidth}px`,
            height: `${target.previewHeight}px`,
          }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, pan };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || !size) return;
            setPan(
              clampPan(size, target, zoom, {
                x: d.pan.x + e.clientX - d.x,
                y: d.pan.y + e.clientY - d.y,
              })
            );
          }}
          onPointerUp={() => (drag.current = null)}
          onWheel={(e) => {
            e.preventDefault();
            setZoomKept(
              Math.max(
                target.minZoom,
                Math.min(MAX_ZOOM, zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))
              )
            );
          }}
        >
          <canvas
            ref={canvas}
            className="sb-crop-canvas"
            width={target.previewWidth}
            height={target.previewHeight}
          />
        </div>
        <label className="sb-crop-zoom">
          <span className="material-symbols-outlined" aria-hidden="true">
            zoom_out
          </span>
          <input
            type="range"
            min={target.minZoom}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            aria-label={t("zoom", { defaultValue: "Zoom" })}
            onInput={(e) =>
              setZoomKept(Number((e.target as HTMLInputElement).value))
            }
          />
          <span className="material-symbols-outlined" aria-hidden="true">
            zoom_in
          </span>
        </label>
        <p className="sb-small sb-muted">
          {t("crop-hint", {
            defaultValue: "Drag the picture to move it; zoom to fit.",
          })}
        </p>
        {error && <p className="sb-error sb-small">{error}</p>}
        <div className="sb-note-card-actions">
          <button
            type="button"
            className="sb-note-button sb-note-button-primary sb-crop-confirm"
            disabled={!img || busy}
            onClick={() => void confirm()}
          >
            {busy
              ? t("uploading", { defaultValue: "Uploading..." })
              : confirmLabel}
          </button>
          <button
            type="button"
            className="sb-note-button"
            onClick={onCancel}
            disabled={busy}
          >
            {t("cancel", { defaultValue: "Cancel" })}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pictures uploaded before, newest first: one picked is used again without uploading. */
function EarlierPictures({
  state,
  onPick,
  onClose,
}: {
  state: ReaderState;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const images = state.files.gallery
    .live()
    .filter((g) => g.contentType.startsWith("image/"))
    .slice(0, 24);
  useEffect(() => void state.files.gallery.refresh(), []);
  return (
    <div className="sb-share-overlay" onClick={onClose}>
      <div
        className="sb-share-dialog sb-gallery-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("earlier-pictures", { defaultValue: "Earlier pictures" })}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{t("earlier-pictures", { defaultValue: "Earlier pictures" })}</h3>
        {!images.length && (
          <p className="sb-small sb-muted">
            {t("earlier-pictures-none", {
              defaultValue: "Pictures you upload are kept here to use again.",
            })}
          </p>
        )}
        <div className="sb-gallery-grid">
          {images.map((g) => (
            <button
              key={g["@id"]}
              type="button"
              className="sb-gallery-item"
              aria-label={g.label ?? g.url}
              onClick={() => onPick(g.url)}
            >
              <img src={g.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
        <div className="sb-note-card-actions">
          <button type="button" className="sb-note-button" onClick={onClose}>
            {t("close", { defaultValue: "Close" })}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A "choose a picture" button (crop, then upload) and an "Earlier pictures" button; `onPicked` gets the URL. */
export function PictureField({
  state,
  target,
  label,
  cropTitle,
  disabled,
  onPicked,
}: {
  state: ReaderState;
  target: CropTarget;
  label: string;
  cropTitle: string;
  disabled?: boolean;
  onPicked: (url: string) => Promise<unknown> | void;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notPicture, setNotPicture] = useState<string | null>(null);
  return (
    <>
      <label
        className={`sb-note-button sb-picture-pick${disabled ? " sb-disabled" : ""}${dragging ? " sb-picture-drop" : ""}`}
        title={t("picture-drop-hint", {
          defaultValue: "Choose a picture, or drop one here",
        })}
        // A picture dropped on the button needs no file dialog at all (the system one can be slow to appear).
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer?.files?.[0];
          if (!disabled && f && f.type.startsWith("image/")) setFile(f);
        }}
      >
        {state.files.uploading.value ? "…" : label}
        <input
          type="file"
          // NO TYPE FILTER: with one ("image/*", or even a list of extensions) Chrome on Windows looked the types up
          // before showing the dialog — seconds to minutes, the page frozen meanwhile. The file is checked here instead.
          hidden
          disabled={disabled}
          onChange={(e) => {
            const input = e.target as HTMLInputElement;
            const f = input.files?.[0];
            input.value = "";
            if (!f) return;
            if (!f.type.startsWith("image/"))
              setNotPicture(
                t("picture-not-image", {
                  defaultValue:
                    "That file is not a picture — choose a JPEG, PNG, GIF or WebP.",
                })
              );
            else {
              setNotPicture(null);
              setFile(f);
            }
          }}
        />
      </label>
      <button
        type="button"
        className="sb-note-button sb-picture-earlier"
        disabled={disabled}
        onClick={() => setChoosing(true)}
      >
        {t("earlier-pictures", { defaultValue: "Earlier pictures" })}
      </button>
      {notPicture && (
        <span className="sb-small sb-pane-error">{notPicture}</span>
      )}
      {file && (
        <CropDialog
          file={file}
          target={target}
          title={cropTitle}
          confirmLabel={t("crop-use", { defaultValue: "Use picture" })}
          onCancel={() => setFile(null)}
          onCropped={async (f) => {
            const img = await state.files.upload(f);
            await onPicked(img.url);
            setFile(null);
          }}
        />
      )}
      {choosing && (
        <EarlierPictures
          state={state}
          onClose={() => setChoosing(false)}
          onPick={(url) => {
            setChoosing(false);
            void onPicked(url);
          }}
        />
      )}
    </>
  );
}
