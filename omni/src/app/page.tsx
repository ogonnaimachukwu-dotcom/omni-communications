/**
 * Placeholder home. The operator cockpit (project switcher, dashboard) is built
 * in Batch 2. This exists so the app boots and the middleware gate is exercised.
 */
export default function Home() {
  return (
    <main style={{ padding: "4rem", maxWidth: 640 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>OMNI Communications</h1>
      <p style={{ marginTop: 8, color: "#6b7280" }}>
        Foundation is running. Application modules arrive in Batch 2.
      </p>
    </main>
  );
}
