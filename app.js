const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const session = require('express-session'); // 使用 Session 进行会话管理

// --- 环境变量与常量定义 ---
const USERNAME = process.env.USERNAME || 'admin';
const PASSWORD = process.env.PASSWORD || 'admin';
const API_URL = process.env.API_URL || 'https://sublink.eooce.com';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const SUB_TOKEN = process.env.SUB_TOKEN || generateRandomString();

let subscriptions = [];
let nodes = '';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');

// 初始化凭证变量 (在启动时加载)
let credentials = {
    username: USERNAME,
    password: PASSWORD
};

// --- 中间件配置 ---

// 1. Session 中间件配置
app.use(session({
    secret: crypto.randomBytes(64).toString('hex'), // 随机密钥，保证安全
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // 如果您部署在HTTPS环境下，请务必设置为 true
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // Cookie 有效期为 24 小时
    }
}));

// 2. 静态文件服务 (必须放在认证路由之前)
app.use(express.static(path.join(__dirname, 'public')));

// 3. JSON 和 URL-encoded Body 解析
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// --- 认证相关 ---

// 认证检查中间件，用于保护需要登录的路由
const checkAuth = (req, res, next) => {
    if (req.session.user) {
        next(); // 用户已登录
    } else {
        res.redirect('/login.html'); // 用户未登录，重定向到登录页
    }
};

// 登录API端点
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const currentCredentials = await loadCredentials(); // 从文件加载最新凭证
    if (username === currentCredentials.username && password === currentCredentials.password) {
        req.session.user = { username: username }; // 登录成功，设置 session
        res.status(200).json({ message: '登录成功' });
    } else {
        res.status(401).json({ error: '用户名或密码错误' });
    }
});

// 登出API端点
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login.html');
    });
});


// --- 受保护的管理路由 ---

app.get('/get-sub-token', checkAuth, (req, res) => {
    res.json({ token: SUB_TOKEN });
});

app.get('/get-apiurl', checkAuth, (req, res) => {
    res.json({ ApiUrl: API_URL });
});

app.post('/admin/update-credentials', checkAuth, async (req, res) => {
    try {
        const { username, password, currentPassword } = req.body;
        if (!username || !password || !currentPassword) {
            return res.status(400).json({ error: '所有字段都必须填写' });
        }
        const currentCredentials = await loadCredentials();
        if (currentPassword !== currentCredentials.password) {
            return res.status(400).json({ error: '当前密码错误' });
        }
        const newCredentials = { username: username, password: password };
        if (await saveCredentials(newCredentials)) {
            credentials = newCredentials; // 更新内存中的凭证
            res.json({ message: '密码修改成功' });
        } else {
            res.status(500).json({ error: '保存密码失败' });
        }
    } catch (error) {
        res.status(500).json({ error: '修改失败: ' + error.message });
    }
});

app.post('/admin/add-subscription', checkAuth, async (req, res) => {
    // 内部逻辑不变
    try {
        const newSubscriptionInput = req.body.subscription?.trim();
        if (!newSubscriptionInput) return res.status(400).json({ error: 'Subscription URL is required' });
        if (!Array.isArray(subscriptions)) subscriptions = [];
        const newSubscriptions = newSubscriptionInput.split('\n').map(sub => sub.trim()).filter(sub => sub);
        const addedSubs = [], existingSubs = [];
        for (const sub of newSubscriptions) {
            if (subscriptions.some(existingSub => existingSub.trim() === sub)) existingSubs.push(sub);
            else { addedSubs.push(sub); subscriptions.push(sub); }
        }
        if (addedSubs.length > 0) {
            await saveData(subscriptions, nodes);
            const message = addedSubs.length === newSubscriptions.length ? '订阅添加成功' : `成功添加 ${addedSubs.length} 个订阅，${existingSubs.length} 个订阅已存在`;
            res.status(200).json({ message });
        } else {
            res.status(400).json({ error: '所有订阅已存在' });
        }
    } catch (error) { res.status(500).json({ error: 'Failed to add subscription' }); }
});

app.post('/admin/add-node', checkAuth, async (req, res) => {
    // 内部逻辑不变
    try {
        const newNode = req.body.node?.trim();
        if (!newNode) return res.status(400).json({ error: 'Node is required' });
        let nodesList = typeof nodes === 'string' ? nodes.split('\n').map(n => n.trim()).filter(n => n) : [];
        const newNodes = newNode.split('\n').map(n => n.trim()).filter(n => n).map(n => tryDecodeBase64(n));
        const addedNodes = [], existingNodes = [];
        for (const node of newNodes) {
            if (nodesList.some(existingNode => existingNode === node)) existingNodes.push(node);
            else { addedNodes.push(node); nodesList.push(node); }
        }
        if (addedNodes.length > 0) {
            nodes = nodesList.join('\n'); await saveData(subscriptions, nodes);
            const message = addedNodes.length === newNodes.length ? '节点添加成功' : `成功添加 ${addedNodes.length} 个节点，${existingNodes.length} 个节点已存在`;
            res.status(200).json({ message });
        } else {
            res.status(400).json({ error: '所有节点已存在' });
        }
    } catch (error) { res.status(500).json({ error: 'Failed to add node' }); }
});

