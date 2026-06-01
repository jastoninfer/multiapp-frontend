import { ChevronLeft, ChevronRight } from "lucide-react";

export const DEFAULT_LIST_PAGE_SIZE = 15;

export function ListPagination({
  page,
  size,
  total,
  isFetching = false,
  onPageChange
}: {
  page: number;
  size: number;
  total: number;
  isFetching?: boolean;
  onPageChange: (page: number) => void;
}) {
  if (total <= size) return null;
  const start = page * size + 1;
  const end = Math.min(total, (page + 1) * size);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const canGoBack = page > 0;
  const canGoForward = page + 1 < pageCount;

  return (
    <div className="list-pagination">
      <span>{start}-{end} of {total}</span>
      <div>
        <button type="button" className="secondary" disabled={!canGoBack || isFetching} onClick={() => onPageChange(Math.max(0, page - 1))}>
          <ChevronLeft size={15} />
          Previous
        </button>
        <span>Page {page + 1} of {pageCount}</span>
        <button type="button" className="secondary" disabled={!canGoForward || isFetching} onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}>
          Next
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
