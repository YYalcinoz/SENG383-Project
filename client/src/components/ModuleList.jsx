import { Link } from 'react-router-dom'

// modules: [{ label, path? }]. Sayfası henüz yoksa path verme; sayfa eklenince path ekle,
// madde bağlantıya dönüşür.
export default function ModuleList({ modules }) {
  return (
    <nav aria-label="Modules">
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