app.post('/admin/delete-subscription', checkAuth, async (req, res) => {
    // 内部逻辑不变
    try {
        const subsToDelete = req.body.subscription?.trim();
        if (!subsToDelete) return res.status(400).json({ error: 'Subscription URL is required' });
        if (!Array.isArray(subscriptions)) { subscriptions = []; return res.status(404).json({ error: 'No subscriptions found' }); }
        const deleteList = subsToDelete.split('\n').map(sub => sub.trim()).filter(sub => sub);
        const deletedSubs = [], notFoundSubs = [];
        deleteList.forEach(subToDelete => {
            const index = subscriptions.findIndex(sub => sub.trim() === subToDelete.trim());
            if (index !== -1) { deletedSubs.push(subToDelete); subscriptions.splice(index, 1); } else { notFoundSubs.push(subToDelete); }
        });
        if (deletedSubs.length > 0) {
            await saveData(subscriptions, nodes);
            const message = deletedSubs.length === deleteList.length ? '订阅删除成功' : `成功删除 ${deletedSubs.length} 个订阅，${notFoundSubs.length} 个订阅不存在`;
            res.status(200).json({ message });
        } else {
            res.status(404).json({ error: '未找到要删除的订阅' });
        }
    } catch (error) { res.status(500).json({ error: 'Failed to delete subscription' }); }
});

app.post('/admin/delete-node', checkAuth, async (req, res) => {
    // 内部逻辑不变
    try {
        const nodesToDelete = req.body.node?.trim();
        if (!nodesToDelete) return res.status(400).json({ error: 'Node is required' });
        const deleteList = nodesToDelete.split('\n').map(node => cleanNodeString(node)).filter(node => node);
        let nodesList = nodes.split('\n').map(node => cleanNodeString(node)).filter(node => node);
        const deletedNodes = [], notFoundNodes = [];
        deleteList.forEach(nodeToDelete => {
            const index = nodesList.findIndex(node => cleanNodeString(node) === cleanNodeString(nodeToDelete));
            if (index !== -1) { deletedNodes.push(nodeToDelete); nodesList.splice(index, 1); } else { notFoundNodes.push(nodeToDelete); }
        });
        if (deletedNodes.length > 0) {
            nodes = nodesList.join('\n'); await saveData(subscriptions, nodes);
            const message = deletedNodes.length === deleteList.length ? '节点删除成功' : `成功删除 ${deletedNodes.length} 个节点，${notFoundNodes.length} 个节点不存在`;
            res.status(200).json({ message });
        } else {
            res.status(404).json({ error: '未找到要删除的节点' });
        }
    } catch (error) { res.status(500).json({ error: 'Failed to delete node' }); }
});

