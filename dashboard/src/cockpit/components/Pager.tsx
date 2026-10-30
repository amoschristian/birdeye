interface Props {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}

export function Pager({ page, pages, onChange }: Props) {
  return (
    <div class="pager">
      <button
        type="button"
        class="pager__btn"
        disabled={page <= 0}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        ‹
      </button>
      <span class="pager__info">
        {page + 1}/{pages}
      </span>
      <button
        type="button"
        class="pager__btn"
        disabled={page >= pages - 1}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}
