import { Link } from 'react-router-dom'

// modules: [{ label, path? }]. Sayfası henüz yoksa path verme; sayfa eklenince path ekle,
// madde bağlantıya dönüşür. Sayfada birden fazla liste varsa her birine ayrı bir label ver.
export default function ModuleList({ modules, label = 'Modules' }) {
  return (
    <nav aria-label={label}>
      <ul className="module-list">
        {modules.map((module) => (
          <li key={module.label}>
            {module.path ? (
              <Link to={module.path}>{module.label}</Link>
            ) : (
              <>
                {module.label} <small>(coming soon)</small>
              </>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
