import React from "react";
import { LuChevronLeft as ChevronLeft, LuChevronRight as ChevronRight, LuEllipsis } from "react-icons/lu";
import "./AdminPagination.css";

function PageControls({ page, pages, onChange }) {
  const getPageNumbers = () => {
    const result = [];
    const maxVisible = 5;
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, page - half);
    let end = Math.min(pages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    if (start > 1) { result.push(1); if (start > 2) result.push('ellipsis'); }
    for (let i = start; i <= end; i++) result.push(i);
    if (end < pages) { if (end < pages - 1) result.push('ellipsis'); result.push(pages); }
    return result;
  };

  return <>
    <button className="page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior"><ChevronLeft /></button>
    {getPageNumbers().map((item, idx) =>
      item === 'ellipsis' ? (
        <span key={`e-${idx}`} className="page-ellipsis"><LuEllipsis /></span>
      ) : (
        <button key={item} className={`page-btn page-number ${item === page ? 'active' : ''}`}
          onClick={() => onChange(item)} disabled={item === page}
          aria-label={`Página ${item}`} aria-current={item === page ? 'page' : undefined}
        >{item}</button>
      )
    )}
    <button className="page-btn" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Página siguiente"><ChevronRight /></button>
  </>;
}

export default function AdminPagination({ page, pages, total, onChange, pageSize, onPageSizeChange, compact }) {
  if (pages <= 1) return compact ? null : <p className="pagination-summary">{total} {total === 1 ? "registro" : "registros"}</p>;
  if (compact) {
    return (
      <div className="admin-pagination admin-pagination-top">
        <div className="pagination-controls">
          {onPageSizeChange && (
            <select value={pageSize} onChange={(event) => onPageSizeChange(event.target.value)}>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="all">Todos</option>
            </select>
          )}
        </div>
        <div className="pagination-controls">
          <PageControls page={page} pages={pages} onChange={onChange} />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-pagination">
      <span>{total} registros · Página {page} de {pages}</span>
      {onPageSizeChange && (
        <label>
          <select value={pageSize} onChange={(event) => onPageSizeChange(event.target.value)}>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="all">Todos</option>
          </select>
        </label>
      )}
      <div className="pagination-controls">
        <PageControls page={page} pages={pages} onChange={onChange} />
      </div>
    </div>
  );
}