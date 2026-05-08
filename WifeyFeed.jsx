import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// SETUP: Replace these with your Supabase project credentials
// ============================================================
const SUPABASE_URL = "https://vsjxiyjjwoaopifpzpla.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_--zrP1SjtTUyfi5sh4VcVg_vUOGNh62";

// ============================================================
// Supabase REST helpers (no SDK needed)
// ============================================================
const supabase = {
  from: (table) => ({
    select: async (columns = "*", options = {}) => {
      const params = new URLSearchParams();
      params.set("select", columns);
      if (options.order) params.set("order", options.order);
      if (options.limit) params.set("limit", options.limit);
      if (options.filter) {
        Object.entries(options.filter).forEach(([k, v]) => params.set(k, v));
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      return res.json();
    },
    insert: async (data) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    update: async (data, match) => {
      const params = new URLSearchParams(match);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    delete: async (match) => {
      const params = new URLSearchParams(match);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      return res.ok;
    },
  }),
};

// ============================================================
// Platform detection & icons
// ============================================================
const PLATFORMS = {
  whatsapp: { label: "WhatsApp", color: "#25D366", icon: "💬" },
  linkedin: { label: "LinkedIn", color: "#0A66C2", icon: "💼" },
  youtube: { label: "YouTube", color: "#FF0000", icon: "▶" },
  email: { label: "Email", color: "#EA4335", icon: "📧" },
  other: { label: "Other", color: "#8B8B8B", icon: "🔗" },
};

function detectPlatform(source, url, message) {
  const s = `${source} ${url} ${message}`.toLowerCase();
  if (s.includes("whatsapp") || source?.toLowerCase() === "whatsapp") return "whatsapp";
  if (s.includes("linkedin")) return "linkedin";
  if (s.includes("youtube") || s.includes("youtu.be")) return "youtube";
  if (s.includes("gmail") || s.includes("email") || s.includes("mail")) return "email";
  return "other";
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function timeAgo(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ============================================================
// Demo data for preview (used when Supabase isn't configured)
// ============================================================
const DEMO_DATA = [
  { id: 1, source: "WhatsApp", url: "https://youtube.com/watch?v=dQw4w9WgXcQ", message: "You HAVE to watch this 😂", is_read: false, created_at: new Date(Date.now() - 1200000).toISOString() },
  { id: 2, source: "LinkedIn", url: "https://linkedin.com/posts/someone-123", message: "New message from Ahmed Khan: Hey, saw this role and thought of you...", is_read: false, created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 3, source: "WhatsApp", url: "https://youtu.be/abc123def45", message: "This recipe looks amazing, let's try this weekend", is_read: true, created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 4, source: "WhatsApp", url: null, message: "Don't forget to check that linkedin message I sent you!!", is_read: true, created_at: new Date(Date.now() - 18000000).toISOString() },
  { id: 5, source: "LinkedIn", url: "https://linkedin.com/feed/update/urn:li:activity:123", message: "New message from Fatima R.: Shared a post with you — 'Hardware startups in AU...'", is_read: false, created_at: new Date(Date.now() - 28800000).toISOString() },
  { id: 6, source: "Email", url: "https://youtube.com/watch?v=xyzABC12345", message: "Fwd: Check this talk on CMG systems", is_read: true, created_at: new Date(Date.now() - 86400000).toISOString() },
];

// ============================================================
// Main App
// ============================================================
export default function WifeyFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const pollRef = useRef(null);

  const isConfigured = !SUPABASE_URL.includes("YOUR_PROJECT_ID");

  const fetchItems = useCallback(async () => {
    if (!isConfigured) {
      setItems(DEMO_DATA);
      setIsDemo(true);
      setLoading(false);
      return;
    }
    try {
      const data = await supabase.from("feed_items").select("*", {
        order: "created_at.desc",
        limit: "100",
      });
      if (Array.isArray(data)) {
        setItems(data);
        setError(null);
      }
    } catch (e) {
      setError("Failed to fetch. Check Supabase config.");
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchItems();
    if (isConfigured) {
      pollRef.current = setInterval(fetchItems, 15000);
      return () => clearInterval(pollRef.current);
    }
  }, [fetchItems, isConfigured]);

  const markRead = async (id) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_read: true } : i)));
    if (isConfigured) {
      await supabase.from("feed_items").update({ is_read: true }, { "id": `eq.${id}` });
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    if (isConfigured) {
      await supabase.from("feed_items").update({ is_read: true }, { "is_read": "eq.false" });
    }
  };

  const filtered = items.filter((i) => {
    const plat = detectPlatform(i.source, i.url, i.message);
    if (filter !== "all" && plat !== filter) return false;
    if (showUnreadOnly && i.is_read) return false;
    return true;
  });

  const unreadCount = items.filter((i) => !i.is_read).length;

  return (
    <div style={styles.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;1,9..40,300&family=JetBrains+Mono:wght@400;500&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        
        .feed-card {
          animation: slideUp 0.3s ease both;
          transition: all 0.2s ease;
        }
        .feed-card:hover {
          transform: translateY(-1px);
        }
        .feed-card:active {
          transform: scale(0.995);
        }
        
        .filter-chip {
          transition: all 0.15s ease;
          cursor: pointer;
          user-select: none;
        }
        .filter-chip:hover {
          opacity: 0.85;
        }
        
        .unread-dot {
          animation: pulse 2s ease infinite;
        }

        .yt-thumb {
          transition: opacity 0.2s ease;
        }
        .yt-thumb:hover {
          opacity: 0.8;
        }

        .setup-panel {
          animation: fadeIn 0.2s ease;
        }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={styles.logoMark}>W</div>
          <div>
            <h1 style={styles.title}>Wifey Feed</h1>
            <p style={styles.subtitle}>
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up ✓"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={styles.markAllBtn}>
              Mark all read
            </button>
          )}
          <button
            onClick={() => setShowSetup(!showSetup)}
            style={styles.gearBtn}
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Demo banner */}
      {isDemo && (
        <div style={styles.demoBanner}>
          <span style={{ fontSize: "13px" }}>
            📎 Demo mode — connect Supabase to go live
          </span>
          <button
            onClick={() => setShowSetup(true)}
            style={styles.demoBannerBtn}
          >
            Setup →
          </button>
        </div>
      )}

      {/* Setup panel */}
      {showSetup && (
        <div className="setup-panel" style={styles.setupPanel}>
          <h3 style={styles.setupTitle}>Setup Guide</h3>

          <div style={styles.setupStep}>
            <div style={styles.stepNum}>1</div>
            <div>
              <strong style={{ color: "#E8E4E0" }}>Create Supabase project</strong>
              <p style={styles.stepText}>
                Go to supabase.com → New Project → copy the URL and anon key
              </p>
            </div>
          </div>

          <div style={styles.setupStep}>
            <div style={styles.stepNum}>2</div>
            <div>
              <strong style={{ color: "#E8E4E0" }}>Run this SQL in Supabase SQL Editor</strong>
              <pre style={styles.codeBlock}>{`create table feed_items (
  id bigint generated always as identity primary key,
  source text not null,
  url text,
  message text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Allow public insert (from Tasker) and read
alter table feed_items enable row level security;

create policy "Allow public read"
  on feed_items for select using (true);

create policy "Allow public insert"
  on feed_items for insert with check (true);

create policy "Allow public update"
  on feed_items for update using (true);`}</pre>
            </div>
          </div>

          <div style={styles.setupStep}>
            <div style={styles.stepNum}>3</div>
            <div>
              <strong style={{ color: "#E8E4E0" }}>Update this app</strong>
              <p style={styles.stepText}>
                Replace SUPABASE_URL and SUPABASE_ANON_KEY at the top of the code
              </p>
            </div>
          </div>

          <div style={styles.setupStep}>
            <div style={styles.stepNum}>4</div>
            <div>
              <strong style={{ color: "#E8E4E0" }}>Tasker Setup (Android)</strong>
              <p style={styles.stepText}>Install Tasker + AutoNotification plugin from Play Store. Then create this profile:</p>
              <pre style={styles.codeBlock}>{`PROFILE: Wifey Notifications
  Context: AutoNotification Intercept
    → App: WhatsApp, LinkedIn, Gmail, YouTube
    → Title contains: [wife's name]

TASK: Post to Supabase
  Action 1: Variable Set
    %source = %anapp
    %msg = %antitle - %antext
    %url = (extract URL from %antext using 
            Variable Search Replace with 
            regex: https?://[^\\s]+)
  
  Action 2: HTTP Request
    Method: POST
    URL: ${SUPABASE_URL}/rest/v1/feed_items
    Headers:
      apikey: ${isConfigured ? SUPABASE_ANON_KEY : "YOUR_ANON_KEY"}
      Content-Type: application/json
    Body: {
      "source": "%source",
      "url": "%url",  
      "message": "%msg"
    }`}</pre>
            </div>
          </div>

          <button
            onClick={() => setShowSetup(false)}
            style={styles.closeSetupBtn}
          >
            Got it, close
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={styles.filterBar}>
        <div style={styles.filterRow}>
          {[
            { key: "all", label: "All", icon: "⊕" },
            ...Object.entries(PLATFORMS).map(([k, v]) => ({
              key: k,
              label: v.label,
              icon: v.icon,
            })),
          ].map((f) => (
            <button
              key={f.key}
              className="filter-chip"
              onClick={() => setFilter(f.key)}
              style={{
                ...styles.chip,
                ...(filter === f.key ? styles.chipActive : {}),
              }}
            >
              <span style={{ fontSize: "12px" }}>{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>
        <button
          className="filter-chip"
          onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          style={{
            ...styles.chip,
            ...(showUnreadOnly ? styles.chipActive : {}),
            marginLeft: "auto",
          }}
        >
          Unread only
        </button>
      </div>

      {/* Feed */}
      <div style={styles.feed}>
        {loading ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: "28px", animation: "pulse 1.5s ease infinite" }}>⏳</div>
            <p style={{ color: "#8B8580" }}>Loading feed...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: "36px", marginBottom: "8px" }}>🎉</div>
            <p style={{ color: "#8B8580", fontSize: "15px" }}>
              {showUnreadOnly ? "No unread items" : "Nothing here yet"}
            </p>
          </div>
        ) : (
          filtered.map((item, idx) => {
            const plat = detectPlatform(item.source, item.url, item.message);
            const p = PLATFORMS[plat];
            const ytId = extractYouTubeId(item.url);
            const isExpanded = expandedId === item.id;

            return (
              <div
                key={item.id}
                className="feed-card"
                style={{
                  ...styles.card,
                  animationDelay: `${idx * 0.04}s`,
                  borderLeft: `3px solid ${p.color}`,
                  background: item.is_read ? "#1C1917" : "#1F1C19",
                }}
                onClick={() => {
                  setExpandedId(isExpanded ? null : item.id);
                  if (!item.is_read) markRead(item.id);
                }}
              >
                <div style={styles.cardHeader}>
                  <div style={styles.cardMeta}>
                    {!item.is_read && <div className="unread-dot" style={styles.unreadDot} />}
                    <span
                      style={{
                        ...styles.platformTag,
                        background: `${p.color}22`,
                        color: p.color,
                      }}
                    >
                      {p.icon} {p.label}
                    </span>
                    <span style={styles.timestamp}>{timeAgo(item.created_at)}</span>
                  </div>
                </div>

                <p style={{
                  ...styles.message,
                  ...(isExpanded ? {} : styles.messageTruncated),
                }}>
                  {item.message || "No message"}
                </p>

                {item.url && (
                  <div style={styles.linkSection}>
                    {ytId && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="yt-thumb"
                        style={styles.ytThumb}
                      >
                        <img
                          src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                          alt="YouTube thumbnail"
                          style={styles.ytImg}
                        />
                        <div style={styles.ytPlayBtn}>▶</div>
                      </a>
                    )}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={styles.urlLink}
                    >
                      {item.url.length > 55 ? item.url.slice(0, 55) + "…" : item.url}
                      <span style={{ marginLeft: "4px", fontSize: "11px" }}>↗</span>
                    </a>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span>Polls every 15s</span>
        <span>•</span>
        <button onClick={fetchItems} style={styles.refreshBtn}>
          Refresh now
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = {
  container: {
    fontFamily: "'DM Sans', sans-serif",
    background: "#131110",
    minHeight: "100vh",
    color: "#E8E4E0",
    maxWidth: "540px",
    margin: "0 auto",
    padding: "0",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 18px 12px",
    borderBottom: "1px solid #2A2624",
  },
  logoMark: {
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #E8572A, #D44820)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "700",
    fontSize: "16px",
    color: "#fff",
    letterSpacing: "-0.5px",
  },
  title: {
    fontSize: "20px",
    fontWeight: "700",
    letterSpacing: "-0.5px",
    color: "#E8E4E0",
    lineHeight: "1.1",
  },
  subtitle: {
    fontSize: "13px",
    color: "#8B8580",
    marginTop: "2px",
  },
  markAllBtn: {
    background: "none",
    border: "1px solid #3A3634",
    color: "#A8A29E",
    fontSize: "12px",
    padding: "5px 10px",
    borderRadius: "6px",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  gearBtn: {
    background: "none",
    border: "none",
    fontSize: "18px",
    cursor: "pointer",
    padding: "4px",
    opacity: 0.6,
    filter: "grayscale(1)",
  },
  demoBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 18px",
    background: "#1E1B18",
    borderBottom: "1px solid #2A2624",
    color: "#A8A29E",
  },
  demoBannerBtn: {
    background: "none",
    border: "1px solid #3A3634",
    color: "#E8572A",
    fontSize: "12px",
    padding: "3px 10px",
    borderRadius: "5px",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  setupPanel: {
    padding: "20px 18px",
    background: "#1A1715",
    borderBottom: "1px solid #2A2624",
  },
  setupTitle: {
    fontSize: "16px",
    fontWeight: "700",
    marginBottom: "16px",
    color: "#E8E4E0",
  },
  setupStep: {
    display: "flex",
    gap: "12px",
    marginBottom: "16px",
  },
  stepNum: {
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    background: "#E8572A",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "700",
    flexShrink: 0,
    marginTop: "2px",
  },
  stepText: {
    fontSize: "13px",
    color: "#8B8580",
    marginTop: "4px",
    lineHeight: "1.5",
  },
  codeBlock: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "11px",
    background: "#0D0C0B",
    border: "1px solid #2A2624",
    borderRadius: "8px",
    padding: "12px",
    marginTop: "8px",
    color: "#A8A29E",
    overflowX: "auto",
    whiteSpace: "pre",
    lineHeight: "1.6",
  },
  closeSetupBtn: {
    background: "none",
    border: "1px solid #3A3634",
    color: "#E8E4E0",
    fontSize: "13px",
    padding: "8px 16px",
    borderRadius: "8px",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    marginTop: "8px",
    width: "100%",
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    padding: "12px 18px",
    gap: "8px",
    borderBottom: "1px solid #2A2624",
    overflowX: "auto",
    flexWrap: "nowrap",
  },
  filterRow: {
    display: "flex",
    gap: "6px",
    flexShrink: 0,
  },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    padding: "5px 11px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "500",
    background: "#1E1B18",
    color: "#8B8580",
    border: "1px solid #2A2624",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  chipActive: {
    background: "#E8572A18",
    color: "#E8572A",
    borderColor: "#E8572A44",
  },
  feed: {
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  card: {
    padding: "14px 16px",
    borderRadius: "10px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  unreadDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#E8572A",
    flexShrink: 0,
  },
  platformTag: {
    fontSize: "11px",
    fontWeight: "500",
    padding: "2px 8px",
    borderRadius: "12px",
    letterSpacing: "0.3px",
  },
  timestamp: {
    fontSize: "12px",
    color: "#5C5753",
    fontFamily: "'JetBrains Mono', monospace",
  },
  message: {
    fontSize: "14px",
    lineHeight: "1.55",
    color: "#C8C3BE",
  },
  messageTruncated: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  linkSection: {
    marginTop: "10px",
  },
  ytThumb: {
    display: "block",
    position: "relative",
    borderRadius: "8px",
    overflow: "hidden",
    marginBottom: "8px",
  },
  ytImg: {
    width: "100%",
    height: "auto",
    display: "block",
    borderRadius: "8px",
  },
  ytPlayBtn: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    background: "rgba(0,0,0,0.7)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    paddingLeft: "2px",
  },
  urlLink: {
    fontSize: "12px",
    color: "#6B9BD2",
    textDecoration: "none",
    fontFamily: "'JetBrains Mono', monospace",
    wordBreak: "break-all",
    lineHeight: "1.4",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 20px",
    gap: "8px",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "16px",
    fontSize: "12px",
    color: "#4A4643",
    fontFamily: "'JetBrains Mono', monospace",
  },
  refreshBtn: {
    background: "none",
    border: "none",
    color: "#E8572A",
    fontSize: "12px",
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
};
