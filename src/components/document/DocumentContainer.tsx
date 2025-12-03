import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Skeleton } from '@/components/ui/skeleton';

interface DocumentContainerProps {
  content: string | null;
  isLoading?: boolean;
  title?: string;
}

export function DocumentContainer({ content, isLoading, title }: DocumentContainerProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-card max-w-[800px] mx-auto shadow-lg rounded-lg p-8 md:p-12 space-y-6">
        {/* Title skeleton */}
        <Skeleton className="h-10 w-3/4 mb-8" />
        
        {/* Paragraph skeletons */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        
        {/* Section header skeleton */}
        <Skeleton className="h-7 w-1/3 mt-8" />
        
        {/* More paragraph skeletons */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        
        {/* Table skeleton */}
        <div className="mt-8 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        
        {/* Another section */}
        <Skeleton className="h-7 w-2/5 mt-8" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-11/12" />
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="bg-white dark:bg-card max-w-[800px] mx-auto shadow-lg rounded-lg p-8 md:p-12">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Document Not Available</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            The formula brief content is still being generated. Please check back in a few minutes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-card max-w-[800px] mx-auto shadow-lg rounded-lg p-8 md:p-12">
      <article className="document-content prose prose-slate dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))]/20 pb-4 mb-8 mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="font-serif text-xl md:text-2xl font-semibold text-foreground mt-10 mb-4 pb-2 border-b border-border">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="font-serif text-lg md:text-xl font-medium text-foreground mt-8 mb-3">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="font-semibold text-base text-foreground mt-6 mb-2">
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-4">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-outside ml-6 space-y-2 text-sm md:text-base text-muted-foreground mb-4">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-outside ml-6 space-y-2 text-sm md:text-base text-muted-foreground mb-4">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed">
                {children}
              </li>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-6 rounded-lg border border-border">
                <table className="w-full text-sm">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-[hsl(var(--primary))]/10">
                {children}
              </thead>
            ),
            th: ({ children }) => (
              <th className="px-4 py-3 text-left font-semibold text-foreground border-b border-border">
                {children}
              </th>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-border">
                {children}
              </tbody>
            ),
            tr: ({ children }) => (
              <tr className="even:bg-muted/30 hover:bg-muted/50 transition-colors">
                {children}
              </tr>
            ),
            td: ({ children }) => (
              <td className="px-4 py-3 text-muted-foreground">
                {children}
              </td>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-[hsl(var(--primary))] pl-4 py-2 my-4 bg-[hsl(var(--primary))]/5 rounded-r-lg">
                {children}
              </blockquote>
            ),
            code: ({ children, className }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground">
                    {children}
                  </code>
                );
              }
              return (
                <code className="block bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="bg-muted rounded-lg overflow-x-auto my-4">
                {children}
              </pre>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">
                {children}
              </strong>
            ),
            em: ({ children }) => (
              <em className="italic">
                {children}
              </em>
            ),
            hr: () => (
              <hr className="my-8 border-border" />
            ),
            a: ({ href, children }) => (
              <a 
                href={href} 
                className="text-[hsl(var(--primary))] hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
