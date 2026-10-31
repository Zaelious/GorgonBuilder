export function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <span className="wordmark">Gorgon Builder</span>
        <span className="project-label">Project Gorgon build planner</span>
      </header>
      <main className="welcome" aria-labelledby="welcome-title">
        <p className="eyebrow">A foundation for theorycrafting</p>
        <h1 id="welcome-title">Gorgon Builder</h1>
        <p className="introduction">
          A place to plan your next Project Gorgon build.
        </p>
        <section className="notice" aria-labelledby="planner-status">
          <h2 id="planner-status">Planner forthcoming</h2>
          <p>
            The foundation is in place. Build planning functionality is coming
            in future updates.
          </p>
        </section>
      </main>
    </div>
  );
}
