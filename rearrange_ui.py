import re

with open('client/src/pages/SyncHub.jsx', 'r') as f:
    content = f.read()

# We want to replace the grid layout from `<div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', ...` 
# all the way to `      </div>\n      </div>\n      </div>\n\n      {/* Manual Test Case Modal */}`.

# First, let's extract the pieces we need:
creds_match = re.search(r'\{/\* Credentials Card \*/\}(.*?)(?=\{/\* Saved States Card \*/\})', content, re.DOTALL)
saved_states_match = re.search(r'\{/\* Saved States Card \*/\}(.*?)(?=\{/\* Sync Console Logs \*/\})', content, re.DOTALL)
sync_logs_match = re.search(r'\{/\* Sync Console Logs \*/\}(.*?)(?=\{/\* Session Info \*/\})', content, re.DOTALL)
uploader_match = re.search(r'\{/\* Uploader Zone \*/\}(.*?)(?=\{/\* Filter controls \*/\})', content, re.DOTALL)
progress_match = re.search(r'\{/\* Progress Bar \*/\}(.*?)(?=\{/\* Metrics Row \*/\})', content, re.DOTALL)
metrics_match = re.search(r'\{/\* Metrics Row \*/\}(.*?)(?=<div className="glass-panel" style=\{\{ padding: \'24px\', display: \'flex\', flexDirection: \'column\', gap: \'20px\', minHeight: \'520px\' \}\}>)', content, re.DOTALL)
filters_and_table_match = re.search(r'\{/\* Filter controls \*/\}(.*?)(\s*)\}\)\}\n\s*</div>\n\s*</div>\n\s*</div>\n\s*\{/\* Manual Test Case Modal \*/\}', content, re.DOTALL)

# Let's verify we got everything:
if not all([creds_match, saved_states_match, sync_logs_match, uploader_match, progress_match, metrics_match, filters_and_table_match]):
    print("Failed to match some sections!")
    exit(1)

# Now construct the new layout
new_grid = """      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 3fr 1.2fr',
        gap: '24px',
        alignItems: 'start'
      }}>
        
        {/* Left Column: API parameters, Upload & saved states */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Credentials Card */}
""" + creds_match.group(1) + """
          {/* Uploader Zone */}
          <div className="glass-panel" style={{ padding: '20px' }}>
""" + uploader_match.group(1) + """
          </div>
          
          {/* Saved States Card */}
""" + saved_states_match.group(1) + """
          
          {/* Sync Console Logs */}
""" + sync_logs_match.group(1) + """
        </div>

        {/* Middle Column: Ledger Dashboard & Uploader */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Progress Bar */}
""" + progress_match.group(1) + """
          {/* Metrics Row */}
""" + metrics_match.group(1) + """
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '520px' }}>
          {/* Filter controls */}
""" + filters_and_table_match.group(1) + """
          </div>
        </div>

        {/* Right Column: Status Overview & Tag Counts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Donut Chart */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)', alignSelf: 'flex-start', marginBottom: '20px' }}>Status Overview</h3>
            <div style={{ position: 'relative', width: '160px', height: '160px' }}>
              <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="18" cy="18" r="15.91549430918954" fill="transparent" stroke="var(--bg-tertiary)" strokeWidth="4"></circle>
                {mappedCases > 0 && (
                  <circle cx="18" cy="18" r="15.91549430918954" fill="transparent" stroke="#10b981" strokeWidth="4" strokeDasharray={`${(passedCases/mappedCases)*100} ${100 - (passedCases/mappedCases)*100}`} strokeDashoffset="0"></circle>
                )}
                {mappedCases > 0 && failedCases > 0 && (
                  <circle cx="18" cy="18" r="15.91549430918954" fill="transparent" stroke="#f43f5e" strokeWidth="4" strokeDasharray={`${(failedCases/mappedCases)*100} ${100 - (failedCases/mappedCases)*100}`} strokeDashoffset={`-${(passedCases/mappedCases)*100}`}></circle>
                )}
              </svg>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '2rem', fontWeight: '800' }}>{mappedCases}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '20px', fontSize: '0.8rem', fontWeight: '600' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '20px', height: '6px', background: '#10b981', borderRadius: '3px' }}></div> Passed ({passedCases})</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '20px', height: '6px', background: '#f43f5e', borderRadius: '3px' }}></div> Failed ({failedCases})</div>
            </div>
          </div>

          {/* Tag Counts */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Tag Counts</h3>
            {tagList.length === 0 ? (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>No tags available.</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                {tagList.map(([tag, stats]) => (
                  <div key={tag} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ background: 'rgba(168,85,247,0.1)', color: 'var(--accent-purple)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold' }}>#{tag}</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{stats.total}</span>
                    </div>
                    <div style={{ display: 'flex', width: '100%', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${(stats.passed/stats.total)*100}%`, background: '#10b981' }}></div>
                      <div style={{ width: `${(stats.failed/stats.total)*100}%`, background: '#f43f5e' }}></div>
                      <div style={{ flexGrow: 1, background: 'var(--bg-tertiary)' }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: '600' }}>
                      <span style={{ color: '#10b981' }}>Pass: {stats.passed}</span>
                      <span style={{ color: '#f43f5e' }}>Fail: {stats.failed}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Manual Test Case Modal */}\n"""

# Perform replacement
content = re.sub(r'      <div style=\{\{\n\s*display: \'grid\',\n\s*gridTemplateColumns: \'1\.2fr 2fr\',\n.*?\{\/\* Manual Test Case Modal \*\/\}', new_grid, content, flags=re.DOTALL)

with open('client/src/pages/SyncHub.jsx', 'w') as f:
    f.write(content)

print("Layout replaced successfully!")
