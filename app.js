// ===============================================================
// The Final, Structurally Correct, Complete app.js
// ===============================================================

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const session = require('express-session');

// --- 环境变量与常量定义 (全部放在顶部) ---
const USERNAME = process.env.USERNAME || 'admin';
const PASSWORD = process.env.PASSWORD || 'admin';
const API_URL = process.env.API_URL || 'https://sublink.eooce.com';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');

let subscriptions = [];
let nodes = '';
let credentials = { username: USERNAME, password: PASSWORD };

// --- 辅助函数定义 (紧随常量之后) ---
function getSystemUsername() {
    try {
        return execSync('whoami').toString().trim().toLowerCase();
    } catch (error) {
        console.error('Error getting system username:', error);
        return 'admin';
    }
}

function generateRandomString() {
    const user = getSystemUsername();
    const hostname = os.hostname();
    const uniqueString = `${hostname}-${user}`;
    const hash = crypto.createHash('md5').update(uniqueString).digest('hex');
    return hash.slice(0, 20);
}

const SUB_TOKEN = process.env.SUB_TOKEN || generateRandomString();

// --- 数据持久化函数 (需要访问常量，所以放在这里) ---
async function ensureDataDir() { try { await fs.access(DATA_DIR); } catch { await fs.mkdir(DATA_DIR, { recursive: true }); } }
async function initializeCredentialsFile() { try { await fs.access(CREDENTIALS_FILE); } catch { await fs.writeFile(CREDENTIALS_FILE, JSON.stringify({ username: USERNAME, password: PASSWORD }, null, 2)); } }
async function initializeDataFile() { try { const data = await fs.readFile(DATA_FILE, 'utf8'); const parsed = JSON.parse(data); subscriptions = parsed.subscriptions || []; nodes = parsed.nodes || ''; } catch { await fs.writeFile(DATA_FILE, JSON.stringify({ subscriptions: [], nodes: '' }, null, 2)); subscriptions = []; nodes = ''; } }
async function loadCredentials() { try { await initializeCredentialsFile(); const data = await fs.readFile(CREDENTIALS_FILE, 'utf8'); return JSON.parse(data); } catch { return { username: USERNAME, password: PASSWORD }; } }
async function saveCredentials(creds) { try { await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2)); return true; } catch { return false; } }
async function loadData() { try { const data = await fs.readFile(DATA_FILE, 'utf8'); const parsed = JSON.parse(data); subscriptions = Array.isArray(parsed.subscriptions) ? parsed.subscriptions : []; nodes = typeof parsed.nodes === 'string' ? parsed.nodes : ''; } catch { subscriptions = []; nodes = ''; } }
async function saveData(subs, nds) { try { const data = { subscriptions: Array.isArray(subs) ? subs : [], nodes: typeof nds === 'string' ? nds : '' }; await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2)); subscriptions = data.subscriptions; nodes = data.nodes; } catch (error) { throw error; } }

