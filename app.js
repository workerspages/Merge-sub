const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const os = require('os');
const crypto = require('crypto');
// const basicAuth = require('basic-auth'); // 1. [删除] 不再需要 basic-auth
const { execSync } = require('child_process');
const session = require('express-session'); // 2. [新增] 引入 express-session 用于会话管理

const USERNAME = process.env.USERNAME || 'admin';
const PASSWORD = process.env.PASSWORD || 'admin';
const API_URL = process.env.API_URL || 'https://sublink.eooce.com'; // 订阅转换地址
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const SUB_TOKEN = process.env.SUB_TOKEN || generateRandomString();

let CFIP = process.env.CFIP || "time.is";
let CFPORT = process.env.CFPORT || "443";
let subscriptions = [];
let nodes = '';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');

// 检查数据目录
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

// 初始化数据
const initialData = {
    subscriptions: [],
    nodes: ''
};

// 初始化凭证变量
let credentials = {
    username: USERNAME,
    password: PASSWORD
};

// 3. [新增] 配置 Session 中间件
app.use(session({
    secret: crypto.randomBytes(64).toString('hex'), // 使用随机密钥保证安全
    resave: false,
    saveUninitialized: true, // 设置为true以便匿名会话也能工作，重定向时需要
    cookie: {
        secure: false, // 如果您部署在HTTPS环境下，请务必设置为 true
        httpOnly: true, // 增强安全性
        maxAge: 24 * 60 * 60 * 1000 // Cookie 有效期为 24 小时
    }
}));


// 4. [删除] 旧的 Basic Auth 中间件被移除
/*
const auth = async (req, res, next) => { ... };
*/

// 5. [新增] 新的认证检查中间件，用于保护路由
const checkAuth = (req, res, next) => {
    if (req.session.user) {
        // 用户已登录 (session 中存在 user 对象)
        next();
    } else {
        // 用户未登录，重定向到登录页面
        res.redirect('/login.html');
    }
};

// 静态文件服务 (必须放在认证路由之前)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 中间件
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 6. [新增] 处理登录请求的API端点
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    // 从文件加载最新的凭证进行比较
    const currentCredentials = await loadCredentials();
    if (username === currentCredentials.username && password === currentCredentials.password) {
        // 认证成功, 在 session 中记录用户信息
        req.session.user = { username: username };
        res.status(200).json({ message: '登录成功' });
    } else {
        // 认证失败
        res.status(401).json({ error: '用户名或密码错误' });
    }
});

// 7. [新增] 登出路由
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/'); // 如果出错，跳转到首页
        }
        res.clearCookie('connect.sid'); // 清除 session cookie
        res.redirect('/login.html');
    });
});


// 获取 SUB_TOKEN 的路由
app.get('/get-sub-token', checkAuth, (req, res) => { // 8. [修改] 使用新的 checkAuth 中间件
    res.json({ token: SUB_TOKEN });
});

// 获取 API_URL
app.get('/get-apiurl', checkAuth, (req, res) => { // 8. [修改] 使用新的 checkAuth 中间件
    res.json({ ApiUrl: API_URL });
});


// 生成随机20位字符的函数
function generateRandomString() {
    const user = getSystemUsername();
    const hostname = os.hostname();
    const uniqueString = `${hostname}-${user}`;
    const hash = crypto.createHash('md5').update(uniqueString).digest('hex');
    return hash.slice(0, 20);
}

// 获取系统用户名
function getSystemUsername() {
    try {
        return execSync('whoami').toString().trim().toLowerCase();
    } catch (error) {
        console.error('Error getting system username:', error);
        return 'admin';
    }
}

// 初始化凭证文件
async function initializeCredentialsFile() {
    try {
        await fs.access(CREDENTIALS_FILE);
    } catch {
        const initialCredentials = { username: USERNAME, password: PASSWORD };
        await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(initialCredentials, null, 2), 'utf8');
        console.log('Created new credentials file with default credentials');
    }
}

