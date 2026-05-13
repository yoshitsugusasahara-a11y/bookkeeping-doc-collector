"use client";

import { useMemo, useState } from "react";
import { Clipboard, ExternalLink, Link as LinkIcon } from "lucide-react";

type CustomerUrlBuilderProps = {
  baseUrl: string;
};

type CustomerUrlToolsProps = {
  baseUrl: string;
  clientSlug: string;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

function makeClientUrl(baseUrl: string, clientSlug: string) {
  return normalizeBaseUrl(baseUrl) + "/client/" + clientSlug;
}

function makeSlug(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function CustomerUrlTools({ baseUrl, clientSlug }: CustomerUrlToolsProps) {
  const [copied, setCopied] = useState(false);
  const clientUrl = makeClientUrl(baseUrl, clientSlug);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(clientUrl);
    setCopied(true);
  };

  return (
    <div className="customer-url-line">
      <span>{clientUrl}</span>
      <div className="customer-url-actions">
        <button className="icon-button compact" type="button" onClick={copyUrl} aria-label="顧客URLをコピー">
          <Clipboard size={15} />
        </button>
        <a className="icon-button compact" href={clientUrl} target="_blank" rel="noreferrer" aria-label="顧客URLを開く">
          <ExternalLink size={15} />
        </a>
      </div>
      {copied && <small className="copy-status">コピー済み</small>}
    </div>
  );
}

export function CustomerUrlBuilder({ baseUrl }: CustomerUrlBuilderProps) {
  const [customerName, setCustomerName] = useState("");
  const [manualSlug, setManualSlug] = useState("");
  const [copied, setCopied] = useState(false);

  const suggestedSlug = useMemo(() => makeSlug(customerName), [customerName]);
  const slug = manualSlug || suggestedSlug;
  const clientUrl = slug ? makeClientUrl(baseUrl, slug) : "";

  const handleSlugChange = (value: string) => {
    setManualSlug(makeSlug(value));
    setCopied(false);
  };

  const handleCustomerNameChange = (value: string) => {
    setCustomerName(value);
    if (!manualSlug) {
      setCopied(false);
    }
  };

  const copyUrl = async () => {
    if (!clientUrl) {
      return;
    }

    await navigator.clipboard.writeText(clientUrl);
    setCopied(true);
  };

  return (
    <section className="url-builder-panel" id="client-url">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Client URL</p>
          <h2>顧客専用URLを作成</h2>
        </div>
        <span className="auth-icon small" aria-hidden="true">
          <LinkIcon size={22} />
        </span>
      </div>

      <div className="url-builder-grid">
        <label className="field">
          <span>顧客名</span>
          <input
            value={customerName}
            onChange={(event) => handleCustomerNameChange(event.target.value)}
            placeholder="例: 東京商会"
          />
        </label>
        <label className="field">
          <span>URL用ID</span>
          <input
            value={slug}
            onChange={(event) => handleSlugChange(event.target.value)}
            placeholder="例: tokyo-shokai"
          />
        </label>
      </div>

      <div className="generated-url-box">
        <div>
          <small>顧客に送るURL</small>
          <strong>{clientUrl || "URL用IDを入力してください"}</strong>
        </div>
        <div className="url-actions">
          <button className="small-button" type="button" onClick={copyUrl} disabled={!clientUrl}>
            <Clipboard size={16} />
            {copied ? "コピー済み" : "コピー"}
          </button>
          {clientUrl && (
            <a className="icon-button" href={clientUrl} target="_blank" rel="noreferrer" aria-label="顧客URLを開く">
              <ExternalLink size={18} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
