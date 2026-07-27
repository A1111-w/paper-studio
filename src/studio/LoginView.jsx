import { useState } from "react";
import { ArrowRight, FileText, LoaderCircle, LockKeyhole } from "lucide-react";

export default function LoginView({ onLogin, loading, error }) {
  const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
  const [email, setEmail] = useState(demoMode ? "writer@local.test" : "");
  const [password, setPassword] = useState(demoMode ? "writer-demo-password" : "");
  return (
    <main className="login-view">
      <section className="login-panel">
        <div className="login-brand"><span>文</span><strong>文核写作台</strong></div>
        <div className="login-copy">
          <FileText size={28} aria-hidden="true" />
          <h1>进入写作工作台</h1>
          <p>{demoMode ? "文章生成、格式模板与 Word 交付在同一条任务链中完成。" : "请输入已配置的写作台账户。"}</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onLogin(email, password); }}>
          <label><span>邮箱</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></label>
          <label><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />}
            {loading ? "正在登录" : "进入工作台"}
            {!loading ? <ArrowRight size={17} /> : null}
          </button>
        </form>
      </section>
      <aside className="login-aside" aria-hidden="true">
        <div className="paper-stack">
          <div className="paper-page page-back" />
          <div className="paper-page page-front">
            <div className="paper-rule short" /><div className="paper-title" /><div className="paper-rule" />
            <div className="paper-rule" /><div className="paper-rule medium" /><div className="paper-rule" />
            <div className="paper-heading" /><div className="paper-rule" /><div className="paper-rule medium" />
          </div>
        </div>
      </aside>
    </main>
  );
}