app.get('/admin/data', checkAuth, async (req, res) => {
    try {
        const nodesList = typeof nodes === 'string' ? nodes.split('\n').map(n => n.trim()).filter(n => n) : [];
        res.status(200).json({
            subscriptions: Array.isArray(subscriptions) ? subscriptions : [],
            nodes: nodesList
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});


// --- 公开的API路由 (无需登录) ---
// ... API 路由保持不变，这里省略以保持简洁 ...


// --- 公开的订阅路由 ---
app.get(`/${SUB_TOKEN}`, async (req, res) => {
    try {
        const queryCFIP = req.query.CFIP;
        const queryCFPORT = req.query.CFPORT;
        if (queryCFIP && queryCFPORT) {
            console.log(`Using custom IP and PORT for this request: ${queryCFIP}:${queryCFPORT}`);
        }
        await loadData();
        const mergedSubscription = await generateMergedSubscription(queryCFIP, queryCFPORT);
        const base64Content = Buffer.from(mergedSubscription).toString('base64');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(base64Content);
    } catch (error) {
        console.error(`Error handling /${SUB_TOKEN} route: ${error}`);
        res.status(500).send('Internal Server Error');
    }
});

// --- 首页路由 ---
app.get('/', checkAuth, function(req, res) {
    // 只有通过认证的用户才能访问主管理页面
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- 核心功能函数 ---

async function generateMergedSubscription(cfip, cfport) {
    try {
        const promises = subscriptions.map(async (subscription) => {
            const content = await fetchSubscriptionContent(subscription);
            if (content) {
                const decoded = decodeBase64Content(content);
                return replaceAddressAndPort(decoded, cfip, cfport);
            }
            return null;
        });
        const resolvedContents = await Promise.all(promises);
        const mergedContent = resolvedContents.filter(c => c !== null).join('\n');
        const updatedNodes = replaceAddressAndPort(nodes, cfip, cfport);
        return `${mergedContent}\n${updatedNodes}`;
    } catch (error) {
        console.error(`Error generating merged subscription: ${error}`);
        throw error;
    }
}

function replaceAddressAndPort(content, cfip, cfport) {
    if (!cfip || !cfport) return content;
    return content.split('\n').map(line => {
        line = line.trim();
        if (line.startsWith('vmess://')) {
            try {
                const decoded = JSON.parse(Buffer.from(line.substring(8), 'base64').toString());
                if ((decoded.net === 'ws' || decoded.net === 'xhttp') && decoded.tls === 'tls') {
                    if (!decoded.host || decoded.host !== decoded.add) {
                        decoded.add = cfip;
                        decoded.port = parseInt(cfport, 10);
                    }
                }
                return 'vmess://' + Buffer.from(JSON.stringify(decoded)).toString('base64');
            } catch (e) { return line; }
        }
        if (line.startsWith('vless://') || line.startsWith('trojan://')) {
            if ((line.includes('type=ws') || line.includes('type=xhttp')) && line.includes('security=tls')) {
                try {
                    const url = new URL(line);
                    if (!url.searchParams.get('host') || url.searchParams.get('host') !== url.hostname) {
                        return line.replace(/@([\w.-]+):(\d+)/, `@${cfip}:${cfport}`);
                    }
                } catch (e) { return line; }
            }
        }
        return line;
    }).join('\n');
}

// --- 辅助及工具函数 ---
function generateRandomString() { /* 不变 */ return crypto.createHash('md5').update(`${os.hostname()}-${getSystemUsername()}`).digest('hex').slice(0, 20); }
function getSystemUsername() { /* 不变 */ try { return execSync('whoami').toString().trim().toLowerCase(); } catch { return 'admin'; } }
function cleanNodeString(str) { /* 不变 */ return str.replace(/^["'`]+|["'`]+$/g, '').replace(/,+$/g, '').replace(/\s+/g, '').trim(); }
function tryDecodeBase64(str) { /* 不变 */ const base64Regex = /^[A-Za-z0-9+/=]+$/; try { if (base64Regex.test(str)) { const decoded = Buffer.from(str, 'base64').toString('utf-8'); if (['vmess://', 'vless://', 'trojan://', 'ss://', 'ssr://'].some(prefix => decoded.startsWith(prefix))) return decoded; } return str; } catch { return str; } }
async function fetchSubscriptionContent(url) { /* 不变 */ try { const response = await axios.get(url, { timeout: 10000 }); return response.data; } catch { return null; } }
function decodeBase64Content(content) { /* 不变 */ return Buffer.from(content, 'base64').toString('utf-8'); }

// --- 数据持久化函数 ---
async function ensureDataDir() { try { await fs.access(DATA_DIR); } catch { await fs.mkdir(DATA_DIR, { recursive: true }); } }
async function initializeCredentialsFile() { try { await fs.access(CREDENTIALS_FILE); } catch { await fs.writeFile(CREDENTIALS_FILE, JSON.stringify({ username: USERNAME, password: PASSWORD }, null, 2)); } }
async function initializeDataFile() { try { const data = await fs.readFile(DATA_FILE, 'utf8'); const parsed = JSON.parse(data); subscriptions = parsed.subscriptions || []; nodes = parsed.nodes || ''; } catch { await fs.writeFile(DATA_FILE, JSON.stringify({ subscriptions: [], nodes: '' }, null, 2)); subscriptions = []; nodes = ''; } }
async function loadCredentials() { try { await initializeCredentialsFile(); const data = await fs.readFile(CREDENTIALS_FILE, 'utf8'); return JSON.parse(data); } catch { return { username: USERNAME, password: PASSWORD }; } }
async function saveCredentials(creds) { try { await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2)); return true; } catch { return false; } }
async function loadData() { try { const data = await fs.readFile(DATA_FILE, 'utf8'); const parsed = JSON.parse(data); subscriptions = Array.isArray(parsed.subscriptions) ? parsed.subscriptions : []; nodes = typeof parsed.nodes === 'string' ? parsed.nodes : ''; } catch { subscriptions = []; nodes = ''; } }
async function saveData(subs, nds) { try { const data = { subscriptions: Array.isArray(subs) ? subs : [], nodes: typeof nds === 'string' ? nds : '' }; await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2)); subscriptions = data.subscriptions; nodes = data.nodes; } catch (error) { throw error; } }

// --- 服务器启动 ---
async function startServer() {
    try {
        await ensureDataDir();
        await initializeCredentialsFile();
        credentials = await loadCredentials();
        await initializeDataFile();
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Admin page available at http://localhost:${PORT}/`);
            console.log(`Subscription route is /${SUB_TOKEN}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
}

startServer();
