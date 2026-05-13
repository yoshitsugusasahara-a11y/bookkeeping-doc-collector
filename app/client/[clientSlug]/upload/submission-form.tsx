"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileImage, Send } from "lucide-react";
import { createSubmission } from "./actions";

type SubmissionFormProps = {
  clientSlug: string;
};

function getFileTypeLabel(file: File) {
  if (file.type === "application/pdf") return "PDF";
  if (file.type.includes("heic") || file.type.includes("heif")) return "HEIC";
  if (file.type.includes("png")) return "PNG";
  if (file.type.includes("jpeg") || file.type.includes("jpg")) return "JPG";
  return file.type || "ファイル";
}

export function SubmissionForm({ clientSlug }: SubmissionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const previewUrlRef = useRef("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createSubmission.bind(null, clientSlug),
    { status: "idle" as const, message: "" },
  );

  const selectedFileSize = selectedFile
    ? `${(selectedFile.size / 1024).toFixed(1)} KB`
    : "";
  const selectedFileType = selectedFile ? getFileTypeLabel(selectedFile) : "";
  const isImageFile = useMemo(
    () => Boolean(selectedFile?.type.startsWith("image/")),
    [selectedFile],
  );

  const clearSelectedFile = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
    setSelectedFile(null);
    setPreviewUrl("");
    setPreviewFailed(false);
  };

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      clearSelectedFile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.message]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const handleFileChange = (file: File | null) => {
    clearSelectedFile();
    if (!file) return;

    setSelectedFile(file);
    if (!file.type.startsWith("image/")) return;

    try {
      const objectUrl = URL.createObjectURL(file);
      previewUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
    } catch (error) {
      console.warn("Failed to prepare file preview", error);
      setPreviewFailed(true);
      setPreviewUrl("");
    }
  };

  return (
    <form ref={formRef} className="upload-panel" action={formAction}>
      {state.status === "success" && (
        <div className="success-banner compact">
          <CheckCircle2 size={18} />
          <span>{state.message}</span>
        </div>
      )}
      <input type="hidden" name="thumbnailDataUrl" value="" />
      <label className="file-drop">
        <input
          name="receiptFile"
          type="file"
          accept="image/*,application/pdf,.heic,.heif"
          required
          disabled={isPending}
          onChange={(event) => {
            handleFileChange(event.target.files?.[0] ?? null);
          }}
        />
        <span className="file-icon" aria-hidden="true">
          <FileImage size={32} />
        </span>
        {previewUrl && !previewFailed && (
          <img
            className="file-preview"
            src={previewUrl}
            alt="選択した画像のプレビュー"
            onError={() => {
              setPreviewFailed(true);
            }}
          />
        )}
        {selectedFile ? (
          <span className="selected-file">
            <strong>{selectedFile.name}</strong>
            <small>
              {selectedFileType} / {selectedFileSize}
            </small>
            {isImageFile && previewFailed && (
              <small>この画像形式はプレビューできませんが、送信できます。</small>
            )}
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
