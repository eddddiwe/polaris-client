import type { ReactNode } from 'react'

/**
 * Minimal, dependency-free Markdown renderer. It emits React elements only —
 * never innerHTML — so untrusted project descriptions cannot inject markup.
 * Supported: headings, paragraphs, lists, blockquotes, fenced code, rules and
 * inline bold/italic/code/links/images.
 */
export function Markdown({ text, onLink }: { text: string; onLink?: (url: string) => void }): JSX.Element {
  return <div className="markdown">{renderBlocks(text ?? '', onLink)}</div>
}

const SAFE_LINK = /^https?:\/\//i
const SAFE_IMAGE = /^(https?:\/\/|data:image\/)/i

function safeLink(url: string): boolean {
  return SAFE_LINK.test(url.trim())
}

function safeImage(url: string): boolean {
  return SAFE_IMAGE.test(url.trim())
}

function Link({
  url,
  children,
  onLink
}: {
  url: string
  children: ReactNode
  onLink?: (url: string) => void
}): JSX.Element {
  const open = (event: React.MouseEvent): void => {
    event.preventDefault()
    if (onLink) onLink(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  }
  return (
    <a href={url} rel="noreferrer noopener" target="_blank" onClick={open}>
      {children}
    </a>
  )
}

const INLINE =
  /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|(https?:\/\/[^\s<)]+)/g

function inline(text: string, onLink?: (url: string) => void): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  INLINE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const [token, alt, imageUrl, label, linkUrl, code, boldA, boldB, italicA, italicB, bareUrl] = match
    if (imageUrl !== undefined) {
      nodes.push(
        safeImage(imageUrl) ? (
          <img key={key++} className="md-image" src={imageUrl} alt={alt ?? ''} loading="lazy" />
        ) : (
          token
        )
      )
    } else if (linkUrl !== undefined) {
      nodes.push(
        safeLink(linkUrl) ? (
          <Link key={key++} url={linkUrl} onLink={onLink}>
            {label}
          </Link>
        ) : (
          token
        )
      )
    } else if (code !== undefined) {
      nodes.push(<code key={key++}>{code}</code>)
    } else if (boldA !== undefined || boldB !== undefined) {
      nodes.push(<strong key={key++}>{boldA ?? boldB}</strong>)
    } else if (italicA !== undefined || italicB !== undefined) {
      nodes.push(<em key={key++}>{italicA ?? italicB}</em>)
    } else if (bareUrl !== undefined) {
      nodes.push(
        <Link key={key++} url={bareUrl} onLink={onLink}>
          {bareUrl.replace(/^https?:\/\//, '')}
        </Link>
      )
    } else {
      nodes.push(token)
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

type ListKind = 'ul' | 'ol' | null

const UL_ITEM = /^\s*[-*+]\s+(.*)$/
const OL_ITEM = /^\s*\d+[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/

function renderBlocks(text: string, onLink?: (url: string) => void): ReactNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let key = 0
  let paragraph: string[] = []
  let list: { kind: Exclude<ListKind, null>; items: string[] } | null = null

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    blocks.push(<p key={`p-${key++}`}>{inline(paragraph.join(' '), onLink)}</p>)
    paragraph = []
  }
  const flushList = (): void => {
    if (!list) return
    const items = list.items.map((item, index) => <li key={index}>{inline(item, onLink)}</li>)
    blocks.push(list.kind === 'ul' ? <ul key={`u-${key++}`}>{items}</ul> : <ol key={`o-${key++}`}>{items}</ol>)
    list = null
  }
  const flush = (): void => {
    flushParagraph()
    flushList()
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flush()
      const language = trimmed.slice(3).trim()
      const code: string[] = []
      index++
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index++
      }
      blocks.push(
        <pre key={`c-${key++}`} className="md-code">
          <code data-language={language || undefined}>{code.join('\n')}</code>
        </pre>
      )
      continue
    }

    if (!trimmed) {
      flush()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flush()
      const level = heading[1].length
      const content = inline(heading[2], onLink)
      if (level === 1) blocks.push(<h1 key={`h-${key++}`}>{content}</h1>)
      else if (level === 2) blocks.push(<h2 key={`h-${key++}`}>{content}</h2>)
      else if (level === 3) blocks.push(<h3 key={`h-${key++}`}>{content}</h3>)
      else if (level === 4) blocks.push(<h4 key={`h-${key++}`}>{content}</h4>)
      else blocks.push(<h5 key={`h-${key++}`}>{content}</h5>)
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush()
      blocks.push(<hr key={`r-${key++}`} />)
      continue
    }

    if (QUOTE.test(line)) {
      flush()
      const quote: string[] = []
      while (index < lines.length && QUOTE.test(lines[index])) {
        quote.push(QUOTE.exec(lines[index])?.[1] ?? '')
        index++
      }
      index--
      blocks.push(<blockquote key={`q-${key++}`}>{inline(quote.join(' '), onLink)}</blockquote>)
      continue
    }

    const ul = UL_ITEM.exec(line)
    const ol = ul ? null : OL_ITEM.exec(line)
    if (ul || ol) {
      flushParagraph()
      const kind: 'ul' | 'ol' = ul ? 'ul' : 'ol'
      if (list && list.kind !== kind) flushList()
      if (list) list.items.push((ul ?? ol)?.[1] ?? '')
      else list = { kind, items: [(ul ?? ol)?.[1] ?? ''] }
      continue
    }

    if (list) flushList()
    paragraph.push(trimmed)
  }

  flush()
  return blocks
}
