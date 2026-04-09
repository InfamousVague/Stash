import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { search } from '@base/primitives/icon/icons/search';
import { ServiceCard } from '../components/ServiceCard';
import { useDirectory } from '../hooks/useDirectory';
import './DirectoryPage.css';

const PAGE_SIZE = 20;

export function DirectoryPage() {
  const { t } = useTranslation();
  const { query, category, categories, filtered, searchServices, setCategory } = useDirectory();
  const [page, setPage] = useState(0);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const goToPage = (p: number) => {
    setPage(p);
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Reset page when filters change
  const handleSearch = (value: string) => {
    searchServices(value);
    setPage(0);
  };

  const handleCategory = (cat: string | null) => {
    setCategory(cat);
    setPage(0);
  };

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="directory-page">
      <div className="directory-page__controls">
        <div className="directory-page__search">
          <Input
            size="md"
            variant="outline"
            iconLeft={search}
            placeholder={t('directory.searchServices')}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <div className={`directory-page__filters ${showAllFilters ? '' : 'directory-page__filters--collapsed'}`}>
          <Button
            variant={category === null ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => handleCategory(null)}
          >
            {t('directory.all', { count: filtered.length })}
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={category === cat ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => handleCategory(category === cat ? null : cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
        {categories.length > 10 && (
          <button
            className="directory-page__show-all"
            onClick={() => setShowAllFilters(!showAllFilters)}
          >
            {showAllFilters ? t('directory.showLess') : t('directory.showAll', { count: categories.length })}
          </button>
        )}
      </div>

      <div className="directory-page__grid" ref={gridRef}>
        {pageItems.length === 0 ? (
          <div className="directory-page__empty">
            {t('directory.noMatch')}
          </div>
        ) : (
          pageItems.map((svc, i) => <ServiceCard key={svc.id} service={svc} style={{ animationDelay: `${i * 40}ms` }} />)
        )}
      </div>

      {totalPages > 1 && (
        <div className="directory-page__pagination">
          <Button
            variant="ghost"
            size="md"
            onClick={() => goToPage(Math.max(0, page - 1))}
            disabled={page === 0}
          >
            {t('directory.previous')}
          </Button>
          <span className="directory-page__page-info">
            {t('directory.pageOf', { page: page + 1, total: totalPages })}
          </span>
          <Button
            variant="ghost"
            size="md"
            onClick={() => goToPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
          >
            {t('directory.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
