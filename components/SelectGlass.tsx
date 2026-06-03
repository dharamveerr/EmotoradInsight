"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom"; // portal fix

interface Option {
  value: string;
  label: string;
}

interface SelectGlassProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  className?: string;
}

export default function SelectGlass({ value, onChange, options, className = "" }: SelectGlassProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  // SSR guard
  useEffect(() => { setMounted(true); }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    function update() {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setMenuStyle({
        position: "fixed",
        top: r.bottom + 6,
        left: r.left,
        width: r.width,
        zIndex: 9999,
      });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  function toggleOpen() {
    if (open) { setOpen(false); return; }
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: r.bottom + 6,
      left: r.left,
      width: r.width,
      zIndex: 9999,
    });
    setOpen(true);
  }

  const menu = mounted && open ? createPortal(
    <ul
      ref={menuRef}
      role="listbox"
      className="select-glass-menu rounded-xl overflow-hidden"
      style={{
        ...menuStyle,
        background: "rgba(10, 20, 40, 0.97)",
        border: "1px solid rgba(34, 197, 94, 0.3)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(34,197,94,0.08)",
      }}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <li
            key={opt.value}
            role="option"
            aria-selected={isActive}
            onClick={() => { onChange(opt.value); setOpen(false); }}
            className="flex items-center justify-between px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors duration-100"
            style={{
              color: isActive ? "#22c55e" : "#cbd5e1",
              background: isActive ? "rgba(34,197,94,0.08)" : "transparent",
            }}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLLIElement).style.background = "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) (e.currentTarget as HTMLLIElement).style.background = "transparent";
            }}
          >
            <span>{opt.label}</span>
            {isActive && (
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </li>
        );
      })}
    </ul>,
    document.body
  ) : null;

  return (
    <div className={`relative inline-block ${className}`} style={{ minWidth: 200 }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className="select-glass w-full flex items-center justify-between gap-3 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label ?? "Select…"}</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4 shrink-0 text-green-400 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {menu}
    </div>
  );
}
