import React, { useState, useEffect, useRef, useMemo, useId } from 'react';

export interface SearchOption<T = any> {
  value: string;
  label: string;
  sublabel?: string;
  badge?: {
    text: string;
    className?: string;
  };
  icon?: string;
  data?: T;
}

export interface SearchableSelectProps<T = any> {
  options: SearchOption<T>[];
  value: string;
  onChange: (value: string, option?: SearchOption<T>) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  icon?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  className?: string;
  triggerClassName?: string;
  onAddNew?: () => void;
  addNewText?: string;
}

export function SearchableSelect<T = any>({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  searchPlaceholder = 'Type to search...',
  emptyMessage = 'No matching options found',
  icon,
  disabled = false,
  required = false,
  allowClear = true,
  className = '',
  triggerClassName = '',
  onAddNew,
  addNewText,
}: SearchableSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectId = useId();

  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(q);
      const matchSub = opt.sublabel?.toLowerCase().includes(q);
      const matchBadge = opt.badge?.text?.toLowerCase().includes(q);
      return matchLabel || matchSub || matchBadge;
    });
  }, [options, searchQuery]);

  // Handle outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setHighlightedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current && filteredOptions.length > 0) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen, filteredOptions.length]);

  const handleSelect = (opt: SearchOption<T>) => {
    onChange(opt.value, opt);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < filteredOptions.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`} onKeyDown={handleKeyDown}>
      {/* Hidden input for form requirements */}
      {required && (
        <input
          type="text"
          name={`select-${selectId}`}
          value={value || ''}
          onChange={() => {}}
          required={required}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-sm px-md h-10 border rounded-lg bg-white text-left transition-all shadow-2xs font-body-md ${
          isOpen
            ? 'border-primary ring-2 ring-primary/20'
            : 'border-outline-variant hover:border-outline'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-surface-container-lowest' : 'cursor-pointer'} ${triggerClassName}`}
      >
        <div className="flex items-center gap-sm flex-1 min-w-0">
          {icon && (
            <span className="material-symbols-outlined text-[18px] text-outline shrink-0">
              {icon}
            </span>
          )}
          {selectedOption ? (
            <div className="flex items-center gap-xs flex-1 min-w-0" title={`${selectedOption.label}${selectedOption.sublabel ? ` (${selectedOption.sublabel})` : ''}`}>
              <span className="text-sm font-bold text-on-surface truncate">
                {selectedOption.label}
              </span>
              {selectedOption.badge && (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                    selectedOption.badge.className || 'bg-primary-container text-on-primary-container border-primary/20'
                  }`}
                >
                  {selectedOption.badge.text}
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm text-outline truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-xs shrink-0 text-outline">
          {allowClear && selectedOption && !disabled && (
            <span
              onClick={handleClear}
              title="Clear selection"
              className="p-0.5 hover:bg-surface-container rounded-full hover:text-error transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </span>
          )}
          <span className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`}>
            arrow_drop_down
          </span>
        </div>
      </button>

      {/* Floating Dropdown: Expanded width so options are never clipped */}
      {isOpen && (
        <div className="absolute z-50 left-0 mt-1 min-w-[340px] sm:min-w-[380px] max-w-[92vw] w-max bg-white border border-outline-variant rounded-xl shadow-2xl overflow-hidden flex flex-col animate-fade-in-up">
          {/* Search Header */}
          <div className="p-xs bg-surface-container-lowest border-b border-outline-variant flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px] text-outline ml-xs">search</span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              placeholder={searchPlaceholder}
              className="w-full px-xs py-1 text-sm bg-transparent border-none outline-none focus:ring-0 text-on-surface placeholder:text-outline font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 text-outline hover:text-on-surface mr-xs"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          {/* Options List */}
          <div ref={listRef} className="max-h-64 overflow-y-auto p-xs flex flex-col gap-0.5">
            {filteredOptions.length === 0 ? (
              <div className="py-md px-sm text-center text-xs text-on-surface-variant flex flex-col items-center gap-1">
                <span className="material-symbols-outlined text-[24px] text-outline">search_off</span>
                <span>{emptyMessage}</span>
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`px-sm py-2 rounded-lg flex items-center justify-between gap-sm cursor-pointer text-sm transition-colors ${
                      isSelected
                        ? 'bg-primary/10 text-primary font-bold'
                        : isHighlighted
                        ? 'bg-surface-container-low text-on-surface'
                        : 'text-on-surface hover:bg-surface-container-lowest'
                    }`}
                  >
                    <div className="flex items-center gap-sm min-w-0 flex-1">
                      {opt.icon ? (
                        <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                          {opt.icon}
                        </span>
                      ) : (
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-primary' : 'bg-outline-variant'}`} />
                      )}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-semibold text-on-surface text-sm break-words leading-snug">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="text-[11px] text-on-surface-variant break-words">
                            {opt.sublabel}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-xs shrink-0 ml-sm">
                      {opt.badge && (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                            opt.badge.className || 'bg-surface-container text-on-surface-variant border-outline-variant'
                          }`}
                        >
                          {opt.badge.text}
                        </span>
                      )}
                      {isSelected && (
                        <span className="material-symbols-outlined text-[18px] text-primary">
                          check
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {onAddNew && (
            <div className="p-xs border-t border-outline-variant/60 bg-surface-bright sticky bottom-0 z-10">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  onAddNew();
                }}
                className="w-full flex items-center justify-center gap-xs px-sm py-1.5 rounded-lg bg-primary/5 hover:bg-primary/10 text-primary text-xs font-bold transition-colors border border-primary/20 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>{addNewText || 'Add New'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
