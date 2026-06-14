const fs = require('fs');
const path = require('path');

const dashPath = path.join(__dirname, 'client/src/pages/Dashboard.jsx');
let content = fs.readFileSync(dashPath, 'utf8');

// The widgets map string to insert
const widgetsMapStr = `  const widgetsMap = {
    learning: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} style={{ color: 'var(--accent-purple)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Active Learning</h3>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{activeGoalName}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(168, 85, 247, 0.1)', color: 'var(--accent-purple)', padding: '4px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
            <Award size={12} /> Lvl {currentLevel.icon}
          </div>
        </div>
        <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: \`\${progressPercentage}%\`, height: '100%', background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-pink))' }}></div>
        </div>
        <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', minHeight: '140px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {flashcards.length > 0 && (
            <>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--accent-pink)', marginBottom: '8px' }}>
                {flashcards[currentCardIdx]?.title}
              </span>
              <p style={{ fontSize: '0.95rem', lineHeight: '1.5', fontWeight: '500' }}>
                {flashcards[currentCardIdx]?.text}
              </p>
            </>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
            Card {currentCardIdx + 1} / {flashcards.length}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setCurrentCardIdx(prev => Math.max(0, prev - 1))} disabled={currentCardIdx === 0} style={{ padding: '6px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer', opacity: currentCardIdx === 0 ? 0.4 : 1, color: 'var(--text-primary)' }}>
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setCurrentCardIdx(prev => Math.min(flashcards.length - 1, prev + 1))} disabled={currentCardIdx === flashcards.length - 1} style={{ padding: '6px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer', opacity: currentCardIdx === flashcards.length - 1 ? 0.4 : 1, color: 'var(--text-primary)' }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    ),
    events: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={18} style={{ color: 'var(--accent-orange)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Upcoming Events</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {upcomingEvents.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '24px 0', color: 'var(--text-muted)' }}>
              <Calendar size={32} style={{ opacity: 0.4 }} />
              <span style={{ fontSize: '0.85rem' }}>No upcoming events scheduled.</span>
            </div>
          ) : (
            upcomingEvents.map((evt, idx) => {
              const dateStr = evt.start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
              const timeStr = evt.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={idx} style={{ display: 'flex', gap: '12px', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '10px', alignItems: 'center' }}>
                  <div style={{ background: 'rgba(249, 115, 22, 0.15)', color: 'var(--accent-orange)', padding: '8px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.85rem', textAlign: 'center', minWidth: '45px' }}>
                    {evt.start.getDate()}
                  </div>
                  <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{evt.summary}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dateStr} • {timeStr}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    ),
    scratchpad: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={18} style={{ color: 'var(--accent-green)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Scratchpad</h3>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Autosaves</span>
        </div>
        <textarea
          value={scratchpadContent}
          onChange={handleScratchpadChange}
          placeholder="Jot down quick thoughts..."
          style={{ width: '100%', minHeight: '140px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px', borderRadius: '10px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', resize: 'vertical', outline: 'none' }}
        />
      </div>
    ),
    tasks: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={18} style={{ color: 'var(--accent-cyan)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Status Checklist</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tasks.filter(t => !t.completed).length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '24px 0', color: 'var(--text-muted)' }}>
              <CheckSquare size={32} style={{ opacity: 0.4, color: 'var(--accent-green)' }} />
              <span style={{ fontSize: '0.85rem' }}>All caught up! Outstanding.</span>
            </div>
          ) : (
            tasks.filter(t => !t.completed).slice(0, 6).map(task => (
              <div key={task.id} onClick={() => handleToggleTask(task.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s ease' }} className="nav-item-hover">
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}></div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '500' }}>{task.title}</span>
              </div>
            ))
          )}
        </div>
      </div>
    ),
    draft: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} style={{ color: '#fbbf24' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Daily Status Draft</h3>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Autosaves</span>
        </div>
        <textarea
          value={statusDraft}
          onChange={handleStatusDraftChange}
          placeholder="What did you work on today? Jot it down here so it's ready for 5PM..."
          style={{ width: '100%', minHeight: '120px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px', borderRadius: '10px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', resize: 'vertical', outline: 'none' }}
        />
      </div>
    ),
    status_mini_grid: (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center' }}>
          <Droplet size={24} style={{ color: 'var(--accent-cyan)' }} />
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Hydration</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stats.water} ml</span>
          </div>
          <button onClick={handleAddWaterQuick} className="glow-btn" style={{ width: '100%', justifyContent: 'center', background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-cyan)', border: '1px solid rgba(6, 182, 212, 0.3)', boxShadow: 'none', padding: '8px' }}>
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center' }}>
          <Clock size={24} style={{ color: isClockedIn ? 'var(--accent-green)' : 'var(--text-muted)' }} />
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Timesheet</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{isClockedIn ? clockInTime : 'Out'}</span>
          </div>
          <button onClick={handleTogglePunch} className="glow-btn" style={{ width: '100%', justifyContent: 'center', background: isClockedIn ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: isClockedIn ? 'var(--accent-red)' : 'var(--accent-green)', border: \`1px solid \${isClockedIn ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}\`, boxShadow: 'none', padding: '8px' }}>
            {isClockedIn ? 'Out' : 'In'}
          </button>
        </div>
      </div>
    ),
    matrix: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={18} style={{ color: 'var(--accent-purple)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Pinned Matrix</h3>
          </div>
          {pinnedMatrix && <span style={{ fontSize: '0.75rem', background: 'var(--bg-primary)', padding: '4px 8px', borderRadius: '12px', border: '1px solid var(--border-color)', fontWeight: 'bold' }}>{pinnedMatrix.testCaseCount || 0} Cases</span>}
        </div>
        {pinnedMatrix ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
              {pinnedMatrix.name}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-green)' }}>{pinnedMatrix.statusCounts?.PASSED || 0}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Passed</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-red)' }}>{pinnedMatrix.statusCounts?.FAILED || 0}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Failed</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-yellow)' }}>{pinnedMatrix.statusCounts?.UNTESTED || 0}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Untested</div>
              </div>
            </div>
            <button onClick={() => navigate('/synchub')} className="glow-btn" style={{ width: '100%', justifyContent: 'center', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px', marginTop: '4px', boxShadow: 'none' }}>
              Open Sync Hub
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0', color: 'var(--text-muted)' }}>
            <Database size={32} style={{ opacity: 0.4 }} />
            <span style={{ fontSize: '0.85rem' }}>No matrix pinned</span>
            <button onClick={() => navigate('/synchub')} style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '16px', color: 'var(--text-primary)', cursor: 'pointer' }}>
              Go to Sync Hub
            </button>
          </div>
        )}
      </div>
    ),
    links: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Compass size={18} style={{ color: 'var(--accent-pink)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Frequently Visited</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {quickLinks.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px 0', color: 'var(--text-muted)' }}>
              <Compass size={28} style={{ opacity: 0.4 }} />
              <span style={{ fontSize: '0.85rem' }}>No links available.</span>
            </div>
          ) : (
            quickLinks.map((link, idx) => (
              <a key={idx} href={link.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: '10px', textDecoration: 'none', color: 'var(--text-primary)' }} className="nav-item-hover" onClick={() => { fetch('http://localhost:3000/api/quicklaunch/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: link.id }) }).catch(() => {}); }}>
                <span style={{ fontSize: '1.2rem' }}>{link.emoji || '🔗'}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{link.name || link.title}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '10px' }}>{link.clicks || 0}</span>
              </a>
            ))
          )}
        </div>
      </div>
    ),
    clocks: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Globe size={18} style={{ color: '#6366f1' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>World Clocks</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { label: '🇯🇵 Tokyo', tz: 'Asia/Tokyo' },
            { label: '🇬🇧 London', tz: 'Europe/London' },
            { label: '🇺🇸 New York', tz: 'America/New_York' },
            { label: '🇺🇸 Los Angeles', tz: 'America/Los_Angeles' }
          ].map((clock, idx) => (
            <WorldClockItem key={idx} label={clock.label} tz={clock.tz} />
          ))}
        </div>
      </div>
    )
  };
`;

const renderedGridStr = `      {/* Main Grid: Sortable & Toggleable */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gridAutoFlow: 'dense',
        gap: '24px',
        alignItems: 'start'
      }}>
        {widgetOrder.filter(w => w.enabled !== false).map((w, index) => (
          <div 
            key={w.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragOver={handleDragOver}
            style={{ cursor: 'grab', display: 'flex', flexDirection: 'column' }}
          >
            {widgetsMap[w.id]}
          </div>
        ))}
      </div>`;

// Insert widgetsMap before return
const returnIndex = content.indexOf('  return (\n');
content = content.slice(0, returnIndex) + widgetsMapStr + '\n' + content.slice(returnIndex);

// Replace grid
const gridStart = content.indexOf('{/* Main Grid: 3 Columns Desktop */}');
const gridEnd = content.indexOf('    </div>\n  );\n};');
content = content.slice(0, gridStart) + renderedGridStr + '\n' + content.slice(gridEnd);

fs.writeFileSync(dashPath, content, 'utf8');
