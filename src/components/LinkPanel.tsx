import { Clipboard, ExternalLink } from "lucide-react";

type LinkPanelProps = {
  onCopyText: (text?: string, message?: string) => void;
  onOpenUrl: (url?: string) => void;
  preferenceCopyMessage: string;
  realtekPackageUrl?: string;
  repository?: string;
  t: Record<string, string>;
};

export function LinkPanel({
  onCopyText,
  onOpenUrl,
  preferenceCopyMessage,
  realtekPackageUrl,
  repository,
  t,
}: LinkPanelProps) {
  const repositoryLabel = repository?.replace(/^https:\/\/github\.com\//, "") ?? "";

  return (
    <section className="linkPanel">
      <button onClick={() => onOpenUrl(repository)} title={t.github}>
        <span>{t.github}</span>
        <strong>{repositoryLabel}</strong>
        <ExternalLink size={17} />
      </button>
      <button onClick={() => onCopyText(realtekPackageUrl, preferenceCopyMessage)} title={t.preference}>
        <span>{t.preference}</span>
        <strong>{realtekPackageUrl}</strong>
        <Clipboard size={17} />
      </button>
    </section>
  );
}
