// Helper Tools (device checker nodes).
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { HT_DIR, SSHClient, fs, path, writeJsonAtomic } = ctx;

    // ════════════════════════════════════════════
    // HELPER TOOLS — a growing grab-bag of small ops utilities, each its own
    // page section below as they get added. First one: "Node Device Checker" —
    // SSH into a saved lab node and list its connected Android devices (serial,
    // online/offline/unauthorized status, model, Android version). Nodes
    // (host/port/username/password) are saved so a check is a single click
    // afterward, same local-JSON-file convention as every other page's stores.
    // ════════════════════════════════════════════

    const HT_NODES_PATH = path.join(HT_DIR, 'nodes.json');

    let htNodesCache = null;
    function htLoadNodes() {
        if (htNodesCache) return htNodesCache;
        try {
            htNodesCache = JSON.parse(fs.readFileSync(HT_NODES_PATH, 'utf8'));
        } catch (e) {
            htNodesCache = [];
        }
        return htNodesCache;
    }
    function htSaveNodes() {
        try {
            writeJsonAtomic(HT_NODES_PATH, htNodesCache || []);
        } catch (e) {
            console.error('[helper-tools] failed to save nodes:', e.message);
        }
    }
    function htFindNode(id) {
        return htLoadNodes().find((n) => n.id === id);
    }
    // Never echoes the stored password back to the client — the edit form just
    // leaves that field blank, and PUT only overwrites it when a new one is typed.
    // lastCheck rides along so a result stays on screen across a page reload or
    // navigating away and back, instead of only living in the component's own
    // state until the next click.
    function htPublicNode(n) {
        return {
            id: n.id, name: n.name, host: n.host, port: n.port, username: n.username,
            hasPassword: !!n.password, createdAt: n.createdAt, updatedAt: n.updatedAt,
            lastCheck: n.lastCheck || null,
        };
    }

    app.get('/api/helper-tools/nodes', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(htLoadNodes().map(htPublicNode));
    });

    app.post('/api/helper-tools/nodes', (req, res) => {
        const { name, host, port, username, password } = req.body || {};
        if (!name || !host || !username || !password) {
            return res.status(400).json({ error: 'name, host, username, and password are all required' });
        }
        const nodes = htLoadNodes();
        const node = {
            id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: String(name).trim(),
            host: String(host).trim(),
            port: port ? (parseInt(port, 10) || 22) : 22,
            username: String(username).trim(),
            password: String(password),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        nodes.push(node);
        htSaveNodes();
        res.json(htPublicNode(node));
    });

    app.put('/api/helper-tools/nodes/:id', (req, res) => {
        const node = htFindNode(req.params.id);
        if (!node) return res.status(404).json({ error: 'Node not found' });
        const { name, host, port, username, password } = req.body || {};
        if (name) node.name = String(name).trim();
        if (host) node.host = String(host).trim();
        if (port) node.port = parseInt(port, 10) || node.port;
        if (username) node.username = String(username).trim();
        if (password) node.password = String(password); // blank/omitted keeps the existing one
        node.updatedAt = Date.now();
        htSaveNodes();
        res.json(htPublicNode(node));
    });

    app.delete('/api/helper-tools/nodes/:id', (req, res) => {
        const nodes = htLoadNodes();
        const idx = nodes.findIndex((n) => n.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Node not found' });
        nodes.splice(idx, 1);
        htSaveNodes();
        res.json({ deleted: true });
    });

    // Runs a command over SSH (password auth) and resolves with its full
    // stdout/stderr/exit code. A manual timer backstops ssh2's own readyTimeout
    // since that only covers the handshake — once connected, a remote command
    // that hangs (e.g. adb waiting on a wedged device) would otherwise hold the
    // request open indefinitely.
    function htRunRemoteCommand(node, command, timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const conn = new SSHClient();
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                conn.end();
                reject(new Error(`Connection to ${node.host} timed out after ${Math.round(timeoutMs / 1000)}s — check VPN/network and that the host is reachable.`));
            }, timeoutMs);

            conn.on('ready', () => {
                conn.exec(command, (err, stream) => {
                    if (err) {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        conn.end();
                        return reject(err);
                    }
                    let stdout = '';
                    let stderr = '';
                    stream.on('close', (code) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        conn.end();
                        resolve({ stdout, stderr, code });
                    }).on('data', (data) => { stdout += data.toString(); })
                      .stderr.on('data', (data) => { stderr += data.toString(); });
                });
            }).on('error', (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(err);
            }).connect({
                host: node.host,
                port: node.port || 22,
                username: node.username,
                password: node.password,
                readyTimeout: timeoutMs,
            });
        });
    }

    // Resolves adb via `command -v` first, falling back to a few common SDK
    // install locations — a bare `adb devices` is exactly the kind of command
    // that works fine over an interactive login (where .bashrc ran) but silently
    // "command not found"s over a non-interactive SSH exec (which many distros'
    // .bashrc skips early for non-interactive shells), so this is a real,
    // likely-to-happen failure mode on a device-lab box, not hypothetical.
    // For each 'device'-status entry it additionally pulls the model + Android
    // version via getprop; offline/unauthorized entries can't be queried (ADB
    // can't talk to them), so those two fields are left blank for those rows.
    const HT_DEVICE_CHECK_CMD = `
ADB_BIN=$(command -v adb 2>/dev/null)
if [ -z "$ADB_BIN" ]; then
  for p in "$HOME/Android/Sdk/platform-tools/adb" "$HOME/android-sdk/platform-tools/adb" "/opt/android-sdk/platform-tools/adb" "/usr/local/bin/adb" "/usr/bin/adb"; do
    if [ -x "$p" ]; then ADB_BIN="$p"; break; fi
  done
fi
if [ -z "$ADB_BIN" ]; then
  echo "__ADB_NOT_FOUND__"
  exit 127
fi
"$ADB_BIN" devices | tail -n +2 | sed '/^\\s*$/d' | while read -r serial status; do
  if [ "$status" = "device" ]; then
    # </dev/null on both of these is load-bearing, not cosmetic: without it,
    # "adb shell" inherits this loop's own stdin (the piped "adb devices"
    # list being read by the outer \`read\`) and silently drains the rest of
    # it, so only the FIRST device ever gets processed even when several are
    # connected — the loop looks like it exits cleanly, it's actually just
    # starved of further input.
    model=$("$ADB_BIN" -s "$serial" shell getprop ro.product.model 2>/dev/null </dev/null | tr -d '\\r\\n')
    ver=$("$ADB_BIN" -s "$serial" shell getprop ro.build.version.release 2>/dev/null </dev/null | tr -d '\\r\\n')
    echo "$serial|$status|$model|$ver"
  else
    echo "$serial|$status||"
  fi
done
`.trim();

    function htParseDeviceOutput(stdout) {
        return stdout.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
            const [serial, status, model, androidVersion] = line.split('|');
            return { serial, status, model: model || null, androidVersion: androidVersion || null };
        });
    }

    app.post('/api/helper-tools/nodes/:id/check-devices', async (req, res) => {
        const node = htFindNode(req.params.id);
        if (!node) return res.status(404).json({ error: 'Node not found' });
        try {
            const { stdout, stderr, code } = await htRunRemoteCommand(node, HT_DEVICE_CHECK_CMD);
            if (stdout.trim() === '__ADB_NOT_FOUND__') {
                const error = `adb was not found on ${node.host} (checked PATH and common SDK install locations). ` +
                    'SSH in manually, run `command -v adb` to find its real path, and let me know so it can be added.';
                node.lastCheck = { error, checkedAt: new Date().toISOString() };
                htSaveNodes();
                return res.status(502).json({ error });
            }
            const result = { devices: htParseDeviceOutput(stdout), stderr: stderr || null, exitCode: code, checkedAt: new Date().toISOString() };
            node.lastCheck = result;
            htSaveNodes();
            res.json(result);
        } catch (err) {
            const error = String(err && err.message || err);
            node.lastCheck = { error, checkedAt: new Date().toISOString() };
            htSaveNodes();
            res.status(502).json({ error });
        }
    });

    return {};
};
