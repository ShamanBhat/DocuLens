'use client';

import { memo, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CitationChip } from '@/components/citation-chip';
import { linkifyCitations, parseCitationHref } from '@/lib/documents/citations';

const REMARK_PLUGINS = [remarkGfm];

// react-markdown never renders raw HTML, so model output cannot inject markup.
const COMPONENTS: Components = {
  a: ({ href, children }) => {
    const citation = parseCitationHref(href);
    if (citation) return <CitationChip citation={citation} />;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
};

/** Renders an assistant answer as Markdown, turning `[D1 p.12 §4.2]` citations into clickable chips. */
export const MarkdownMessage = memo(function MarkdownMessage({ content }: { content: string }) {
  const markdown = useMemo(() => linkifyCitations(content), [content]);
  return (
    <div className="doculens-prose">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {markdown}
      </Markdown>
    </div>
  );
});
