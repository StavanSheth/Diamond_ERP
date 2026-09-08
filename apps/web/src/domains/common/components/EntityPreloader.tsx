import React from 'react';

export interface EntityPreloaderProps {
  viewMode?: 'grid' | 'table';
  count?: number;
  className?: string;
  cardHeight?: string;
  tableColumns?: number;
}

/**
 * Unified skeleton preloader component styled after the DiamondERP inventory section.
 * Renders high-fidelity card skeletons in grid mode and table skeletons in table mode.
 */
export const EntityPreloader: React.FC<EntityPreloaderProps> = ({
  viewMode = 'grid',
  count = 8,
  className = '',
  cardHeight = 'h-[220px]',
  tableColumns = 7,
}) => {
  const items = Array.from({ length: count }, (_, i) => i + 1);

  if (viewMode === 'table') {
    return (
      <div className={`bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xs overflow-hidden ${className}`}>
        <div className="h-1 skeleton w-full" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-container border-b border-outline-variant">
              <tr>
                {Array.from({ length: tableColumns }, (_, col) => (
                  <th key={col} className="px-md py-sm">
                    <div className="h-3 skeleton rounded w-20" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {items.map((i) => (
                <tr key={i} className="border-b border-surface-container/60">
                  <td className="px-md py-md">
                    <div className="h-4 skeleton rounded w-32 mb-1.5" />
                    <div className="h-3 skeleton rounded w-20" />
                  </td>
                  <td className="px-md py-md">
                    <div className="h-4 skeleton rounded w-24" />
                  </td>
                  <td className="px-md py-md">
                    <div className="h-4 skeleton rounded w-16" />
                  </td>
                  <td className="px-md py-md">
                    <div className="h-4 skeleton rounded w-20" />
                  </td>
                  <td className="px-md py-md">
                    <div className="h-4 skeleton rounded w-24" />
                  </td>
                  <td className="px-md py-md">
                    <div className="h-6 skeleton rounded-full w-20" />
                  </td>
                  {tableColumns > 6 && (
                    <td className="px-md py-md">
                      <div className="h-4 skeleton rounded w-16" />
                    </td>
                  )}
                  {tableColumns > 7 && (
                    <td className="px-md py-md">
                      <div className="h-4 skeleton rounded w-12" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gutter ${className}`}>
      {items.map((i) => (
        <div
          key={i}
          className={`bg-surface-container-lowest rounded-xl border border-outline-variant shadow-xs ${cardHeight} flex flex-col overflow-hidden`}
        >
          <div className="h-1 skeleton rounded-t-xl" />
          <div className="p-md flex-1 flex flex-col gap-md">
            <div className="flex items-start justify-between gap-sm">
              <div className="h-5 skeleton rounded w-2/3" />
              <div className="h-5 skeleton rounded-full w-16" />
            </div>
            <div className="h-3 skeleton rounded w-1/2" />
            <div className="flex-1" />
            <div className="h-8 skeleton rounded w-full" />
            <div className="flex items-center justify-between pt-xs">
              <div className="h-4 skeleton rounded w-1/3" />
              <div className="h-4 skeleton rounded w-1/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
