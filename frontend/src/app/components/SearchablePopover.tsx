"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

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
  emptyAction?: SearchableItem;
  footerItems?: SearchableItem[];
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
  emptyAction,
  footerItems = [],
  disabled = false,
  onChange,
  buttonClassName = "",
}: SearchablePopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.value === value),
    [items, value]
  );

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
      const input = containerRef.current?.querySelector("input");
      input?.focus();
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
          <Command
            className="rounded-lg border-none"
            shouldFilter
            loop
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              className="text-xs"
            />
            <CommandList className="text-xs">
              <CommandEmpty>
                <div className="px-3 text-sm text-gray-400">{emptyText}</div>
                {emptyAction && (
                  <button
                    type="button"
                    onClick={() => handleSelect(emptyAction)}
                    className="mt-2 flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-xs font-medium text-blue-600 hover:bg-blue-50"
                  >
                    {emptyAction.label}
                    {emptyAction.subLabel && (
                      <span className="text-[11px] text-blue-500">
                        {emptyAction.subLabel}
                      </span>
                    )}
                  </button>
                )}
              </CommandEmpty>
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.label}
                    keywords={[item.searchValue, item.subLabel].filter(
                      (keyword): keyword is string => Boolean(keyword)
                    )}
                    onSelect={() => handleSelect(item)}
                    className={`flex flex-col items-start text-left ${
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
                  </CommandItem>
                ))}
              </CommandGroup>
              {footerItems.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    {footerItems.map((item) => (
                      <CommandItem
                        key={item.value}
                        value={item.label}
                        keywords={[item.searchValue, item.subLabel].filter(
                          (keyword): keyword is string => Boolean(keyword)
                        )}
                        onSelect={() => handleSelect(item)}
                        className="flex flex-col items-start text-left text-blue-600"
                      >
                        {item.label}
                        {item.subLabel && (
                          <span className="text-[11px] text-blue-500">
                            {item.subLabel}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
