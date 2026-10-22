// THE SESSION'S QR CODE — ported from the old SessionQRCode: the share link (with its code) as a scannable picture,
// dark on white whatever the theme (many scanners cannot read an inverted code), with Save to keep or print it.
import { useEffect, useState } from "preact/hooks";
import QRCode from "qrcode";
import { useI18n } from "../../i18n";

const SIZE = 512;
const FILE = "seed-bible-session-qr.png";

export function SessionQRCode({ url }: { url: string }) {
  const { t } = useI18n();
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

  const save = async () => {
    if (!dataUrl) return;
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
  };

  if (failed)
    return (
      <p className="sb-small sb-muted">
        {t("session-qr-failed", {
          defaultValue:
            "The QR code could not be made; share the link instead.",
        })}
      </p>
    );
  return (
    <figure className="sb-session-qr">
      {dataUrl ? (
        <img
          src={dataUrl}
          width={192}
          height={192}
          alt={t("session-qr-alt", {
            defaultValue: "QR code to join this session",
          })}
        />
      ) : (
        <div className="sb-session-qr-placeholder" aria-busy="true" />
      )}
      <figcaption className="sb-small sb-muted">
        {t("session-qr-hint", {
          defaultValue: "Scan to join with the share code.",
        })}{" "}
        <button
          type="button"
          className="sb-note-button"
          disabled={!dataUrl}
          onClick={() => void save()}
        >
          {t("session-qr-save", { defaultValue: "Save image" })}
        </button>
      </figcaption>
    </figure>
  );
}