// 加载凭证
async function loadCredentials() {
    try {
        await initializeCredentialsFile();
        const data = await fs.readFile(CREDENTIALS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading credentials:', error);
        return { username: USERNAME, password: PASSWORD };
    }
}

// 保存凭证
async function saveCredentials(newCredentials) {
    try {
        await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(newCredentials, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving credentials:', error);
        return false;
    }
}

// 凭证更新路由
app.post('/admin/update-credentials', checkAuth, async (req, res) => { // 8. [修改] 使用新的 checkAuth 中间件
    try {
        console.log('Received update request:', req.body);
        const { username, password, currentPassword } = req.body;
        if (!username || !password || !currentPassword) {
            return res.status(400).json({ error: '所有字段都必须填写' });
        }
        const currentCredentials = await loadCredentials();
        if (currentPassword !== currentCredentials.password) {
            console.log('Current password verification failed');
            return res.status(400).json({ error: '当前密码错误' });
        }
        const newCredentials = { username: username, password: password };
        const saved = await saveCredentials(newCredentials);
        if (!saved) {
            return res.status(500).json({ error: '保存密码失败' });
        }
        credentials = newCredentials;
        console.log('Credentials updated successfully');
        res.json({ message: '密码修改成功' });
    } catch (error) {
        console.error('Error updating credentials:', error);
        res.status(500).json({ error: '修改失败: ' + error.message });
    }
});

// 9. [删除] 旧的管理页面验证逻辑被移除
/*
app.use(['/admin', '/'], (req, res, next) => { ... });
*/

// 初始化数据文件
async function initializeDataFile() {
    // ... 此函数内部逻辑不变
}

// 读取数据
async function loadData() {
    // ... 此函数内部逻辑不变
}

// 10. [修改] 所有 /admin 路由现在都将使用 checkAuth 保护
// 添加订阅路由
app.post('/admin/add-subscription', checkAuth, async (req, res) => {
    // ... 此函数内部逻辑不变
});

// 添加节点路由
app.post('/admin/add-node', checkAuth, async (req, res) => {
    // ... 此函数内部逻辑不变
});

// 移除特殊字符
function cleanNodeString(str) {
    // ... 此函数内部逻辑不变
}

// 删除订阅路由
app.post('/admin/delete-subscription', checkAuth, async (req, res) => {
    // ... 此函数内部逻辑不变
});

// 删除节点路由
app.post('/admin/delete-node', checkAuth, async (req, res) => {
    // ... 此函数内部逻辑不变
});

// API路由 - 这些通常是公开的，所以不需要 checkAuth
app.post('/api/add-subscriptions', async (req, res) => {
    // ... 此函数内部逻辑不变
});

app.post('/api/add-nodes', async (req, res) => {
    // ... 此函数内部逻辑不变
});

app.delete('/api/delete-subscriptions', async (req, res) => {
    // ... 此函数内部逻辑不变
});

app.delete('/api/delete-nodes', async (req, res) => {
    // ... 此函数内部逻辑不变
});

// 获取数据
app.get('/admin/data', checkAuth, async (req, res) => {
    // ... 此函数内部逻辑不变
});

// 保存数据
async function saveData(subs, nds) {
    // ... 此函数内部逻辑不变
}

// 订阅路由 (公开，无需登录)
app.get(`/${SUB_TOKEN}`, async (req, res) => {
    // ... 此函数内部逻辑不变
});

// 首页路由 - 现在由 checkAuth 保护
app.get('/', checkAuth, function(req, res) {
    // 只有通过 checkAuth 的认证用户才能访问 index.html
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// === 其余函数 (generateMergedSubscription, decodeBase64Content, 等) 保持不变 ===

// ... (省略未改变的函数以保持简洁)
async function generateMergedSubscription() {
    // ... 此处逻辑不变
}
function decodeBase64Content(base64Content) {
    // ... 此处逻辑不变
}
async function fetchSubscriptionContent(subscription) {
    // ... 此处逻辑不变
}
function replaceAddressAndPort(content) {
    // ... 此处逻辑不变
}


// 启动服务器
async function startServer() {
    try {
        await ensureDataDir();
        await initializeCredentialsFile();
        credentials = await loadCredentials(); // 启动时加载一次凭证到内存
        console.log('Credentials initialized and loaded successfully');
        await initializeDataFile();

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Subscription route is /${SUB_TOKEN}`);
            console.log(`Admin page is available at http://localhost:${PORT}/`);
            console.log(`Initial credentials: username=${credentials.username} password=${credentials.password}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
}

startServer();
