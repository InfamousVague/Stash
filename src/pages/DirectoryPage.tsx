import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { search } from '@base/primitives/icon/icons/search';
import { ServiceCard } from '../components/ServiceCard';
import { useDirectory } from '../hooks/useDirectory';
import './DirectoryPage.css';

export function DirectoryPage() {
  const { query, category, categories, filtered, searchServices, setCategory } = useDirectory();

  return (
    <div className="directory-page">
      <div className="directory-page__controls">
        <div className="directory-page__search">
          <Input
            size="sm"
            variant="outline"
            iconLeft={search}
            placeholder="Search services..."
            value={query}
            onChange={(e) => searchServices(e.target.value)}
          />
        </div>
        <div className="directory-page__filters">
          <Button
            variant={category === null ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setCategory(null)}
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={category === cat ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setCategory(category === cat ? null : cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      <div className="directory-page__grid">
        {filtered.length === 0 ? (
          <div className="directory-page__empty">
            No services match your search.
          </div>
        ) : (
          filtered.map((svc) => <ServiceCard key={svc.id} service={svc} />)
        )}
      </div>
    </div>
  );
}
