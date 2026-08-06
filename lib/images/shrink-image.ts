/**
 * アップロード前に画像を上限サイズ以内へ収める。
 *
 * Vercelのサーバーレス関数にはリクエストボディ4.5MBのハードリミットがあり、
 * アプリの設定では引き上げられない。超えると原因の分かりにくいエラーになるため、
 * 送信前にブラウザ側で縮小する。
 *
 * 証憑としての解像度をできるだけ保つため、まず画素数を維持したまま
 * JPEG品質だけを下げ、それでも収まらない場合にのみ長辺を段階的に縮める。
 */

/** Vercelの上限4.5MBに対し、サムネイルやフォーム項目の分の余裕を見た実質上限 */
export const maxUploadBytes = 3_800_000;

/** 品質のみで調整する段階。上から順に試す。 */
const qualitySteps = [0.92, 0.85, 0.78, 0.7];

/**
 * 長辺の上限。null は元の解像度のまま。
 * 2000px を下限としているのは、一般的なレシート幅であれば
 * 200dpi 相当を十分に上回るため。
 */
const longestSideSteps: Array<number | null> = [null, 3000, 2500, 2000];

const shrinkableMimeTypes = ["image/jpeg", "image/png", "image/webp"];

export type ShrinkResult =
  | { status: "unchanged"; file: File }
  | { status: "shrunk"; file: File; originalSize: number }
  | { status: "too_large"; reason: string }
  | { status: "unsupported"; reason: string };

function canAttemptShrink(file: File) {
  // HEIC はブラウザによって読み込めたり読み込めなかったりする。
  // 読み込めれば縮小できるので、ここでは弾かず実際に試す。
  return (
    shrinkableMimeTypes.includes(file.type) ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("この形式の画像はブラウザで読み込めませんでした。"));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

function drawToCanvas(
  image: HTMLImageElement,
  longestSide: number | null,
): HTMLCanvasElement | null {
  const scale =
    longestSide === null
      ? 1
      : Math.min(1, longestSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function replaceExtensionWithJpg(fileName: string) {
  const base = fileName.replace(/\.[a-z0-9]{1,10}$/i, "");
  return `${base || "receipt"}.jpg`;
}

/**
 * 上限を超える画像を縮小する。上限以内ならそのまま返す。
 * 縮小できない形式（PDF等）や、どの段階でも収まらない場合は理由を返す。
 */
export async function shrinkImageForUpload(file: File): Promise<ShrinkResult> {
  if (file.size <= maxUploadBytes) {
    return { status: "unchanged", file };
  }

  if (!canAttemptShrink(file)) {
    return {
      status: "unsupported",
      reason:
        file.type === "application/pdf"
          ? "PDFはアプリ側で縮小できません。ファイルサイズを小さくしてから送信してください。"
          : "この形式のファイルはアプリ側で縮小できません。ファイルサイズを小さくしてから送信してください。",
    };
  }

  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch (error) {
    console.warn("Failed to load image for shrinking", error);
    return {
      status: "unsupported",
      reason:
        "この画像はブラウザで読み込めないため縮小できませんでした。JPEG形式で保存し直してから送信してください。",
    };
  }

  // 解像度をできるだけ落とさないよう、まず品質だけで調整し、
  // 収まらない場合にのみ長辺を段階的に縮める。
  for (const longestSide of longestSideSteps) {
    const canvas = drawToCanvas(image, longestSide);
    if (!canvas) break;

    for (const quality of qualitySteps) {
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) continue;
      if (blob.size <= maxUploadBytes) {
        return {
          status: "shrunk",
          originalSize: file.size,
          file: new File([blob], replaceExtensionWithJpg(file.name), {
            type: "image/jpeg",
            lastModified: file.lastModified,
          }),
        };
      }
    }
  }

  return {
    status: "too_large",
    reason:
      "画像を縮小しましたが、送信できるサイズまで小さくできませんでした。撮影し直すか、別の方法で保存してから送信してください。",
  };
}
