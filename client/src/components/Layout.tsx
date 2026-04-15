import { Link, useLocation } from "wouter";
import { Package, PlusCircle, Sun, Moon } from "lucide-react";
import { useState, useEffect } from "react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ヘッダー */}
      <header className="border-b border-border bg-card shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <a className="flex items-center gap-2 text-primary font-bold text-base hover:opacity-80 transition-opacity" data-testid="link-home">
              <svg aria-label="在庫管理" viewBox="0 0 32 32" width="28" height="28" fill="none">
                <rect x="2" y="8" width="28" height="20" rx="3" fill="hsl(221 70% 28%)" />
                <rect x="10" y="4" width="12" height="8" rx="2" fill="hsl(221 70% 40%)" />
                <rect x="6" y="14" width="8" height="3" rx="1" fill="white" opacity="0.9" />
                <rect x="6" y="20" width="12" height="3" rx="1" fill="white" opacity="0.6" />
                <rect x="18" y="14" width="8" height="9" rx="1" fill="white" opacity="0.2" />
              </svg>
              <span>在庫管理掲示板</span>
            </a>
          </Link>

          <nav className="flex items-center gap-2">
            <Link href="/">
              <a
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location === "/"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
                data-testid="link-board"
              >
                掲示板
              </a>
            </Link>
            <Link href="/new">
              <a
                className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location === "/new"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
                data-testid="link-new-request"
              >
                <PlusCircle size={15} />
                依頼を追加
              </a>
            </Link>
            <button
              onClick={() => setDark(!dark)}
              className="ml-2 p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
              aria-label="テーマ切替"
              data-testid="button-theme-toggle"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </nav>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      {/* フッター */}
      <footer className="border-t border-border bg-card mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-3 text-xs text-muted-foreground text-center">
          在庫入出庫管理システム
        </div>
      </footer>
    </div>
  );
}
