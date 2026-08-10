import { useEffect, useRef } from 'react';

// Case-id counterpart to SelectAllCheckbox (which drives the path-keyed
// selectedFiles Map used for run-queueing) — this one drives selectedCases,
// the Set of individual case ids used for bulk tagging. Reflects
// checked/indeterminate from how many of `caseIds` are currently selected,
// and toggles all of them on change.
const SelectAllCasesCheckbox = ({ caseIds, selectedCases, onChange, title }) => {
  const ref = useRef(null);
  const selectedCount = caseIds.filter((id) => selectedCases.has(id)).length;
  const allSelected = caseIds.length > 0 && selectedCount === caseIds.length;
  const indeterminate = selectedCount > 0 && selectedCount < caseIds.length;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="tcd-case-select"
      title={title}
      checked={allSelected}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(caseIds, e.target.checked)}
    />
  );
};

export default SelectAllCasesCheckbox;
