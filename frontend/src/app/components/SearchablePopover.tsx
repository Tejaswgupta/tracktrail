"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableItem = {
  value: string;
  label: string;
  subLabel?: string;
  searchValue?: string;
};

interface SearchablePopoverProps {
  value: string;
  items: SearchableItem[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  buttonClassName?: string;
}

export default function SearchablePopover({
  value,
  items,
  placeholder,
  searchPlaceholder = "Search...",
  emptyText = "No options found",
  disabled = false,
  onChange,
  buttonClassName = "",
}: SearchablePopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.value === value),
    [items, value]
  );

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const normalized = query.toLowerCase();
    return items.filter((item) => {
      const haystack =
        item.searchValue || `${item.label} ${item.subLabel || ""}`;
      return haystack.toLowerCase().includes(normalized);
    });
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const handleSelect = (item: SearchableItem) => {
    onChange(item.value);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-2 text-left text-xs font-semibold text-gray-900 ${
          disabled ? "cursor-not-allowed text-gray-400" : ""
        } ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selectedItem ? "" : "text-gray-400"}>
          {selectedItem ? selectedItem.label : placeholder}
        </span>
        <svg
          className="h-4 w-4 text-gray-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div
            role="listbox"
            className="max-h-64 overflow-auto py-1 text-xs"
          >
            {filteredItems.length === 0 ? (
              <div className="px-3 py-2 text-gray-400">{emptyText}</div>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={`flex w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-50 ${
                    item.value === value ? "bg-blue-50" : ""
                  }`}
                >
                  <span className="font-medium text-gray-900">
                    {item.label}
                  </span>
                  {item.subLabel && (
                    <span className="text-[11px] text-gray-500">
                      {item.subLabel}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
