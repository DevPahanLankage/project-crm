"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CountryCode } from "@/components/country-code";
import type { CountryFilterOption } from "@/lib/leads/types";

export function CountryFilter({ options, selectedCodes }: { options: CountryFilterOption[]; selectedCodes: string[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(selectedCodes);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleOptions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return options;
    return options.filter((option) => option.code.toLocaleLowerCase().includes(term) || option.name.toLocaleLowerCase().includes(term));
  }, [options, search]);

  const selectedLabels = selected.map((code) => options.find((option) => option.code === code)?.name ?? code);
  const label = selected.length === 0
    ? "All countries"
    : selected.length <= 2
      ? selectedLabels.join(", ")
      : `${selected.length} countries selected`;
  const allSelected = options.length > 0 && options.every((option) => selectedSet.has(option.code));

  function toggle(code: string) {
    setSelected((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  function toggleAll() {
    setSelected(allSelected ? [] : options.map((option) => option.code));
  }

  return (
    <div className="country-filter" ref={rootRef} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      {selected.map((code) => <input key={code} type="hidden" name="country" value={code} />)}
      <button className="country-filter-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>{label}</span>
      </button>
      {open && (
        <div className="country-filter-popover">
          <div className="country-filter-title">Country</div>
          <input className="country-filter-search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search countries..." autoFocus />
          <button className="country-filter-select-all" type="button" onClick={toggleAll}>
            <span className={allSelected ? "country-check checked" : "country-check"} aria-hidden="true" />
            Select all
          </button>
          <div className="country-filter-list" role="listbox" aria-multiselectable="true">
            {visibleOptions.length ? visibleOptions.map((option) => (
              <label className="country-filter-option" key={option.code}>
                <input type="checkbox" checked={selectedSet.has(option.code)} onChange={() => toggle(option.code)} />
                <CountryCode code={option.code} />
                <span className="country-filter-name">{option.name}</span>
                <span className="country-filter-count">({option.count.toLocaleString("en-US")})</span>
              </label>
            )) : <p className="country-filter-empty">No matching countries</p>}
          </div>
        </div>
      )}
    </div>
  );
}
