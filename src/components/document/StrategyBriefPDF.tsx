import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Register fonts (using system fonts as fallback)
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hiJ-Ek-_EeA.woff2', fontWeight: 600 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiJ-Ek-_EeA.woff2', fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Inter',
    fontSize: 11,
    lineHeight: 1.6,
    color: '#1a1a2e',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#4318FF',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#4318FF20',
  },
  h2: {
    fontSize: 16,
    fontWeight: 600,
    marginTop: 20,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  h3: {
    fontSize: 14,
    fontWeight: 600,
    marginTop: 16,
    marginBottom: 6,
  },
  h4: {
    fontSize: 12,
    fontWeight: 600,
    marginTop: 12,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 8,
    color: '#64748b',
  },
  bold: {
    fontWeight: 600,
    color: '#1a1a2e',
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 12,
  },
  bullet: {
    width: 12,
    color: '#64748b',
  },
  listText: {
    flex: 1,
    color: '#64748b',
  },
  table: {
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableRowEven: {
    backgroundColor: '#f9fafb',
  },
  tableHeader: {
    backgroundColor: '#4318FF10',
  },
  tableCell: {
    flex: 1,
    padding: 8,
    fontSize: 10,
  },
  tableCellHeader: {
    fontWeight: 600,
    color: '#1a1a2e',
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#4318FF',
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 8,
    backgroundColor: '#4318FF08',
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginVertical: 16,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 9,
    color: '#a3aed0',
  },
});

interface StrategyBriefPDFProps {
  content: string;
  categoryName: string;
  createdAt?: string;
}

// Simple markdown parser for PDF rendering
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
            <Text style={styles.listText}>{item}</Text>
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
                  {cell.trim()}
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

    // Skip empty lines
    if (!trimmedLine) {
      flushList();
      continue;
    }

    // Table detection
    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
      flushList();
      // Skip separator row
      if (trimmedLine.includes('---')) continue;
      
      inTable = true;
      const cells = trimmedLine.slice(1, -1).split('|').map(c => c.trim());
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headers
    if (trimmedLine.startsWith('# ')) {
      flushList();
      elements.push(
        <Text key={`h1-${i}`} style={styles.title}>
          {trimmedLine.slice(2)}
        </Text>
      );
      continue;
    }
    if (trimmedLine.startsWith('## ')) {
      flushList();
      elements.push(
        <Text key={`h2-${i}`} style={styles.h2}>
          {trimmedLine.slice(3)}
        </Text>
      );
      continue;
    }
    if (trimmedLine.startsWith('### ')) {
      flushList();
      elements.push(
        <Text key={`h3-${i}`} style={styles.h3}>
          {trimmedLine.slice(4)}
        </Text>
      );
      continue;
    }
    if (trimmedLine.startsWith('#### ')) {
      flushList();
      elements.push(
        <Text key={`h4-${i}`} style={styles.h4}>
          {trimmedLine.slice(5)}
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
          <Text style={styles.paragraph}>{trimmedLine.slice(2)}</Text>
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
        {trimmedLine}
      </Text>
    );
  }

  // Flush remaining items
  flushList();
  flushTable();

  return elements;
}

export function StrategyBriefPDF({ content, categoryName, createdAt }: StrategyBriefPDFProps) {
  const pdfElements = parseMarkdownToPDF(content);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {pdfElements}
        <Text style={styles.footer}>
          Formula Strategy Brief - {categoryName}
          {createdAt && ` • Generated ${new Date(createdAt).toLocaleDateString()}`}
        </Text>
      </Page>
    </Document>
  );
}
