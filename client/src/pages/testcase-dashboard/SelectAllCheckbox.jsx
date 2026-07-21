import { useEffect, useRef } from 'react';

// Reflects checked/indeterminate from how many of `paths` are currently
// selected, and toggles all of them on change — used for the per-file,
// per-group and per-category "select all" checkboxes.
const SelectAllCheckbox = ({ paths, selectedFiles, cat, onChange, title }) => {
  const ref = useRef(null);
  const selectedCount = paths.filter((p) => selectedFiles.has(p)).length;
  const allSelected = paths.length > 0 && selectedCount === paths.length;
  const indeterminate = selectedCount > 0 && selectedCount < paths.length;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="tcd-file-select"
      title={title}
      checked={allSelected}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(paths, cat, e.target.checked)}
    />
  );
};

export default SelectAllCheckbox;
