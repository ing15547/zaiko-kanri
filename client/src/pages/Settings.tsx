import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Github, Key, AlertTriangle, CheckCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { saveConfig, loadConfig, clearConfig, ensureLabels, type GHConfig } from "@/lib/github";

export default function Settings() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [error, setError] = useState("");
  const isConfigured = !!loadConfig();

  useEffect(() => {
    const cfg = loadConfig();
    if (cfg) {
      setOwner(cfg.owner);
      setRepo(cfg.repo);
      setToken(cfg.token);
    }
  }, []);

  const handleTest = async () => {
    if (!owner.trim() || !repo.trim() || !token.trim()) {
      setError("すべての項目を入力してください");
      return;
    }
    setTesting(true);
    setError("");
    setTested(false);
    try {
      const cfg: GHConfig = { owner: owner.trim(), repo: repo.trim(), token: token.trim() };
      // リポジトリにアクセスできるか確認
      const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, {
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `エラー: ${res.status}`);
      }
      // ラベルを自動作成
      await ensureLabels(cfg);
      setTested(true);
    } catch (e: any) {
      setError(e.message ?? "接続に失敗しました");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!owner.trim() || !repo.trim() || !token.trim()) {
      setError("すべての項目を入力してください");
      return;
    }
    saveConfig({ owner: owner.trim(), repo: repo.trim(), token: token.trim() });
    toast({ title: "設定を保存しました" });
    navigate("/");
  };

  const handleClear = () => {
    if (confirm("設定を削除しますか？アプリのデータには影響しません。")) {
      clearConfig();
      setOwner(""); setRepo(""); setToken("");
      setTested(false);
      toast({ title: "設定を削除しました" });
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Github size={24} className="text-foreground" />
        <h1 className="text-xl font-bold text-foreground">GitHub設定</h1>
      </div>

      {/* 説明カード */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 text-sm text-blue-800 dark:text-blue-300 space-y-1.5">
        <p className="font-semibold">このアプリはGitHub Issuesをデータベースとして使用します</p>
        <p>依頼データはGitHub Issuesとして保存され、チームで共有できます。</p>
        <p>必要なもの: GitHubアカウント・リポジトリ・Personal Access Token (PAT)</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4 mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">接続情報</h2>

        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">GitHubユーザー名 / 組織名</label>
          <Input
            value={owner}
            onChange={(e) => { setOwner(e.target.value); setTested(false); }}
            placeholder="例: ing15547"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">リポジトリ名</label>
          <Input
            value={repo}
            onChange={(e) => { setRepo(e.target.value); setTested(false); }}
            placeholder="例: zaiko-kanri"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
            <Key size={13} />Personal Access Token (PAT)
          </label>
          <Input
            type="password"
            value={token}
            onChange={(e) => { setToken(e.target.value); setTested(false); }}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            必要なスコープ: <code className="bg-muted px-1 rounded">public_repo</code>（パブリックリポジトリの場合）または <code className="bg-muted px-1 rounded">repo</code>（プライベートの場合）
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-3">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {tested && (
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-3">
            <CheckCircle size={15} />
            <span>接続成功！ラベルも自動作成しました。</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" onClick={handleTest} disabled={testing} className="flex-1">
            {testing ? "確認中..." : "接続テスト"}
          </Button>
          <Button type="button" onClick={handleSave} className="flex-1">
            保存して開始
          </Button>
        </div>
      </div>

      {/* セキュリティ注意 */}
      <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4 text-xs text-yellow-800 dark:text-yellow-300 space-y-1">
        <p className="font-semibold flex items-center gap-1.5"><AlertTriangle size={12} />セキュリティについて</p>
        <p>PATはこのデバイスのローカルストレージに保存されます。他人と共有するデバイスでは使用しないでください。</p>
        <p>PATは最小限のスコープ（public_repo）で発行することを推奨します。</p>
      </div>

      {isConfigured && (
        <div className="flex justify-between items-center pt-2">
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleClear}>
            <Trash2 size={13} className="mr-1" />設定を削除
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            キャンセル
          </Button>
        </div>
      )}

      {/* PATの取得方法 */}
      <div className="mt-6 bg-muted/40 rounded-lg p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">PATの取得方法</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>GitHubにログイン → 右上アイコン → Settings</li>
          <li>左メニュー最下部「Developer settings」</li>
          <li>「Personal access tokens」→「Tokens (classic)」</li>
          <li>「Generate new token (classic)」</li>
          <li>スコープで <strong>public_repo</strong> にチェック（パブリックリポジトリの場合）</li>
          <li>「Generate token」でトークンをコピー</li>
        </ol>
      </div>
    </div>
  );
}