// --- 中间件配置 ---
app.use(session({
    secret: crypto.randomBytes(64).toString('hex'),
    resave: false, // 明确设置 resave
    saveUninitialized: false, // 明确设置 saveUninitialized
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- 认证检查中间件 ---
const checkAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        // 对于API请求，返回401；对于页面请求，重定向
        if (req.path.startsWith('/admin/')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        res.redirect('/login.html');
    }
};

// --- 路由定义 (放在 express.static 之前) ---
app.post('/login', async (req, res) => { /* ... */ });
app.get('/logout', (req, res) => { /* ... */ });
app.get('/', checkAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- 受保护的管理路由 ---
app.get('/get-sub-token', checkAuth, (req, res) => res.json({ token: SUB_TOKEN }));
app.get('/get-apiurl', checkAuth, (req, res) => res.json({ ApiUrl: API_URL }));
app.post('/admin/update-credentials', checkAuth, async (req, res) => { /* ... */ });
app.post('/admin/add-subscription', checkAuth, async (req, res) => { /* ... */ });
app.post('/admin/add-node', checkAuth, async (req, res) => { /* ... */ });
app.post('/admin/delete-subscription', checkAuth, async (req, res) => { /* ... */ });
app.post('/admin/delete-node', checkAuth, async (req, res) => { /* ... */ });
app.get('/admin/data', checkAuth, async (req, res) => { /* ... */ });

// --- 静态文件服务中间件 ---
app.use(express.static(path.join(__dirname, 'public')));

// --- 公开的订阅路由 ---
app.get(`/${SUB_TOKEN}`, async (req, res) => { /* ... */ });

// --- 核心功能函数 ---
function cleanNodeString(str) { /* ... */ }
function tryDecodeBase64(str) { /* ... */ }
async function fetchSubscriptionContent(url) { /* ... */ }
function decodeBase64Content(content) { /* ... */ }
function replaceAddressAndPort(content, cfip, cfport) { /* ... */ }
async function generateMergedSubscription(cfip, cfport) { /* ... */ }

// --- 服务器启动 ---
async function startServer() {
    try {
        await ensureDataDir();
        await initializeCredentialsFile();
        credentials = await loadCredentials();
        await initializeDataFile();
        app.listen(PORT, () => {
            console.log(`Node.js server is running and listening on port ${PORT}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
}

startServer();

// ===============================================================
// === 重新填充所有省略的函数和路由的完整逻辑 ===
// ===============================================================

// 路由
app.post('/login', async (req, res) => { const { username, password } = req.body; const currentCredentials = await loadCredentials(); if (username === currentCredentials.username && password === currentCredentials.password) { req.session.user = { username: username }; res.status(200).json({ message: '登录成功' }); } else { res.status(401).json({ error: '用户名或密码错误' }); } });
app.get('/logout', (req, res) => { req.session.destroy(err => { if (err) return res.redirect('/'); res.clearCookie('connect.sid'); res.redirect('/login.html'); }); });
app.post('/admin/update-credentials', checkAuth, async (req, res) => { try { const { username, password, currentPassword } = req.body; if (!username || !password || !currentPassword) return res.status(400).json({ error: '所有字段都必须填写' }); const currentCredentials = await loadCredentials(); if (currentPassword !== currentCredentials.password) return res.status(400).json({ error: '当前密码错误' }); const newCredentials = { username, password }; if (await saveCredentials(newCredentials)) { credentials = newCredentials; res.json({ message: '密码修改成功' }); } else { res.status(500).json({ error: '保存密码失败' }); } } catch (error) { res.status(500).json({ error: '修改失败: ' + error.message }); } });
app.post('/admin/add-subscription', checkAuth, async (req, res) => { try { const newSubscriptionInput = req.body.subscription?.trim(); if (!newSubscriptionInput) return res.status(400).json({ error: 'Subscription URL is required' }); if (!Array.isArray(subscriptions)) subscriptions = []; const newSubscriptions = newSubscriptionInput.split('\n').map(sub => sub.trim()).filter(sub => sub); const addedSubs = [], existingSubs = []; for (const sub of newSubscriptions) { if (subscriptions.some(existingSub => existingSub.trim() === sub)) existingSubs.push(sub); else { addedSubs.push(sub); subscriptions.push(sub); } } if (addedSubs.length > 0) { await saveData(subscriptions, nodes); const message = addedSubs.length === newSubscriptions.length ? '订阅添加成功' : `成功添加 ${addedSubs.length} 个订阅，${existingSubs.length} 个订阅已存在`; res.status(200).json({ message }); } else { res.status(400).json({ error: '所有订阅已存在' }); } } catch (error) { res.status(500).json({ error: 'Failed to add subscription' }); } });
app.post('/admin/add-node', checkAuth, async (req, res) => { try { const newNode = req.body.node?.trim(); if (!newNode) return res.status(400).json({ error: 'Node is required' }); let nodesList = typeof nodes === 'string' ? nodes.split('\n').map(n => n.trim()).filter(n => n) : []; const newNodes = newNode.split('\n').map(n => n.trim()).filter(n => n).map(n => tryDecodeBase64(n)); const addedNodes = [], existingNodes = []; for (const node of newNodes) { if (nodesList.some(existingNode => existingNode === node)) existingNodes.push(node); else { addedNodes.push(node); nodesList.push(node); } } if (addedNodes.length > 0) { nodes = nodesList.join('\n'); await saveData(subscriptions, nodes); const message = addedNodes.length === newNodes.length ? '节点添加成功' : `成功添加 ${addedNodes.length} 个节点，${existingNodes.length} 个节点已存在`; res.status(200).json({ message }); } else { res.status(400).json({ error: '所有节点已存在' }); } } catch (error) { res.status(500).json({ error: 'Failed to add node' }); } });
app.post('/admin/delete-subscription', checkAuth, async (req, res) => { try { const subsToDelete = req.body.subscription?.trim(); if (!subsToDelete) return res.status(400).json({ error: 'Subscription URL is required' }); if (!Array.isArray(subscriptions)) { subscriptions = []; return res.status(404).json({ error: 'No subscriptions found' }); } const deleteList = subsToDelete.split('\n').map(sub => sub.trim()).filter(sub => sub); const deletedSubs = [], notFoundSubs = []; deleteList.forEach(subToDelete => { const index = subscriptions.findIndex(sub => sub.trim() === subToDelete.trim()); if (index !== -1) { deletedSubs.push(subToDelete); subscriptions.splice(index, 1); } else { notFoundSubs.push(subToDelete); } }); if (deletedSubs.length > 0) { await saveData(subscriptions, nodes); const message = deletedSubs.length === deleteList.length ? '订阅删除成功' : `成功删除 ${deletedSubs.length} 个订阅，${notFoundSubs.length} 个订阅不存在`; res.status(200).json({ message }); } else { res.status(404).json({ error: '未找到要删除的订阅' }); } } catch (error) { res.status(500).json({ error: 'Failed to delete subscription' }); } });
app.post('/admin/delete-node', checkAuth, async (req, res) => { try { const nodesToDelete = req.body.node?.trim(); if (!nodesToDelete) return res.status(400).json({ error: 'Node is required' }); const deleteList = nodesToDelete.split('\n').map(node => cleanNodeString(node)).filter(node => node); let nodesList = nodes.split('\n').map(node => cleanNodeString(node)).filter(node => node); const deletedNodes = [], notFoundNodes = []; deleteList.forEach(nodeToDelete => { const index = nodesList.findIndex(node => cleanNodeString(node) === cleanNodeString(nodeToDelete)); if (index !== -1) { deletedNodes.push(nodeToDelete); nodesList.splice(index, 1); } else { notFoundNodes.push(nodeToDelete); } }); if (deletedNodes.length > 0) { nodes = nodesList.join('\n'); await saveData(subscriptions, nodes); const message = deletedNodes.length === deleteList.length ? '节点删除成功' : `成功删除 ${deletedNodes.length} 个节点，${notFoundNodes.length} 个节点不存在`; res.status(200).json({ message }); } else { res.status(404).json({ error: '未找到要删除的节点' }); } } catch (error) { res.status(500).json({ error: 'Failed to delete node' }); } });
app.get('/admin/data', checkAuth, async (req, res) => { try { const nodesList = typeof nodes === 'string' ? nodes.split('\n').map(n => n.trim()).filter(n => n) : []; res.status(200).json({ subscriptions: Array.isArray(subscriptions) ? subscriptions : [], nodes: nodesList }); } catch (error) { res.status(500).json({ error: 'Failed to fetch data' }); } });
app.get(`/${SUB_TOKEN}`, async (req, res) => { try { const { CFIP: queryCFIP, CFPORT: queryCFPORT } = req.query; if (queryCFIP && queryCFPORT) console.log(`Using custom IP and PORT for this request: ${queryCFIP}:${queryCFPORT}`); await loadData(); const mergedSubscription = await generateMergedSubscription(queryCFIP, queryCFPORT); res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.send(Buffer.from(mergedSubscription).toString('base64')); } catch (error) { console.error(`Error handling /${SUB_TOKEN} route: ${error}`); res.status(500).send('Internal Server Error'); } });

// 函数
function cleanNodeString(str) { return str.replace(/^["'`]+|["'`]+$/g, '').replace(/,+$/g, '').replace(/\s+/g, '').trim(); }
function tryDecodeBase64(str) { const base64Regex = /^[A-Za-z0-9+/=]+$/; try { if (base64Regex.test(str)) { const decoded = Buffer.from(str, 'base64').toString('utf-8'); if (['vmess://', 'vless://', 'trojan://', 'ss://', 'ssr://'].some(prefix => decoded.startsWith(prefix))) return decoded; } return str; } catch { return str; } }
async function fetchSubscriptionContent(url) { try { const response = await axios.get(url, { timeout: 10000 }); return response.data; } catch { return null; } }
function decodeBase64Content(content) { return Buffer.from(content, 'base64').toString('utf-8'); }
function replaceAddressAndPort(content, cfip, cfport) { if (!cfip || !cfport) return content; return content.split('\n').map(line => { line = line.trim(); if (line.startsWith('vmess://')) { try { const decoded = JSON.parse(Buffer.from(line.substring(8), 'base64').toString()); if ((decoded.net === 'ws' || decoded.net === 'xhttp') && decoded.tls === 'tls') { if (!decoded.host || decoded.host !== decoded.add) { decoded.add = cfip; decoded.port = parseInt(cfport, 10); } } return 'vmess://' + Buffer.from(JSON.stringify(decoded)).toString('base64'); } catch (e) { return line; } } if (line.startsWith('vless://') || line.startsWith('trojan://')) { if ((line.includes('type=ws') || line.includes('type=xhttp')) && line.includes('security=tls')) { try { const url = new URL(line); if (!url.searchParams.get('host') || url.searchParams.get('host') !== url.hostname) { return line.replace(/@([\w.-]+):(\d+)/, `@${cfip}:${cfport}`); } } catch (e) { return line; } } } return line; }).join('\n'); }
async function generateMergedSubscription(cfip, cfport) { try { const promises = subscriptions.map(async (subscription) => { const content = await fetchSubscriptionContent(subscription); if (content) { const decoded = decodeBase64Content(content); return replaceAddressAndPort(decoded, cfip, cfport); } return null; }); const resolvedContents = await Promise.all(promises); const mergedContent = resolvedContents.filter(c => c !== null).join('\n'); const updatedNodes = replaceAddressAndPort(nodes, cfip, cfport); return `${mergedContent}\n${updatedNodes}`; } catch (error) { console.error(`Error generating merged subscription: ${error}`); throw error; } }
