"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileImage, Loader2, Send, X } from "lucide-react";
import { createSubmission, type UploadState } from "./actions";

type SubmissionFormProps = {
  clientSlug: string;
};

const maxFiles = 10;
const acceptedFileTypes = "image/*,application/pdf,.heic,.heif";

type PendingFileStatus = "pending" | "uploading" | "error";

type PendingFile = {
  id: string;
  file: File;
  note: string;
  previewUrl: string;
  thumbnailDataUrl: string;
  previewFailed: boolean;
  status: PendingFileStatus;
  errorMessage?: string;
};

function getFileTypeLabel(file: File) {
  if (file.type === "application/pdf") return "PDF";
  if (file.type.includes("heic") || file.type.includes("heif")) return "HEIC";
  if (file.type.includes("png")) return "PNG";
  if (file.type.includes("jpeg") || file.type.includes("jpg")) return "JPG";
  return file.type || "ファイル";
}

function createImageThumbnail(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      resolve("");
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const longestSide = 600;
      const scale = Math.min(1, longestSide / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) {
        resolve("");
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image thumbnail generation failed."));
    };

    image.src = objectUrl;
  });
}

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function SubmissionForm({ clientSlug }: SubmissionFormProps) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [limitMessage, setLimitMessage] = useState("");
  const [summary, setSummary] = useState("");
  const filesRef = useRef<PendingFile[]>([]);
  filesRef.current = files;

  useEffect(() => {
    return () => {
      filesRef.current.forEach((entry) => {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      });
    };
  }, []);

  async function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const availableSlots = maxFiles - filesRef.current.length;
    const accepted = incoming.slice(0, Math.max(0, availableSlots));

    setLimitMessage(
      incoming.length > accepted.length
        ? `1回に添付できるのは${maxFiles}ファイルまでです。超えた分は追加されませんでした。`
        : "",
    );

    if (accepted.length === 0) return;

    const newEntries: PendingFile[] = accepted.map((file) => ({
      id: createId(),
      file,
      note: "",
      previewUrl: "",
      thumbnailDataUrl: "",
      previewFailed: false,
      status: "pending",
    }));

    setFiles((prev) => [...prev, ...newEntries]);

    for (const entry of newEntries) {
      if (!entry.file.type.startsWith("image/")) continue;

      try {
        const objectUrl = URL.createObjectURL(entry.file);
        const thumbnail = await createImageThumbnail(entry.file);
        setFiles((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? { ...item, previewUrl: objectUrl, thumbnailDataUrl: thumbnail }
              : item,
          ),
        );
      } catch (error) {
        console.warn("Failed to prepare file preview", error);
        setFiles((prev) =>
          prev.map((item) =>
            item.id === entry.id ? { ...item, previewFailed: true } : item,
          ),
        );
      }
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  function updateNote(id: string, note: string) {
    setFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, note } : item)),
    );
  }

  async function handleSubmit() {
    if (isSubmitting || filesRef.current.length === 0) return;

    setIsSubmitting(true);
    setSummary("");

    const targets = filesRef.current;
    let successCount = 0;
    let errorCount = 0;

    for (const target of targets) {
      setFiles((prev) =>
        prev.map((item) =>
          item.id === target.id
            ? { ...item, status: "uploading", errorMessage: undefined }
            : item,
        ),
      );

      const formData = new FormData();
      formData.append("transactionNote", target.note);
      formData.append("receiptFile", target.file);
      formData.append("thumbnailDataUrl", target.thumbnailDataUrl);

      try {
        const result: UploadState = await createSubmission(
          clientSlug,
          { status: "idle", message: "" },
          formData,
        );

        if (result.status === "success") {
          successCount += 1;
          if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
          setFiles((prev) => prev.filter((item) => item.id !== target.id));
        } else {
          errorCount += 1;
          setFiles((prev) =>
            prev.map((item) =>
              item.id === target.id
                ? { ...item, status: "error", errorMessage: result.message }
                : item,
            ),
          );
        }
      } catch (error) {
        console.error("Failed to submit receipt", error);
        errorCount += 1;
        setFiles((prev) =>
          prev.map((item) =>
            item.id === target.id
              ? {
                  ...item,
                  status: "error",
                  errorMessage:
                    "送信に失敗しました。時間をおいて再度お試しください。",
                }
              : item,
          ),
        );
      }
    }

    setIsSubmitting(false);
    setSummary(
      errorCount > 0
        ? `${successCount}件送信しました。${errorCount}件は失敗しました。内容を確認して再送信してください。`
        : `${successCount}件の送信が完了しました。`,
    );
  }

  return (
    <div className="upload-panel">
      {summary && (
        <div className="success-banner compact">
          <CheckCircle2 size={18} />
          <span>{summary}</span>
        </div>
      )}

      <label
        className={isDraggingOver ? "file-drop dragging" : "file-drop"}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDraggingOver(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept={acceptedFileTypes}
          multiple
          disabled={isSubmitting || files.length >= maxFiles}
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <span className="file-icon" aria-hidden="true">
          <FileImage size={32} />
        </span>
        <strong>画像またはPDFを選択・ドラッグ&ドロップ</strong>
        <small>
          JPG, PNG, HEIC, PDF / 1回に最大{maxFiles}ファイル（選択中:{" "}
          {files.length}/{maxFiles}）
        </small>
      </label>

      {limitMessage && <p className="form-error">{limitMessage}</p>}

      {files.length > 0 && (
        <div className="pending-file-list">
          {files.map((entry) => (
            <div
              className={`pending-file-card status-${entry.status}`}
              key={entry.id}
            >
              <div className="pending-file-preview">
                {entry.previewUrl && !entry.previewFailed ? (
                  <img
                    src={entry.previewUrl}
                    alt={`${entry.file.name}のプレビュー`}
                    onError={() =>
                      setFiles((prev) =>
                        prev.map((item) =>
                          item.id === entry.id
                            ? { ...item, previewFailed: true }
                            : item,
                        ),
                      )
                    }
                  />
                ) : (
                  <FileImage size={28} />
                )}
              </div>
              <div className="pending-file-body">
                <div className="pending-file-head">
                  <strong>{entry.file.name}</strong>
                  <small>
                    {getFileTypeLabel(entry.file)} /{" "}
                    {(entry.file.size / 1024).toFixed(1)} KB
                  </small>
                  <button
                    type="button"
                    className="icon-button compact"
                    aria-label="このファイルを取り消す"
                    onClick={() => removeFile(entry.id)}
                    disabled={entry.status === "uploading"}
                  >
                    <X size={16} />
                  </button>
                </div>
                <textarea
                  rows={3}
                  placeholder="例: 4月分のガソリン代、現金払い"
                  maxLength={1000}
                  value={entry.note}
                  disabled={entry.status === "uploading"}
                  onChange={(event) => updateNote(entry.id, event.target.value)}
                />
                {entry.status === "uploading" && (
                  <small className="muted">
                    <Loader2 className="spin-icon" size={14} /> 送信中...
                  </small>
                )}
                {entry.status === "error" && entry.errorMessage && (
                  <small className="warning-text">{entry.errorMessage}</small>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        className="primary-action"
        type="button"
        disabled={isSubmitting || files.length === 0}
        onClick={handleSubmit}
      >
        <Send size={20} />
        <span>
          {isSubmitting
            ? "送信中..."
            : files.length > 0
              ? `${files.length}件を送信する`
              : "送信する"}
        </span>
      </button>
      <p className="helper-text" aria-live="polite">
        {isSubmitting
          ? "ファイルを保存しています。このままお待ちください。"
          : "複数のファイルをまとめて選択・送信できます。送信後、失敗した分だけ残るので再送信できます。"}
      </p>
    </div>
  );
}
