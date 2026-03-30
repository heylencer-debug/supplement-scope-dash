import { MessageSquare, GitBranch, FlaskConical, FileText } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimelineComment {
  id: string;
  author_name: string;
  comment: string;
  version_label: string;
  created_at: string;
  session_token?: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
}

export interface TimelineVersion {
  id: string;
  label: string;
  created_at: string;
  change_summary?: string | null;
  source?: "version" | "pipeline";
}

type EventType = "comment" | "version";

interface TimelineEvent {
  id: string;
  type: EventType;
  timestamp: string;
  comment?: TimelineComment;
  version?: TimelineVersion;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ActivityTimelineProps {
  comments: TimelineComment[];
  versions: TimelineVersion[];
  showVersionChip?: boolean; // show which version a comment belongs to
}

export function ActivityTimeline({ comments, versions, showVersionChip = true }: ActivityTimelineProps) {
  // Merge and sort newest-first
  const events: TimelineEvent[] = [
    ...comments.map((c) => ({ id: `c-${c.id}`, type: "comment" as EventType, timestamp: c.created_at, comment: c })),
    ...versions.map((v) => ({ id: `v-${v.id}`, type: "version" as EventType, timestamp: v.created_at, version: v })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-8 text-center">No activity yet for this project.</p>
    );
  }

  return (
    <div className="relative">
      {/* vertical line */}
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-100" />

      <div className="space-y-5">
        {events.map((event) => {
          if (event.type === "comment" && event.comment) {
            const c = event.comment;
            const isInternal = c.session_token === "00000000-0000-0000-0000-000000000000";
            return (
              <div key={event.id} className="flex gap-3 relative">
                {/* icon dot */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 z-10 ${
                  isInternal ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"
                }`}>
                  {getInitials(c.author_name)}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-semibold text-gray-800">{c.author_name}</span>
                    {!isInternal && (
                      <span className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-600 rounded-full">manufacturer</span>
                    )}
                    {showVersionChip && (
                      <span className="text-[9px] px-1.5 py-0 bg-gray-100 text-gray-500 rounded-full">{c.version_label}</span>
                    )}
                    <span className="text-[10px] text-gray-400 ml-auto">{formatDateTime(c.created_at)}</span>
                  </div>
                  {c.comment && (
                    <p className="text-sm text-gray-600 leading-relaxed">{c.comment}</p>
                  )}
                  {c.attachment_url && (
                    <div className="mt-1.5">
                      {c.attachment_type?.startsWith("image/") ? (
                        <a href={c.attachment_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={c.attachment_url}
                            alt={c.attachment_name ?? "attachment"}
                            className="max-w-xs max-h-32 rounded-lg border border-gray-200 object-cover hover:opacity-90 transition-opacity"
                          />
                        </a>
                      ) : (
                        <a
                          href={c.attachment_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5 transition-colors"
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[180px]">{c.attachment_name ?? "Attachment"}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (event.type === "version" && event.version) {
            const v = event.version;
            const isPipeline = v.source === "pipeline";
            return (
              <div key={event.id} className="flex gap-3 relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                  isPipeline ? "bg-blue-50 text-blue-500" : "bg-violet-50 text-violet-500"
                }`}>
                  {isPipeline ? <FlaskConical className="w-3.5 h-3.5" /> : <GitBranch className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700">
                      {isPipeline ? `${v.label} generated` : `${v.label} created`}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto">{formatDateTime(v.created_at)}</span>
                  </div>
                  {v.change_summary && (
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{v.change_summary}</p>
                  )}
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
