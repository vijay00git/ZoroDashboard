document.addEventListener('DOMContentLoaded', () => {
  const btnExportBackup = document.getElementById('btnExportBackup');
  const backupFileInput = document.getElementById('backupFileInput');
  const selectedFileName = document.getElementById('selectedFileName');
  const btnRestoreBackup = document.getElementById('btnRestoreBackup');

  // Utility for Toast
  function log(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) return console.log(`[${type}] ${msg}`);
    const t = document.createElement('div');
    t.className = 'toast';
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';
    t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(-10px)';
      setTimeout(() => t.remove(), 300);
    }, 4000);
  }

  // Handle Export Download
  btnExportBackup.addEventListener('click', () => {
    btnExportBackup.disabled = true;
    const originalText = btnExportBackup.innerHTML;
    btnExportBackup.innerHTML = '🔄 Preparing Backup...';
    
    // Trigger download directly via window.location
    window.location.href = 'http://localhost:3000/api/backup';
    
    log('Backup archive initiated. Your download should start shortly.', 'success');
    
    setTimeout(() => {
      btnExportBackup.innerHTML = originalText;
      btnExportBackup.disabled = false;
    }, 3000);
  });

  // Handle File Selection
  let selectedFile = null;
  backupFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.zip')) {
        log('Please select a valid .zip backup file.', 'error');
        backupFileInput.value = '';
        selectedFileName.textContent = 'No file selected';
        btnRestoreBackup.disabled = true;
        selectedFile = null;
        return;
      }
      selectedFile = file;
      selectedFileName.textContent = file.name;
      selectedFileName.style.color = 'var(--text)';
      btnRestoreBackup.disabled = false;
    } else {
      selectedFileName.textContent = 'No file selected';
      selectedFileName.style.color = 'var(--muted)';
      btnRestoreBackup.disabled = true;
      selectedFile = null;
    }
  });

  // Handle Restore
  btnRestoreBackup.addEventListener('click', async () => {
    if (!selectedFile) return;

    const confirmed = confirm("WARNING: Restoring this backup will PERMANENTLY overwrite all current data (tasks, notes, timesheets, matrices). This cannot be undone. Are you absolutely sure?");
    if (!confirmed) return;

    const formData = new FormData();
    formData.append('backup', selectedFile);

    btnRestoreBackup.disabled = true;
    btnRestoreBackup.innerHTML = '⚡ Restoring... Please wait.';

    try {
      const response = await fetch('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        log('Backup restored successfully! Refreshing dashboard...', 'success');
        backupFileInput.value = '';
        selectedFileName.textContent = 'No file selected';
        selectedFileName.style.color = 'var(--muted)';
        
        // Reload page to reflect new data safely
        setTimeout(() => {
          window.location.href = '../index.html';
        }, 2000);
      } else {
        log(`Restore failed: ${result.error}`, 'error');
        btnRestoreBackup.disabled = false;
        btnRestoreBackup.innerHTML = '⚡ Restore This Backup';
      }
    } catch (err) {
      console.error(err);
      log('An unexpected error occurred during restoration.', 'error');
      btnRestoreBackup.disabled = false;
      btnRestoreBackup.innerHTML = '⚡ Restore This Backup';
    }
  });
});
