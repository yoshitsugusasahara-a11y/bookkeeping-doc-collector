/**
 * 送信履歴の絞り込みで使う document_kind の条件。
 *
 * 「レシート以外」は、資料分類ルールに一致したもの（matched_document）と、
 * 一致しなかったもの（unmatched_document）の両方を指す。
 *
 * レシート側を .neq("document_kind", ...) で書くと、分類がまだ終わっていない
 * 資料（document_kind が null）がSQLの三値論理で除外され、どちらの絞り込みにも
 * 現れなくなる。分類前の資料は「レシートかどうか未確定」として未送信側に残す
 * ため、or 条件で明示する。
 */
export const nonReceiptDocumentKinds = [
  "matched_document",
  "unmatched_document",
];

export const receiptOrUnclassifiedFilter =
  "document_kind.is.null,document_kind.eq.receipt";
