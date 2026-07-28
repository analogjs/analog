import React, { useState } from 'react';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Translate, { translate } from '@docusaurus/Translate';
import clsx from 'clsx';
import styles from './styles.module.css';

const buttonClass = 'button button--sm button--outline button--primary';

export default function DocLlmActions(): JSX.Element {
  const { pathname } = useLocation();
  const {
    siteConfig: { url },
  } = useDocusaurusContext();
  const [copied, setCopied] = useState(false);

  // Each docs page is published as raw Markdown alongside its HTML: index
  // pages as `<path>/index.md`, leaf pages as `<path>.md`.
  const markdownPath = pathname.endsWith('/')
    ? `${pathname}index.md`
    : `${pathname}.md`;
  const markdownUrl = `${url}${markdownPath}`;

  const prompt = translate(
    {
      id: 'theme.docs.llmActions.prompt',
      message:
        'Read {url} so I can ask questions about this AnalogJS documentation page.',
      description: 'The prompt sent to an assistant when opening a docs page',
    },
    { url: markdownUrl },
  );
  const encodedPrompt = encodeURIComponent(prompt);

  const copyMarkdown = async () => {
    try {
      const response = await fetch(markdownPath);
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard/network unavailable; fall back to the "View as Markdown" link.
    }
  };

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={clsx(buttonClass, styles.action)}
        onClick={copyMarkdown}
      >
        {copied ? (
          <Translate
            id="theme.docs.llmActions.copied"
            description="Confirmation shown after copying the page Markdown"
          >
            Copied!
          </Translate>
        ) : (
          <Translate
            id="theme.docs.llmActions.copy"
            description="Label for the copy-as-Markdown button"
          >
            Copy as Markdown
          </Translate>
        )}
      </button>
      <Link className={clsx(buttonClass, styles.action)} to={markdownUrl}>
        <Translate
          id="theme.docs.llmActions.view"
          description="Label for the view-as-Markdown link"
        >
          View as Markdown
        </Translate>
      </Link>
      <Link
        className={clsx(buttonClass, styles.action)}
        to={`https://chatgpt.com/?q=${encodedPrompt}`}
      >
        <Translate
          id="theme.docs.llmActions.chatgpt"
          description="Label for the open-in-ChatGPT link"
        >
          Open in ChatGPT
        </Translate>
      </Link>
      <Link
        className={clsx(buttonClass, styles.action)}
        to={`https://claude.ai/new?q=${encodedPrompt}`}
      >
        <Translate
          id="theme.docs.llmActions.claude"
          description="Label for the open-in-Claude link"
        >
          Open in Claude
        </Translate>
      </Link>
    </div>
  );
}
