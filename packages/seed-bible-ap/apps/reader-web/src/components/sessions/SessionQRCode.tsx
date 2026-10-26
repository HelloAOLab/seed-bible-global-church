// THE SESSION'S QR CODE — the old reader's SessionQRCode: a card with the share link (and its code) as a scannable
// picture, dark on white whatever the theme (many scanners cannot read an inverted code), Save image to keep or print
// it, and a tap on the code for a large "Scan to join" view to hold up across a room.
import { useEffect, useState } from "preact/hooks";
import QRCode from "qrcode";
import { useI18n } from "../../i18n";

const SIZE = 512;
const FILE = "seed-bible-session-qr.png";

function useQr(url: string) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: SIZE,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((d) => !cancelled && (setDataUrl(d), setFailed(false)))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return { dataUrl, failed };
}

async function saveImage(dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], FILE, { type: blob.type });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = FILE;
  a.click();
}

function SaveButton({ dataUrl }: { dataUrl: string | null }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="sb-session-qr-save"
      disabled={!dataUrl}
      onClick={() => dataUrl && void saveImage(dataUrl)}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        ios_share
      </span>
      {t("session-qr-save-image", { defaultValue: "Save image" })}
    </button>
  );
}

function Failed() {
  const { t } = useI18n();
  return (
    <span className="sb-session-qr-error" role="status">
      {t("session-qr-error", {
        defaultValue:
          "Couldn't generate a QR code. Copy the session link to share it instead.",
      })}
    </span>
  );
}

/** The large code, for scanning from across a room. */
function Large({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useI18n();
  const { dataUrl, failed } = useQr(url);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const title = t("session-qr-modal-title", { defaultValue: "Scan to join" });
  return (
    <div className="sb-footnote-modal-overlay" onClick={onClose}>
      <div
        className="sb-footnote-modal"
        role="dialog"
        aria-label={title}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="sb-footnote-modal-header">
          <h3 className="sb-footnote-modal-title">{title}</h3>
          <button
            type="button"
            className="sb-footnote-modal-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="sb-footnote-modal-content">
          {failed ? (
            <Failed />
          ) : (
            <div className="sb-session-qr-large">
              <div className="sb-session-qr-large-code">
                {dataUrl && (
                  <img
                    src={dataUrl}
                    alt={t("session-qr-alt", {
                      defaultValue: "QR code to join this session",
                    })}
                  />
                )}
              </div>
              <span className="sb-session-qr-card-description">
                {t("session-qr-scan-description", {
                  defaultValue:
                    "Opens this passage, in this session, on their phone.",
                })}
              </span>
              <SaveButton dataUrl={dataUrl} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SessionQRCode({ url }: { url: string }) {
  const { t } = useI18n();
  const { dataUrl, failed } = useQr(url);
  const [large, setLarge] = useState(false);
  return (
    <div className="sb-session-qr">
      <div className="sb-session-qr-heading">
        <span className="sb-session-qr-title">
          {t("session-qr-title", { defaultValue: "Share via QR" })}
        </span>
        <span className="sb-session-qr-subtitle">
          {t("session-qr-subtitle", {
            defaultValue: "Let others scan to join this session.",
          })}
        </span>
      </div>
      {failed ? (
        <Failed />
      ) : (
        <div className="sb-session-qr-card">
          <button
            type="button"
            className="sb-session-qr-code"
            disabled={!dataUrl}
            aria-label={t("session-qr-enlarge", {
              defaultValue: "Show a larger QR code",
            })}
            onClick={() => setLarge(true)}
          >
            {dataUrl && (
              <img
                src={dataUrl}
                alt={t("session-qr-alt", {
                  defaultValue: "QR code to join this session",
                })}
              />
            )}
            <span
              className="sb-session-qr-enlarge-icon material-symbols-outlined"
              aria-hidden="true"
            >
              open_in_full
            </span>
          </button>
          <div className="sb-session-qr-info">
            <span className="sb-session-qr-card-title">
              {t("session-qr-scan-to-join", { defaultValue: "Scan to join" })}
            </span>
            <span className="sb-session-qr-card-description">
              {t("session-qr-scan-description", {
                defaultValue:
                  "Opens this passage, in this session, on their phone.",
              })}
            </span>
            <SaveButton dataUrl={dataUrl} />
          </div>
        </div>
      )}
      {large && <Large url={url} onClose={() => setLarge(false)} />}
    </div>
  );
}
