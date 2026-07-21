import { useEffect, useMemo } from 'react';
import { CAT_ORDER, CAT_LABELS, buildTree, fileSortComparator } from './helpers';
import FileCard from './FileCard';
import SelectAllCheckbox from './SelectAllCheckbox';

const FileTree = ({
  data, activeCats, issueFilter, searchTerm, runStatus, notes, jenkinsConfig,
  selectedFiles, onToggleFileSelect, onToggleManySelect,
  openFiles, onToggleFileOpen,
  collapsedGroups, onToggleGroupCollapse,
  fileTrendMap, onRunFile, onOpenNote, onVisiblePathsChange, showToast,
  sortMode, testrailUrl,
}) => {
  const unknownIdSet = useMemo(() => new Set((data.unknownIds || []).map((u) => u.id)), [data.unknownIds]);
  const tree = useMemo(() => buildTree(data.rows), [data.rows]);
  const term = searchTerm.trim().toLowerCase();

  const sections = [];
  const visiblePaths = [];
  let totalVisible = 0;

  CAT_ORDER.forEach((cat) => {
    if (!tree[cat] || !activeCats[cat]) return;
    const groups = tree[cat];
    const catHasJobs = (jenkinsConfig.jobs[cat] || []).length > 0;
    let catRowCount = 0;
    const catSelectablePaths = [];
    const groupBlocks = [];

    Object.keys(groups).forEach((grpName) => {
      const files = groups[grpName];
      const groupSelectablePaths = [];
      const fileEls = [];

      const orderedPaths = Object.keys(files).sort(fileSortComparator(sortMode, files, fileTrendMap));

      orderedPaths.forEach((path) => {
        const rows = files[path];
        const visibleRows = rows.filter((r) => {
          if (term && `${r.id} ${r.title} ${r.path} ${r.club || ''}`.toLowerCase().indexOf(term) === -1) return false;
          if (issueFilter === 'commented' && !r.commented) return false;
          if (issueFilter === 'unknown' && !unknownIdSet.has(r.id)) return false;
          return true;
        }).map((r) => ({ ...r, __unknown: unknownIdSet.has(r.id) }));
        if (visibleRows.length === 0) return;

        visiblePaths.push(path);
        if (catHasJobs) { groupSelectablePaths.push(path); catSelectablePaths.push(path); }
        catRowCount += visibleRows.length;

        fileEls.push(
          <FileCard
            key={path}
            path={path}
            rows={rows}
            visibleRows={visibleRows}
            cat={cat}
            isOpen={term ? true : openFiles.has(path)}
            onToggleOpen={onToggleFileOpen}
            trend={fileTrendMap[path]}
            term={term}
            runStatus={runStatus}
            notes={notes}
            selectable={catHasJobs}
            selected={selectedFiles.has(path)}
            onToggleSelect={onToggleFileSelect}
            onRun={onRunFile}
            canRun={(jenkinsConfig.jobs[cat] || []).length > 0}
            onOpenNote={onOpenNote}
            showToast={showToast}
            testrailUrl={testrailUrl}
          />
        );
      });

      if (fileEls.length === 0) return;
      const groupKey = `${cat}::${grpName}`;
      groupBlocks.push(
        <div key={groupKey} className={`tcd-group-block${collapsedGroups.has(groupKey) ? ' collapsed' : ''}`}>
          <h3 className="tcd-group-title" onClick={() => onToggleGroupCollapse(groupKey)}>
            {groupSelectablePaths.length > 0 && (
              <SelectAllCheckbox
                paths={groupSelectablePaths}
                selectedFiles={selectedFiles}
                cat={cat}
                onChange={onToggleManySelect}
                title="Select all in this group"
              />
            )}
            <svg className="chev" viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" stroke="currentColor" /></svg>
            {grpName} <span className="tcd-group-sub">({fileEls.length} file{fileEls.length === 1 ? '' : 's'})</span>
          </h3>
          <div className="tcd-group-files">{fileEls}</div>
        </div>
      );
    });

    if (groupBlocks.length === 0) return;
    totalVisible += catRowCount;
    sections.push(
      <section key={cat} className="tcd-category-section">
        <div className="tcd-category-head">
          {catSelectablePaths.length > 0 && (
            <SelectAllCheckbox
              paths={catSelectablePaths}
              selectedFiles={selectedFiles}
              cat={cat}
              onChange={onToggleManySelect}
              title={`Select all in ${CAT_LABELS[cat]}`}
            />
          )}
          <div className="bar" />
          <h2>{CAT_LABELS[cat]}</h2>
          <span className="tcd-category-sub">{catRowCount} test case{catRowCount === 1 ? '' : 's'}</span>
        </div>
        {groupBlocks}
      </section>
    );
  });

  useEffect(() => {
    onVisiblePathsChange(visiblePaths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePaths.join('|')]);

  if (totalVisible === 0) {
    return (
      <div className="tcd-empty-state">
        <div className="big">No test cases match</div>
        Try a different search term or re-enable a category above.
      </div>
    );
  }

  return <div className="tcd-main">{sections}</div>;
};

export default FileTree;
