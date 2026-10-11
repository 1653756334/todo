/** 极简 Markdown 渲染：先转义再替换，天然屏蔽原始 HTML 与脚本。 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code class="rounded bg-sunken px-1 py-0.5 font-mono text-[12.5px]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
      const href = safeUrl(url);
      if (!href) return label;
      return `<a href="${href}" target="_blank" rel="noreferrer noopener" class="text-accent underline">${label}</a>`;
    });
}

export function renderMarkdown(source: string): string {
  const escaped = escapeHtml(source.replace(/\r\n/g, "\n"));

  const blocks: string[] = [];
  const withPlaceholders = escaped.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
    blocks.push(`<pre class="overflow-x-auto rounded-[6px] bg-sunken p-3 font-mono text-[12.5px] leading-[1.6]"><code>${code.replace(/^\n/, "")}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });

  const lines = withPlaceholders.split("\n");
  const out: string[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (list.length) {
      out.push(`<ul class="my-2 list-disc pl-5">${list.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      list = [];
    }
  };
  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p class="my-2 first:mt-0">${paragraph.join("<br />")}</p>`);
      paragraph = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const placeholder = /^\u0000(\d+)\u0000$/.exec(line.trim());
    if (placeholder) {
      flushList();
      flushParagraph();
      out.push(blocks[Number(placeholder[1])] ?? "");
      continue;
    }
    const listItem = /^\s*[-*]\s+(.*)$/.exec(line);
    if (listItem) {
      flushParagraph();
      list.push(inline(listItem[1]));
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      flushParagraph();
      const level = heading[1].length;
      const size = level === 1 ? "text-[16px]" : level === 2 ? "text-[15px]" : "text-[14px]";
      out.push(`<h${level} class="mt-4 mb-1 font-semibold ${size}">${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (!line.trim()) {
      flushList();
      flushParagraph();
      continue;
    }
    flushList();
    paragraph.push(inline(line));
  }

  flushList();
  flushParagraph();

  return out.join("");
}
