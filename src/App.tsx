import "./App.css";

function App() {
  return (
    <div className="stash">
      <aside className="stash__sidebar">
        <div className="stash__logo">
          <span className="stash__logo-icon">🥸</span>
          <span className="stash__logo-text">Stash</span>
        </div>
        <nav className="stash__nav">
          <button className="stash__nav-item stash__nav-item--active">All Vaults</button>
          <button className="stash__nav-item">API Directory</button>
          <button className="stash__nav-item">Settings</button>
        </nav>
      </aside>
      <main className="stash__main">
        <header className="stash__header">
          <h1 className="stash__title">All Vaults</h1>
          <p className="stash__subtitle">No vaults yet. Create one to get started.</p>
        </header>
        <div className="stash__empty">
          <span className="stash__empty-icon">🔐</span>
          <p className="stash__empty-text">Your environment secrets live here.</p>
          <button className="stash__btn stash__btn--primary">New Vault</button>
        </div>
      </main>
    </div>
  );
}

export default App;
