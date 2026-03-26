import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Clear any previously registered fonts (fixes HMR caching issues)
try { Font.clear(); } catch (_) { /* not available in all versions */ }

// Register hyphenation callback to prevent crashes
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    padding: 48,
    paddingBottom: 60,
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.65,
    color: '#1e293b',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 16,
  },
  titleBar: {
    borderBottomWidth: 2,
    borderBottomColor: '#4318FF',
    marginBottom: 20,
    paddingBottom: 12,
  },
  h2: {
    fontSize: 14,
    fontWeight: 700,
    color: '#0f172a',
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  h3: {
    fontSize: 12,
    fontWeight: 600,
    color: '#1e293b',
    marginTop: 14,
    marginBottom: 6,
  },
  h4: {
    fontSize: 11,
    fontWeight: 600,
    color: '#334155',
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 6,
    color: '#475569',
  },
  bold: {
    fontWeight: 700,
    color: '#1e293b',
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingLeft: 8,
  },
  bullet: {
    width: 14,
    color: '#4318FF',
    fontSize: 10,
  },
  listText: {
    flex: 1,
    color: '#475569',
  },
  table: {
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tableRowEven: {
    backgroundColor: '#f8fafc',
  },
  tableHeader: {
    backgroundColor: '#f1f5f9',
  },
  tableCell: {
    flex: 1,
    padding: 6,
    fontSize: 9,
    color: '#475569',
  },
  tableCellHeader: {
    fontWeight: 700,
    color: '#0f172a',
    fontSize: 9,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#4318FF',
    paddingLeft: 10,
    paddingVertical: 6,
    marginVertical: 8,
    backgroundColor: '#f8fafc',
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginVertical: 14,
  },
  updatedBadge: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 7,
    fontWeight: 700,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: '#94a3b8',
  },
});

interface StrategyBriefPDFProps {
  content: string;
  categoryName: string;
  createdAt?: string;
}

// Parse inline markdown formatting into Text elements
function renderInlineText(text: string, keyPrefix: string): JSX.Element[] {
  const elements: JSX.Element[] = [];
  // Match **bold**, *italic*, and [UPDATED] tags
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|\[UPDATED\])/g;
  let lastIndex = 0;
  let matchIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      elements.push(
        <Text key={`${keyPrefix}-t${matchIndex++}`}>
          {text.slice(lastIndex, match.index)}
        </Text>
      );
    }

    if (match[0] === '[UPDATED]') {
      elements.push(
        <Text key={`${keyPrefix}-u${matchIndex++}`} style={styles.updatedBadge}>
          {' UPDATED '}
        </Text>
      );
    } else if (match[2]) {
      // Bold
      elements.push(
        <Text key={`${keyPrefix}-b${matchIndex++}`} style={styles.bold}>
          {match[2]}
        </Text>
      );
    } else if (match[3]) {
      // Italic
      elements.push(
        <Text key={`${keyPrefix}-i${matchIndex++}`} style={{ fontStyle: 'italic' } as any}>
          {match[3]}
        </Text>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    elements.push(
      <Text key={`${keyPrefix}-e${matchIndex}`}>
        {text.slice(lastIndex)}
      </Text>
    );
  }

  return elements.length > 0 ? elements : [<Text key={`${keyPrefix}-plain`}>{text}</Text>];
}

function parseMarkdownToPDF(content: string) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      listItems.forEach((item, idx) => {
        elements.push(
          <View key={`list-${elements.length}-${idx}`} style={styles.listItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.listText}>
              {renderInlineText(item, `li-${elements.length}-${idx}`)}
            </Text>
          </View>
        );
      });
      listItems = [];
      inList = false;
    }
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <View key={`table-${elements.length}`} style={styles.table}>
          {tableRows.map((row, rowIdx) => (
            <View
              key={rowIdx}
              style={[
                styles.tableRow,
                rowIdx === 0 && styles.tableHeader,
                rowIdx > 0 && rowIdx % 2 === 0 && styles.tableRowEven,
              ]}
            >
              {row.map((cell, cellIdx) => (
                <Text
                  key={cellIdx}
                  style={[styles.tableCell, rowIdx === 0 && styles.tableCellHeader]}
                >
                  {renderInlineText(cell.trim(), `tc-${elements.length}-${rowIdx}-${cellIdx}`)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
      tableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushList();
      continue;
    }

    // Table detection
    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
      flushList();
      if (trimmedLine.includes('---')) continue;
      inTable = true;
      const cells = trimmedLine.slice(1, -1).split('|').map(c => c.trim());
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headers - strip markdown bold from header text
    const cleanHeader = (s: string) => s.replace(/\*\*/g, '').replace(/\*/g, '');

    if (trimmedLine.startsWith('# ')) {
      flushList();
      elements.push(
        <Text key={`h1-${i}`} style={styles.title}>
          {cleanHeader(trimmedLine.slice(2))}
        </Text>
      );
      continue;
    }
    if (trimmedLine.startsWith('## ')) {
      flushList();
      elements.push(
        <Text key={`h2-${i}`} style={styles.h2}>
          {cleanHeader(trimmedLine.slice(3))}
        </Text>
      );
      continue;
    }
    if (trimmedLine.startsWith('### ')) {
      flushList();
      elements.push(
        <Text key={`h3-${i}`} style={styles.h3}>
          {cleanHeader(trimmedLine.slice(4))}
        </Text>
      );
      continue;
    }
    if (trimmedLine.startsWith('#### ')) {
      flushList();
      elements.push(
        <Text key={`h4-${i}`} style={styles.h4}>
          {cleanHeader(trimmedLine.slice(5))}
        </Text>
      );
      continue;
    }

    // Horizontal rule
    if (trimmedLine === '---' || trimmedLine === '***') {
      flushList();
      elements.push(<View key={`hr-${i}`} style={styles.hr} />);
      continue;
    }

    // Blockquote
    if (trimmedLine.startsWith('> ')) {
      flushList();
      elements.push(
        <View key={`quote-${i}`} style={styles.blockquote}>
          <Text style={styles.paragraph}>
            {renderInlineText(trimmedLine.slice(2), `bq-${i}`)}
          </Text>
        </View>
      );
      continue;
    }

    // List items
    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ') || /^\d+\.\s/.test(trimmedLine)) {
      inList = true;
      const listText = trimmedLine.replace(/^[-*]\s|^\d+\.\s/, '');
      listItems.push(listText);
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <Text key={`p-${i}`} style={styles.paragraph}>
        {renderInlineText(trimmedLine, `p-${i}`)}
      </Text>
    );
  }

  flushList();
  flushTable();

  return elements;
}

export function StrategyBriefPDF({ content, categoryName, createdAt }: StrategyBriefPDFProps) {
  const pdfElements = parseMarkdownToPDF(content);
  const dateStr = createdAt ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.titleBar}>
          <Text style={styles.title}>{categoryName} — Formula Strategy Brief</Text>
          {dateStr && <Text style={styles.subtitle}>Generated {dateStr}</Text>}
        </View>
        {pdfElements}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>DOVIVE — Formula Strategy Brief</Text>
          <Text style={styles.footerText}>{categoryName}</Text>
        </View>
      </Page>
    </Document>
  );
}
