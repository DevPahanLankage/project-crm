export default function LoadingLead() {
  return (
    <div className="lead-profile">
      <div className="profile-header">
        <div>
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line skeleton-id" />
        </div>
        <div className="profile-header-actions">
          <div className="skeleton-button" />
          <div className="skeleton-button primary" />
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card skeleton-card" />
        <div className="summary-card skeleton-card" />
        <div className="summary-card skeleton-card" />
        <div className="summary-card skeleton-card" />
        <div className="summary-card skeleton-card" />
        <div className="summary-card skeleton-card" />
      </div>

      <section className="profile-section skeleton-section" />

      <div className="overview-grid">
        <section className="profile-section skeleton-section large" />
        <section className="profile-section skeleton-section" />
        <section className="profile-section skeleton-section" />
        <aside className="pinned-panel skeleton-section" />
      </div>

      <section className="profile-section skeleton-section" />
    </div>
  );
}
