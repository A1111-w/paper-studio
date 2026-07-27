import {
  BookOpenCheck,
  ClipboardCheck,
  Coins,
  FileClock,
  FilePenLine,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Settings2,
} from "lucide-react";

const navItems = [
  { id: "composer", label: "新建文章", icon: FilePenLine },
  { id: "jobs", label: "生成任务", icon: FileClock },
  { id: "templates", label: "格式模板", icon: LibraryBig },
  { id: "billing", label: "账户充值", icon: Coins },
  { id: "plagiarism", label: "查重检测", icon: ClipboardCheck },
];

export default function Sidebar({ active, onNavigate, user, onLogout, onOpenBookSite }) {
  return (
    <aside className="studio-sidebar">
      <button className="studio-brand" type="button" onClick={() => onNavigate("composer")}>
        <span>文</span>
        <div><strong>文核</strong><small>WRITING STUDIO</small></div>
      </button>
      <nav aria-label="主导航">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button className={active === id ? "active" : ""} type="button" onClick={() => onNavigate(id)} key={id}>
            <Icon aria-hidden="true" size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-group">
        <span>其他服务</span>
        <button type="button" onClick={onOpenBookSite}>
          <BookOpenCheck aria-hidden="true" size={18} />
          <span>二手书平台</span>
        </button>
      </div>
      {user?.role === "admin" ? (
        <div className="sidebar-group admin-group">
          <span>管理</span>
          <button className={active === "admin" ? "active" : ""} type="button" onClick={() => onNavigate("admin")}>
            <LayoutDashboard aria-hidden="true" size={18} />
            <span>管理后台</span>
          </button>
        </div>
      ) : null}
      <div className="sidebar-account">
        <div className="avatar">{user?.email?.slice(0, 1).toUpperCase() || "W"}</div>
        <div><strong>{user?.role === "admin" ? "管理员" : "写作者"}</strong><small>{user?.email}</small></div>
        <button type="button" title="切换账号" onClick={onLogout}><LogOut size={16} /></button>
      </div>
      <div className="sidebar-version"><Settings2 size={13} /> v0.1.0</div>
    </aside>
  );
}
