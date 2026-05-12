"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileImage, Send } from "lucide-react";
import { createSubmission } from "./actions";

type SubmissionFormProps = {
  clientSlug: string;
};

export function SubmissionForm({ clientSlug }: SubmissionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState("");
  const [state, formAction, isPending] = useActionState(
    createSubmission.bind(null, clientSlug),
    { status: "idle" as const, message: "" },
  );

  const selectedFileSize = selectedFile
    ? `${(selectedFile.size / 1024).toFixed(1)} KB`
    : "";
  const selectedFileType = selectedFile?.type || "ファイル種別未取得";
  const canPreviewImage =
    selectedFile?.type.startsWith("image/") &&
    !selectedFile.type.includes("heic") &&
    !selectedFile.type.includes("heif");

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setSelectedFile(null);
      setPreviewUrl("");
      setThumbnailDataUrl("");
    }
  }, [state.status, state.message]);

  useEffect(() => {
    if (!selectedFile || !canPreviewImage) {
      setPreviewUrl("");
      setThumbnailDataUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    const image = new Image();
    image.onload = () => {
      const maxSize = 360;
      const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));

      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setThumbnailDataUrl(canvas.toDataURL("image/jpeg", 0.72));
      }

      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      setThumbnailDataUrl("");
    };
    image.src = objectUrl;

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [canPreviewImage, selectedFile]);

  return (
    <form ref={formRef} className="upload-panel" action={formAction}>
      {state.status === "success" && (
        <div className="success-banner compact">
          <CheckCircle2 size={18} />
          <span>{state.message}</span>
        </div>
      )}
      <input type="hidden" name="thumbnailDataUrl" value={thumbnailDataUrl} />
      <label className="file-drop">
        <input
          name="receiptFile"
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
          required
          disabled={isPending}
          onChange={(event) => {
            setSelectedFile(event.target.files?.[0] ?? null);
          }}
        />
        <span className="file-icon" aria-hidden="true">
          <FileImage size={32} />
        </span>
        {previewUrl && (
          <img
            className="file-preview"
            src={previewUrl}
            alt="選択した画像のプレビュー"
          />
        )}
        {selectedFile ? (
          <span className="selected-file">
            <strong>{selectedFile.name}</strong>
            <small>
              {selectedFileType} / {selectedFileSize}
            </small>
          </span>
        ) : (
          <>
            <strong>画像またはPDFを選択</strong>
            <small>JPG, PNG, HEIC, PDF / 1回につき1ファイル</small>
          </>
        )}
      </label>

      <label className="field">
        <span>取引内容</span>
        <textarea
          name="transactionNote"
          rows={6}
          placeholder="例: 4月分のガソリン代、現金払い"
          required
          maxLength={1000}
          disabled={isPending}
        />
      </label>

      <button className="primary-action" type="submit" disabled={isPending}>
        <Send size={20} />
        <span>{isPending ? "送信中..." : "送信する"}</span>
      </button>
      <p className="helper-text" aria-live="polite">
        {isPending
          ? "ファイルを保存しています。このままお待ちください。"
          : "送信後、この画面のまま続けて次の資料を送信できます。"}
      </p>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
